import assert from "node:assert/strict";
import test from "node:test";

type Store = Map<string, string>;

function installLocalStorage(store: Store) {
  const localStorage = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    get length() {
      return store.size;
    },
  };
  (globalThis as { window?: unknown; localStorage?: typeof localStorage }).window = globalThis;
  (globalThis as { localStorage?: typeof localStorage }).localStorage = localStorage;
}

const USER_SCOPE = "u:11111111-1111-1111-1111-111111111111";
const SPACE_ID = "space-old-1";
const PROJECT = {
  v: 1,
  activePageId: "p1",
  pages: [{ id: "p1", name: "Page 1", nodes: [{ id: "n1", type: "stickyNote", position: { x: 0, y: 0 }, data: { text: "kept" } }], edges: [] }],
  onboardingDismissed: true,
};

test("loadSpacesIndex(guest) copies leftover signed-in workflows into guest", async () => {
  const store = new Map<string, string>();
  installLocalStorage(store);
  store.set(
    `youry-workflow-spaces-index-v2:${USER_SCOPE}`,
    JSON.stringify({
      v: 1,
      spaces: [{ id: SPACE_ID, name: "Old pipeline", updatedAt: 1_700_000_000_000 }],
    }),
  );
  store.set(`youry-workflow-space-v2:${USER_SCOPE}:${SPACE_ID}`, JSON.stringify(PROJECT));

  const { loadSpacesIndex, loadProjectForSpace } = await import("./workflowSpacesStorage.ts");
  const idx = loadSpacesIndex("guest");
  assert.equal(idx.spaces.length, 1);
  assert.equal(idx.spaces[0].id, SPACE_ID);
  assert.equal(idx.spaces[0].name, "Old pipeline");
  const project = loadProjectForSpace("guest", SPACE_ID);
  assert.equal(project.pages[0].nodes.length, 1);
  assert.equal((project.pages[0].nodes[0].data as { text?: string }).text, "kept");
});

test("loadSpacesIndex(guest) keeps existing guest spaces and does not overwrite them", async () => {
  const store = new Map<string, string>();
  installLocalStorage(store);
  const guestProject = {
    ...PROJECT,
    pages: [{ id: "p1", name: "Page 1", nodes: [{ id: "n1", type: "stickyNote", position: { x: 0, y: 0 }, data: { text: "guest" } }], edges: [] }],
  };
  store.set(
    "youry-workflow-spaces-index-v2:guest",
    JSON.stringify({
      v: 1,
      spaces: [{ id: SPACE_ID, name: "Guest copy", updatedAt: 1 }],
    }),
  );
  store.set(`youry-workflow-space-v2:guest:${SPACE_ID}`, JSON.stringify(guestProject));
  store.set(
    `youry-workflow-spaces-index-v2:${USER_SCOPE}`,
    JSON.stringify({
      v: 1,
      spaces: [{ id: SPACE_ID, name: "Old pipeline", updatedAt: 9 }],
    }),
  );
  store.set(`youry-workflow-space-v2:${USER_SCOPE}:${SPACE_ID}`, JSON.stringify(PROJECT));

  const { loadSpacesIndex, loadProjectForSpace } = await import("./workflowSpacesStorage.ts");
  const idx = loadSpacesIndex("guest");
  assert.equal(idx.spaces.length, 1);
  assert.equal(idx.spaces[0].name, "Guest copy");
  const project = loadProjectForSpace("guest", SPACE_ID);
  assert.equal((project.pages[0].nodes[0].data as { text?: string }).text, "guest");
});

test("createSpace still appears in the guest index when preview payloads exceed quota", async () => {
  const store = new Map<string, string>();
  const localStorage = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      const next = String(value);
      // Simulate a full index (previews + new space) overflowing quota.
      if (next.includes("Brand new") && next.includes("data:image")) {
        throw new Error("QuotaExceededError");
      }
      store.set(key, next);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    get length() {
      return store.size;
    },
  };
  (globalThis as { window?: unknown; localStorage?: typeof localStorage }).window = globalThis;
  (globalThis as { localStorage?: typeof localStorage }).localStorage = localStorage;

  store.set(
    "youry-workflow-spaces-index-v2:guest",
    JSON.stringify({
      v: 1,
      spaces: [
        {
          id: SPACE_ID,
          name: "Old pipeline",
          updatedAt: 1,
          previewDataUrl: `data:image/svg+xml;charset=utf-8,${"A".repeat(6_000)}`,
        },
      ],
    }),
  );

  const { createSpace, loadSpacesIndex } = await import("./workflowSpacesStorage.ts");
  const meta = createSpace("guest", "Brand new");
  assert.ok(meta);
  const idx = loadSpacesIndex("guest");
  assert.equal(idx.spaces.some((s) => s.id === meta!.id && s.name === "Brand new"), true);
});

test("saveProjectForSpace keeps indexedDB image pointers instead of stripping them", async () => {
  const store = new Map<string, string>();
  installLocalStorage(store);
  const { saveProjectForSpace, loadProjectForSpace } = await import("./workflowSpacesStorage.ts");
  const project = {
    v: 1 as const,
    activePageId: "p1",
    pages: [
      {
        id: "p1",
        name: "Page 1",
        nodes: [
          {
            id: "n1",
            type: "imageRef",
            position: { x: 0, y: 0 },
            data: {
              label: "Photo",
              imageUrl: "idb:media-1",
              source: "upload",
              mediaKind: "image",
            },
          },
        ],
        edges: [],
      },
    ],
  };
  saveProjectForSpace("guest", "space-media", project as never);
  const loaded = loadProjectForSpace("guest", "space-media");
  assert.equal((loaded.pages[0].nodes[0].data as { imageUrl?: string }).imageUrl, "idb:media-1");
});
