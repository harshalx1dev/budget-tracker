import { test } from "node:test";
import assert from "node:assert/strict";
import { dequeue, enqueue, isNetworkError, loadQueue } from "./offline-queue";

const fake = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
const item = (ref: string) => ({ ref, text: `chai 20 ${ref}`, asOf: "2026-11-26", at: 1 });

test("queue: keeps order, replaces a repeated key, removes on success", () => {
  const s = fake();
  enqueue(s, item("a")); enqueue(s, item("b")); enqueue(s, item("a"));
  assert.deepEqual(loadQueue(s).map((q) => q.ref), ["b", "a"]);
  assert.deepEqual(dequeue(s, "b").map((q) => q.ref), ["a"]);
});

test("queue: survives corrupt storage and drops malformed rows", () => {
  assert.deepEqual(loadQueue({ getItem: () => "{not json", setItem: () => {} }), []);
  assert.deepEqual(loadQueue({ getItem: () => JSON.stringify([{ ref: 1 }, item("ok")]), setItem: () => {} }).map((q) => q.ref), ["ok"]);
  assert.doesNotThrow(() => enqueue({ getItem: () => null, setItem: () => { throw new Error("quota"); } }, item("x")));
});

test("queue: only the oldest 200 are kept", () => {
  const s = fake();
  for (let i = 0; i < 205; i++) enqueue(s, item(`r${i}`));
  const q = loadQueue(s);
  assert.equal(q.length, 200);
  assert.equal(q[0].ref, "r5");
});

test("network errors are told apart from server answers", () => {
  assert.equal(isNetworkError(new TypeError("Failed to fetch")), true);
  assert.equal(isNetworkError(new Error("Load failed")), true);
  assert.equal(isNetworkError(new Error("amount too large")), false);
});
