import { withDb, type StoredIdentity } from "./db";

const KEY = "current";

export async function saveIdentity(identity: StoredIdentity): Promise<void> {
  const record: StoredIdentity = {
    userId: identity.userId,
    role: identity.role,
    locationId: identity.locationId,
    confirmedAt: identity.confirmedAt,
  };
  await withDb((db) => db.put("identity", record, KEY).then(() => undefined), { value: undefined });
}

export async function getIdentity(): Promise<StoredIdentity | null> {
  return withDb(async (db) => (await db.get("identity", KEY)) ?? null, { value: null });
}

/** Cierre de sesión: borra identidad y copias. La cola NO se toca: son ventas cobradas. */
export async function clearOnSignOut(): Promise<void> {
  await withDb(async (db) => {
    const tx = db.transaction(["identity", "snapshots"], "readwrite");
    await Promise.all([tx.objectStore("identity").clear(), tx.objectStore("snapshots").clear(), tx.done]);
  }, { value: undefined });
}
