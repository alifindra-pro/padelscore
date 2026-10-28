import { OfflineMatch } from "../../../packages/core/src";
const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("padel-offline-v2", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("matches", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
export async function saveMatch(match: OfflineMatch) {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("matches", "readwrite");
      tx.objectStore("matches").put(match);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function loadMatch(id: string): Promise<OfflineMatch | undefined> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const req = db
        .transaction("matches", "readonly")
        .objectStore("matches")
        .get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
export function deviceId() {
  let id = localStorage.getItem("padel-device-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("padel-device-id", id);
  }
  return id;
}
