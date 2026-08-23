import { DEFAULT_SETTINGS, FOLDER_NAME, STORAGE_KEYS } from "../../shared/constants.js";

export function installChromeMock({
  settings = {},
  records = {},
  deleted = [],
  folderId = "folder-1",
  folderChildren = []
} = {}) {
  const store = {
    [STORAGE_KEYS.SETTINGS]: { ...DEFAULT_SETTINGS, onboardingCompleted: true, ...settings },
    [STORAGE_KEYS.RECORDS]: { ...records },
    [STORAGE_KEYS.DELETED]: [...deleted],
    [STORAGE_KEYS.FOLDER_ID]: folderId
  };

  let nextId = 1;
  let createCalls = 0;
  const children = folderChildren.map((child) => ({ ...child }));
  const nodes = {
    [folderId]: { id: folderId, title: FOLDER_NAME }
  };
  for (const child of children) nodes[child.id] = child;

  globalThis.chrome = {
    storage: {
      local: {
        async get(key) {
          return { [key]: store[key] };
        },
        async set(patch) {
          Object.assign(store, patch);
        }
      }
    },
    bookmarks: {
      async get(id) {
        const node = nodes[id];
        if (!node) throw new Error("Bookmark not found");
        return [node];
      },
      async getChildren() {
        return children.map((child) => ({ ...child }));
      },
      async search({ title }) {
        return Object.values(nodes).filter((node) => node.title === title && !node.url);
      },
      async create({ parentId, title, url }) {
        createCalls += 1;
        const id = `bm-${nextId++}`;
        const node = { id, title, url, parentId };
        nodes[id] = node;
        if (parentId) children.push(node);
        return { ...node };
      }
    }
  };

  return {
    store,
    createCalls: () => createCalls,
    folderSize: () => children.filter((child) => Boolean(child.url)).length
  };
}
