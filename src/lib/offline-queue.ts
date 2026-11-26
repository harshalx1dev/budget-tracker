// Entries typed while offline wait on this device until they can be sent. Every entry carries a unique key and the
// day it was typed, so syncing it late (or twice) adds it once, on the right day.
export type Queued = { ref: string; text: string; asOf: string; at: number };

export type Store = Pick<Storage, "getItem" | "setItem">;
const KEY = "budget-queue-v1";
const MAX = 200;

export function loadQueue(store: Store): Queued[] {
  try {
    const raw = JSON.parse(store.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((q): q is Queued => typeof q?.ref === "string" && typeof q?.text === "string" && typeof q?.asOf === "string") : [];
  } catch { return []; }
}

function save(store: Store, q: Queued[]) {
  try { store.setItem(KEY, JSON.stringify(q.slice(-MAX))); } catch { /* storage full or blocked: the entry is simply not queued */ }
}

export function enqueue(store: Store, item: Queued): Queued[] {
  const q = [...loadQueue(store).filter((x) => x.ref !== item.ref), item];
  save(store, q);
  return loadQueue(store);
}

export function dequeue(store: Store, ref: string): Queued[] {
  save(store, loadQueue(store).filter((x) => x.ref !== ref));
  return loadQueue(store);
}

/** True for a failed fetch (offline, server unreachable), false for an answer from the server. */
export const isNetworkError = (e: unknown) => e instanceof TypeError || (e instanceof Error && /fetch|network|load failed/i.test(e.message));
