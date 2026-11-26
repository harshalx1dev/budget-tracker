export const PALETTE_KEY = "budggyy-palette";

/** Trial theme styles, with three colours each for the swatches. */
export const PALETTES = [
  { id: "passbook", name: "Passbook green and brass", colors: ["#0f2a23", "#15614a", "#d6b36a"] },
  { id: "graphite", name: "Graphite", colors: ["#141516", "#25292d", "#d3d7db"] },
  { id: "paper", name: "Paper white", colors: ["#ffffff", "#f1f1f1", "#0a0a0a"] },
  { id: "lime", name: "Carbon and lime", colors: ["#0c0d0a", "#c8f531", "#f2f3ef"] },
  { id: "tangerine", name: "Tangerine", colors: ["#121010", "#ff6f14", "#ffffff"] },
  { id: "cobalt", name: "Electric cobalt", colors: ["#1832b8", "#ffd53d", "#ffffff"] },
  { id: "brutal", name: "Block print", colors: ["#0f0f0f", "#ffd21f", "#ffffff"] },
  { id: "aurora", name: "Aurora glass", colors: ["#5b2bd9", "#ff8cc8", "#7cf0d4"] },
  { id: "terminal", name: "Terminal", colors: ["#000000", "#4dff88", "#07130a"] },
  { id: "swiss", name: "Swiss red", colors: ["#c8102e", "#ffffff", "#101010"] },
] as const;
