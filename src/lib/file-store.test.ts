import assert from 'node:assert/strict';
import { test } from 'vitest';

import { createFileStore, type FileBackend } from './file-store.ts';

function setup(options: { renameOverwrites?: boolean; legacy?: Record<string, string> } = {}) {
  const files = new Map<string, string>();
  const legacy = new Map(Object.entries(options.legacy ?? {}));
  const writes: string[] = [];
  const backend: FileBackend = {
    read: async (name) => files.get(name) ?? null,
    write: async (name, data) => void (writes.push(name), files.set(name, data)),
    rename: async (from, to) => {
      if (!files.has(from)) throw new Error('no such file');
      if (files.has(to) && options.renameOverwrites === false) throw new Error('target exists');
      files.set(to, files.get(from)!);
      files.delete(from);
    },
    remove: async (name) => void files.delete(name),
  };
  const store = createFileStore(backend, { get: async (k) => legacy.get(k) ?? null, remove: async (k) => void legacy.delete(k) });
  return { store, files, legacy, writes };
}

test('a value that was only in Preferences moves to a file once, then comes from the file', async () => {
  const { store, files, legacy } = setup({ legacy: { 'log:https://x:1': '{"sessions":[1]}' } });
  assert.equal(await store.get('log:https://x:1'), '{"sessions":[1]}');
  assert.deepEqual([...files.values()], ['{"sessions":[1]}']);
  assert.equal(legacy.size, 0);
  assert.equal(await store.get('log:https://x:1'), '{"sessions":[1]}');
});

test('Preferences keep the value when the file cannot be read back', async () => {
  const { legacy } = setup({ legacy: { k: 'v' } });
  const broken = createFileStore(
    { read: async () => null, write: async () => {}, rename: async () => {}, remove: async () => {} },
    { get: async (k) => legacy.get(k) ?? null, remove: async (k) => void legacy.delete(k) },
  );
  assert.equal(await broken.get('k'), 'v');
  assert.equal(legacy.get('k'), 'v');
});

test('nothing stored gives null', async () => {
  assert.equal(await setup().store.get('k'), null);
});

test('set writes a temp file and moves it over the old one', async () => {
  const { store, files } = setup();
  await store.set('k', 'one');
  await store.set('k', 'two');
  assert.deepEqual([...files.entries()], [['k.json', 'two']]);
});

test('set works where rename refuses an existing target', async () => {
  const { store, files } = setup({ renameOverwrites: false });
  await store.set('k', 'one');
  await store.set('k', 'two');
  assert.deepEqual([...files.entries()], [['k.json', 'two']]);
});

test('an unfinished write leaves the temp file, which is read when the file is missing', async () => {
  const { store, files } = setup();
  files.set('k.json.tmp', 'complete');
  assert.equal(await store.get('k'), 'complete');
});

test('the file wins over a leftover temp file', async () => {
  const { store, files } = setup();
  files.set('k.json', 'good');
  files.set('k.json.tmp', 'half written');
  assert.equal(await store.get('k'), 'good');
});

test('a burst of changes writes the newest value, and a read sees it at once', async () => {
  const { store, files, writes } = setup();
  const done = [store.set('k', '1'), store.set('k', '2'), store.set('k', '3')];
  assert.equal(await store.get('k'), '3');
  await Promise.all(done);
  assert.equal(files.get('k.json'), '3');
  assert.equal(writes.length, 1);
});

test('keys with slashes and colons make a safe file name', async () => {
  const { store, files } = setup();
  await store.set('log:https://host/x:7', 'v');
  assert.deepEqual([...files.keys()], ['log%3Ahttps%3A%2F%2Fhost%2Fx%3A7.json']);
});

test('remove deletes the file, the temp file and the old Preferences value', async () => {
  const { store, files, legacy } = setup({ legacy: { k: 'old' } });
  files.set('k.json', 'v');
  files.set('k.json.tmp', 'v');
  await store.remove('k');
  assert.equal(files.size + legacy.size, 0);
  assert.equal(await store.get('k'), null);
});
