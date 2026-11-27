/** How the want-to-buy list is narrowed and ordered. The choices live in the address, so a view can be bookmarked. */
export const SORTS = [
  ["plan", "Buying plan"],
  ["afford", "Easiest to afford"],
  ["price-up", "Price: low to high"],
  ["price-down", "Price: high to low"],
  ["priority", "Priority"],
  ["name", "Name"],
] as const;
export const KINDS = [["need", "Must have"], ["want", "Nice to have"], ["desire", "Someday"]] as const;
export const PRIORITIES = [["1", "High"], ["2", "Medium"], ["3", "Low"]] as const;
export const WHENS = [["now", "Can buy now"], ["later", "Can buy later"], ["none", "No date yet"]] as const;

type Sort = (typeof SORTS)[number][0];
export type ViewItem = { title: string; priceMinor: number; month: string | null; type: string; priority: number };
export type View = { sort: Sort; kind: string; priority: string; when: string };

const pick = (v: unknown, from: readonly (readonly [string, string])[]) => (from.some(([k]) => k === v) ? (v as string) : "");

/** Reads the address; anything unknown falls back to the plain list. */
export function readView(q: Record<string, string | string[] | undefined>): View {
  return { sort: (pick(q.sort, SORTS) || "plan") as Sort, kind: pick(q.kind, KINDS), priority: pick(q.priority, PRIORITIES), when: pick(q.when, WHENS) };
}

const RANK: Record<string, number> = { need: 0, want: 1, desire: 2 };
const date = (i: ViewItem) => i.month ?? "9999";

/** `items` arrive in the order the plan allocates money (kind, priority, price); ties keep that order. */
export function viewWishes<T extends ViewItem>(items: T[], view: View, thisMonth: string): T[] {
  const shown = items.filter((i) =>
    (!view.kind || i.type === view.kind) &&
    (!view.priority || String(i.priority) === view.priority) &&
    (!view.when || (view.when === "none" ? !i.month : view.when === "now" ? i.month === thisMonth : Boolean(i.month) && i.month !== thisMonth)));
  const by: Record<Sort, (a: T, b: T) => number> = {
    plan: (a, b) => date(a).localeCompare(date(b)),
    // soonest first, and the cheaper of two that share a date (or have none)
    afford: (a, b) => date(a).localeCompare(date(b)) || a.priceMinor - b.priceMinor,
    "price-up": (a, b) => a.priceMinor - b.priceMinor,
    "price-down": (a, b) => b.priceMinor - a.priceMinor,
    priority: (a, b) => a.priority - b.priority || RANK[a.type] - RANK[b.type],
    name: (a, b) => a.title.localeCompare(b.title),
  };
  return shown.sort(by[view.sort]);
}
