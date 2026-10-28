import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { OfflineMatch } from "../../packages/core/src";
const db = async () => {
  const database = await SQLite.openDatabaseAsync("padel-score.db");
  await database.execAsync(
    "CREATE TABLE IF NOT EXISTS matches (id TEXT PRIMARY KEY, data TEXT NOT NULL)",
  );
  return database;
};
export async function saveMatch(match: OfflineMatch) {
  await (
    await db()
  ).runAsync(
    "INSERT INTO matches(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
    match.id,
    JSON.stringify(match),
  );
}
export async function loadMatch(id: string) {
  const row = await (
    await db()
  ).getFirstAsync<{ data: string }>("SELECT data FROM matches WHERE id=?", id);
  return row ? (JSON.parse(row.data) as OfflineMatch) : undefined;
}
export async function cachedMatches() {
  const rows = await (
    await db()
  ).getAllAsync<{ data: string }>("SELECT data FROM matches");
  return rows.map((r) => JSON.parse(r.data) as OfflineMatch);
}
export async function deviceId() {
  let id = await SecureStore.getItemAsync("padel-device");
  if (!id) {
    id = Crypto.randomUUID();
    await SecureStore.setItemAsync("padel-device", id);
  }
  return id;
}
