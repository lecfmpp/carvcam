/**
 * Browser storage keys that were renamed. Older builds saved the projects, the workshop and the
 * assistant key under other names; on startup (before the zustand stores read their state) each
 * old entry is copied to its new name and removed, so nothing is lost.
 */
export const RENAMED_STORAGE_KEYS: readonly (readonly [from: string, to: string])[] = [
  ["gsender-design", "carvcam-design"],
  ["gsender-workshop", "carvcam-workshop"],
  ["gsender-anthropic-key", "carvcam-anthropic-key"],
];

/** Moves every old key to its new name. A value already under the new name is kept. Never throws. */
export function migrateStorageKeys(storage: Storage | undefined = safeLocalStorage()): void {
  if (!storage) return;
  for (const [from, to] of RENAMED_STORAGE_KEYS) {
    try {
      const old = storage.getItem(from);
      if (old === null) continue;
      if (storage.getItem(to) === null) storage.setItem(to, old);
      storage.removeItem(from);
    } catch {
      /* storage full or blocked: keep the old entry and try again next start */
    }
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

// Runs once, the first time a module imports this file (main.tsx and the persisted stores do).
migrateStorageKeys();
