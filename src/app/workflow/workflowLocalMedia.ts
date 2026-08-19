export const WORKFLOW_IDB_MEDIA_PREFIX = "idb:";

const DB_NAME = "youry-workflow-local-media-v1";
const STORE = "files";

export function isWorkflowIdbMediaUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && url.trim().startsWith(WORKFLOW_IDB_MEDIA_PREFIX);
}

function mediaIdFromUrl(url: string): string {
  return url.trim().slice(WORKFLOW_IDB_MEDIA_PREFIX.length).trim();
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable in this browser."));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open local media storage."));
  });
}

/** Persist a file on this device and return a short pointer safe to keep in localStorage. */
export async function putWorkflowLocalMedia(blob: Blob): Promise<string> {
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `m-${Date.now()}`;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).put(blob, id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("Could not save media on this device."));
    tx.onerror = () => reject(tx.error ?? new Error("Could not save media on this device."));
  });
  db.close();
  return `${WORKFLOW_IDB_MEDIA_PREFIX}${id}`;
}

export async function getWorkflowLocalMedia(url: string): Promise<Blob | null> {
  if (!isWorkflowIdbMediaUrl(url)) return null;
  const id = mediaIdFromUrl(url);
  if (!id) return null;
  const db = await openDb();
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => {
        const value = req.result;
        resolve(value instanceof Blob ? value : null);
      };
      req.onerror = () => reject(req.error ?? new Error("Could not read saved media."));
    });
  } finally {
    db.close();
  }
}
