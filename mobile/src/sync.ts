import * as Crypto from "expo-crypto";
import type { SQLiteDatabase } from "expo-sqlite";
import { syncApi } from "./api";
import { applySyncResponse, pendingCount, readOutbox } from "./database";
import { getSession } from "./session";

export async function synchronize(db: SQLiteDatabase) {
  const session = await getSession();
  if (!session) throw new Error("AUTH_REQUIRED");
  let rounds = 0;
  do {
    const mutations = await readOutbox(db, 50);
    const response = await syncApi(session.deviceId, mutations);
    await applySyncResponse(db, response);
    rounds += 1;
    if (mutations.length < 50) break;
  } while (rounds < 8);
  return { pending: await pendingCount(db) };
}

export function newId(prefix: string) {
  return `${prefix}:${Crypto.randomUUID()}`;
}
