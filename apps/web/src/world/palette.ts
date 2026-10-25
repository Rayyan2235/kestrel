// Scene materials, mirrored from styles/tokens.css. Owner palette: Nox Noir,
// Royal Amethyst, Steel Mist, with soft white for lit surfaces.
export const palette = {
  sky: "#f1f1ef",
  ground: "#dedede",
  groundLine: "#cfcfcf",
  groundEdge: "#c4c4c6",
  white: "#f7f7f5",
  steel: "#cfcfcf",
  steelDark: "#a9a9ad",
  noir: "#141414",
  noirSoft: "#2a2a2c",
  amethyst: "#7e49b3",
  amethystSoft: "#b79ad6",
  ink: "#141414",
  shell: "#f7f7f5",
  visor: "#141414",
  eye: "#e6dcf5",
  pip: "#3a3a3c",
  nova: "#7e49b3",
} as const;

export const botColor = { pip: palette.pip, nova: palette.nova } as const;
