# Playground assets and references

Everything in the console's 3D playground is original procedural Kestrel work generated at runtime: geometry, canvas textures (court rubber, lawn, sand, hopscotch, bark, leaf clumps, chalkboard diagrams) and the sky gradient. No image, model or video files are loaded for the environment.

Techniques adapted, not copied:

- `Foliage.tsx` follows Bruno Simon's folio-2025 `sources/Game/World/Foliage.js` (MIT, revision 41046b5): camera-facing alpha-cut leaf cards scattered in a sphere, normals bent 85% toward the sphere normal. The leaf texture is drawn here; Folio's `foliageSDF` image is not used.
- `Grass.tsx` follows folio-2025 `sources/Game/World/Grass.js` (MIT): one triangle per blade on a jittered grid, up normals, tip-only wind. Rebuilt for WebGL with CPU-built blades.
- Bruno Simon's my-room-in-3d (revision 5d00b3f) was studied for authored geometry, baked lighting and isolated animated objects; nothing from it is used.

Interface: tokens and component styles come from the owner's General Intelligence Company design-system artifact (a capture of generalintelligencecompany.com). Inter is self-hosted through `@fontsource-variable/inter` (SIL Open Font License).

The previous Botanical workshop's static AO maps and bake script were removed with the room.
