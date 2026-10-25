import type { PropSpec } from "@kestrel/contracts";
import {
  DEFAULT_POSE,
  JOINT_NAMES,
  ROOM_HALF,
  SPAWN,
  TIMESTEP,
  WALL_H,
  WALL_T,
} from "./constants";

export type SceneXml = {
  xml: string;
  /** Collision mesh files the compiler will look up as `assets/<file>`. */
  meshFiles: string[];
  /** Props in qpos order, with their joint kind. */
  dynamicProps: PropSpec[];
};

const fmt = (v: number[]) => v.map((n) => +n.toFixed(6)).join(" ");

/** Wedge and triangle props compile to inline convex meshes. */
function meshVertices(p: PropSpec): number[] | null {
  const s = p.shape;
  if (s.type === "triangle") {
    const [a, b] = s.legs;
    const h = s.height;
    return [0, 0, 0, a, 0, 0, 0, b, 0, 0, 0, h, a, 0, h, 0, b, h];
  }
  if (s.type === "wedge") {
    const w = s.width / 2;
    const l = s.length / 2;
    const h = s.height;
    return [-w, -l, 0, w, -l, 0, 0, -l, h, -w, l, 0, w, l, 0, 0, l, h];
  }
  return null;
}

/**
 * Merge the robot MJCF with a room and a prop kit into one model.
 * Robot qpos stays first (freejoint + 14 hinges), then every non-fixed prop
 * in body-tree order, so the STAND keyframe can be written deterministically.
 */
export function buildSceneXml(robotXml: string, props: PropSpec[]): SceneXml {
  const doc = new DOMParser().parseFromString(robotXml, "text/xml");
  const root = doc.documentElement;
  const worldbody = doc.querySelector("worldbody")!;
  const asset = doc.querySelector("asset")!;
  const el = (tag: string, attrs: Record<string, string>) => {
    const e = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };

  // Visual geoms carry no dynamics (every body has an explicit inertial),
  // so stripping them leaves only the collision meshes to load.
  for (const g of [...doc.querySelectorAll('geom[class="visual"]')]) g.remove();
  const used = new Set(
    [...doc.querySelectorAll("geom[mesh]")].map((g) => g.getAttribute("mesh")),
  );
  for (const m of [...doc.querySelectorAll("asset > mesh")]) {
    const name = m.getAttribute("name") ?? m.getAttribute("file")!.replace(/\.stl$/i, "");
    if (!used.has(name)) m.remove();
  }
  const meshFiles = [...doc.querySelectorAll("asset > mesh")].map(
    (m) => m.getAttribute("file")!,
  );
  // Robot joints in document order, before any prop joint is added.
  const robotJoints = [...doc.querySelectorAll("body > joint")].map((j) =>
    j.getAttribute("name")!,
  );

  root.appendChild(el("option", { timestep: String(TIMESTEP) }));
  worldbody.appendChild(
    el("geom", { name: "floor", type: "plane", size: "0 0 0.05", pos: "0 0 0" }),
  );
  const ht = WALL_T / 2;
  const hh = WALL_H / 2;
  const off = ROOM_HALF + ht;
  const span = ROOM_HALF + WALL_T;
  for (const [name, pos, size] of [
    ["wall_px", [off, 0, hh], [ht, span, hh]],
    ["wall_nx", [-off, 0, hh], [ht, span, hh]],
    ["wall_py", [0, off, hh], [span, ht, hh]],
    ["wall_ny", [0, -off, hh], [span, ht, hh]],
  ] as const) {
    worldbody.appendChild(
      el("geom", { name, type: "box", pos: fmt([...pos]), size: fmt([...size]) }),
    );
  }

  const bodies = new Map<string, Element>();
  for (const p of props) {
    const geom: Record<string, string> = {
      name: `${p.id}_geom`,
      rgba: "1 1 1 1",
      friction: p.role === "tile" ? "0.35 0.005 0.0001" : "0.6 0.005 0.0001",
    };
    const verts = meshVertices(p);
    if (verts) {
      asset.appendChild(el("mesh", { name: `${p.id}_mesh`, vertex: fmt(verts) }));
      geom.type = "mesh";
      geom.mesh = `${p.id}_mesh`;
    } else if (p.shape.type === "box") {
      geom.type = "box";
      geom.size = fmt(p.shape.size.map((v) => v / 2));
    }
    // Fixed top-level props are static; anything that moves, or rides on
    // something that moves, needs its real mass.
    if (p.joint !== "fixed" || p.parent) geom.mass = String(p.mass);
    const body = el("body", {
      name: p.id,
      pos: fmt(p.pos),
      euler: `0 0 ${+p.yaw.toFixed(6)}`,
    });
    if (p.joint === "free") body.appendChild(el("freejoint", { name: `${p.id}_free` }));
    if (p.joint === "hinge" || p.joint === "slide")
      body.appendChild(
        el("joint", {
          name: `${p.id}_${p.joint}`,
          type: p.joint,
          axis: fmt(p.axis ?? [1, 0, 0]),
          ...(p.anchor ? { pos: fmt(p.anchor) } : {}),
          range: fmt(p.range ?? [-0.35, 0.35]),
          damping: String(p.damping ?? 0.002),
          // A rail has a little friction, so a weight stops where it is left.
          ...(p.joint === "slide" ? { frictionloss: "0.05", armature: "0.01" } : {}),
        }),
      );
    body.appendChild(el("geom", geom));
    const parent = p.parent ? bodies.get(p.parent) : worldbody;
    if (!parent) throw new Error(`Prop ${p.id} is mounted on ${p.parent}, which must be listed first.`);
    parent.appendChild(body);
    bodies.set(p.id, body);
  }

  // MuJoCo already ignores contacts between a body and its parent; a prop
  // also never collides with anything further up what it is mounted on.
  const byId = new Map(props.map((p) => [p.id, p]));
  const contact = doc.createElement("contact");
  for (const p of props) {
    for (let up = byId.get(p.parent ?? "")?.parent; up; up = byId.get(up)?.parent)
      contact.appendChild(el("exclude", { body1: p.id, body2: up }));
  }
  if (contact.childNodes.length) root.appendChild(contact);

  // MuJoCo orders joints depth-first through the body tree.
  const tree = (parent?: string): PropSpec[] =>
    props.filter((p) => p.parent === parent).flatMap((p) => [p, ...tree(p.id)]);
  const dynamicProps = tree().filter((p) => p.joint !== "fixed");

  // STAND keyframe: robot spawn pose, then each dynamic prop at rest.
  const poseByName = new Map(JOINT_NAMES.map((n, i) => [n, DEFAULT_POSE[i]!]));
  const qpos: number[] = [SPAWN[0], SPAWN[1], 0.12, 1, 0, 0, 0];
  for (const j of robotJoints) qpos.push(poseByName.get(j as never) ?? 0);
  for (const p of dynamicProps) {
    if (p.joint === "free") {
      const h = p.yaw / 2;
      qpos.push(...p.pos, Math.cos(h), 0, 0, Math.sin(h));
    } else qpos.push(p.rest ?? 0);
  }
  const kf = doc.createElement("keyframe");
  kf.appendChild(el("key", { name: "STAND", qpos: fmt(qpos), ctrl: fmt([...DEFAULT_POSE]) }));
  root.appendChild(kf);

  return { xml: new XMLSerializer().serializeToString(doc), meshFiles, dynamicProps };
}
