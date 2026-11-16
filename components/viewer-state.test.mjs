import assert from "node:assert/strict";
import test from "node:test";
import { acceptLink, restoreViewer } from "./viewer-state.ts";

const initial = () => ({ token: null, ready: false, link: undefined });

test("a new viewer link replaces persisted viewer through navigation", () => {
  let state = restoreViewer(initial(), "viewer-A");
  state = acceptLink(state, "viewer-B");
  state = acceptLink(state, undefined);
  assert.equal(state.token, "viewer-B");
  assert.equal(state.ready, true);
});

test("a cold-start link wins over a delayed storage read", async () => {
  let resolve;
  const storage = new Promise(r => { resolve = r; });
  let state = acceptLink(initial(), "viewer-B");
  const read = storage.then(token => { state = restoreViewer(state, token); });
  resolve("viewer-A");
  await read;
  state = acceptLink(state, undefined);
  assert.equal(state.token, "viewer-B");
});

test("a new link arriving during hydration wins over storage", () => {
  let state = initial();
  state = acceptLink(state, "viewer-B");
  state = restoreViewer(state, "viewer-A");
  assert.equal(state.token, "viewer-B");
});

test("an explicitly empty link never falls back to the previous viewer", () => {
  let state = restoreViewer(initial(), "viewer-A");
  state = acceptLink(state, "");
  state = restoreViewer(state, "viewer-A");
  assert.equal(state.token, null);
});

test("no link restores storage, including missing storage", () => {
  assert.equal(restoreViewer(initial(), "viewer-A").token, "viewer-A");
  assert.deepEqual(restoreViewer(initial(), null), { token: null, ready: true, link: undefined });
});
