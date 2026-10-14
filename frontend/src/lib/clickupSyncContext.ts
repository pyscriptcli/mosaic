import { AsyncLocalStorage } from "node:async_hooks";

export interface ClickUpSyncContext {
  runId: string | null;
  listId: string;
  userId: string;
}

const syncContext = new AsyncLocalStorage<ClickUpSyncContext>();

export function withClickUpSyncContext<T>(context: ClickUpSyncContext, work: () => T): T {
  return syncContext.run(context, work);
}

export function getClickUpSyncContext() {
  return syncContext.getStore() || null;
}
