import type { SyncResult } from "./types";

export type ResultAction = "accept-server" | "record-conflict" | "record-rejection";

export function actionForSyncResult(result: SyncResult): ResultAction {
  if (result.status === "conflict") return "record-conflict";
  if (result.status === "rejected") return "record-rejection";
  return "accept-server";
}

export function shouldRemoveFromOutbox(result: SyncResult) {
  return ["applied", "duplicate", "noop", "conflict", "rejected"].includes(result.status);
}

export function coalescedBaseVersion(existingBaseVersion: number | null, entityVersion = 0) {
  return existingBaseVersion ?? entityVersion;
}
