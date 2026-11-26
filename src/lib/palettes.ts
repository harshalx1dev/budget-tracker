export const PALETTE_KEY = "budggyy-palette";

/** Trial colour themes: sidebar, action colour and highlight, for the swatches. */
export const PALETTES = [
  { id: "passbook", name: "Passbook green and brass", colors: ["#0f2a23", "#15614a", "#d6b36a"] },
  { id: "copper", name: "Ink and copper", colors: ["#131c33", "#1f3f7a", "#e0996b"] },
  { id: "oxblood", name: "Oxblood and gold", colors: ["#2c0f16", "#7a1f35", "#dcb862"] },
  { id: "indigo", name: "Indigo and marigold", colors: ["#1c1745", "#3d36a3", "#f2b544"] },
  { id: "harbour", name: "Slate and bank blue", colors: ["#16222d", "#175a9e", "#93c9f2"] },
  { id: "espresso", name: "Espresso and caramel", colors: ["#241711", "#874617", "#e6ab68"] },
  { id: "rose", name: "Charcoal and rose gold", colors: ["#1b1a1e", "#8d3f55", "#e3ab9b"] },
  { id: "graphite", name: "Graphite, no colour", colors: ["#141516", "#25292d", "#d3d7db"] },
] as const;
