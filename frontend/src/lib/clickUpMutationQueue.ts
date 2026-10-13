import { deleteClickUpTask, updateClickUpTask } from "@/lib/api";

type QueuedMutation = { id: string; kind: "update"; payload: Parameters<typeof updateClickUpTask>[0] } | { id: string; kind: "delete"; taskId: string };
const queueKey = (userId: string) => `mosaic-clickup-outbox:${userId}`;
const activeFlushes = new Map<string, Promise<void>>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const autoFlushTimers = new Map<string, ReturnType<typeof setTimeout>>();
const usersWithQueuedMutations = new Set<string>();
let onlineListenerRegistered = false;

function emitQueueState(userId: string, queue: QueuedMutation[], failure?: string) {
  window.dispatchEvent(new CustomEvent("mosaic-clickup-sync", { detail: { userId, pending: queue.length, failed: Boolean(failure), error: failure || "" } }));
}

function scheduleAutoFlush(userId: string, delay = 500) {
  if (typeof window === "undefined") return;
  usersWithQueuedMutations.add(userId);
  if (!onlineListenerRegistered) {
    onlineListenerRegistered = true;
    window.addEventListener("online", () => {
      for (const queuedUserId of usersWithQueuedMutations) scheduleAutoFlush(queuedUserId, 0);
    });
  }
  if (!navigator.onLine || activeFlushes.has(userId)) return;
  const currentTimer = autoFlushTimers.get(userId);
  if (currentTimer) clearTimeout(currentTimer);
  autoFlushTimers.set(userId, setTimeout(() => {
    autoFlushTimers.delete(userId);
    void flushClickUpMutationQueue(userId);
  }, delay));
}

function readQueue(userId: string): QueuedMutation[] {
  try {
    const value = JSON.parse(localStorage.getItem(queueKey(userId)) || "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function writeQueue(userId: string, queue: QueuedMutation[]) {
  if (queue.length) localStorage.setItem(queueKey(userId), JSON.stringify(queue));
  else localStorage.removeItem(queueKey(userId));
  if (queue.length) scheduleAutoFlush(userId);
  else usersWithQueuedMutations.delete(userId);
  emitQueueState(userId, queue);
}

export function getPendingClickUpMutationCount(userId: string) {
  return typeof window === "undefined" ? 0 : readQueue(userId).length;
}

export function mergePendingClickUpMutations<T extends { id: string }>(userId: string, tasks: T[]): T[] {
  return readQueue(userId).reduce((current, item) => {
    if (item.kind === "delete") return current.filter((task) => task.id !== item.taskId);
    return current.map((task) => task.id === item.payload.taskId ? { ...task, ...item.payload } as T : task);
  }, tasks);
}

export function queueClickUpUpdate(userId: string, payload: Parameters<typeof updateClickUpTask>[0]) {
  const queue = readQueue(userId);
  // Do not mutate the payload currently being sent; preserve a follow-up write in order.
  const existing = activeFlushes.has(userId) ? -1 : queue.findIndex((item) => item.kind === "update" && item.payload.taskId === payload.taskId);
  if (existing >= 0) {
    const previous = queue[existing];
    if (previous.kind === "update") queue[existing] = { ...previous, payload: { ...previous.payload, ...payload } };
  } else queue.push({ id: crypto.randomUUID(), kind: "update", payload });
  writeQueue(userId, queue);
}

export function queueClickUpDelete(userId: string, taskId: string) {
  const queue = readQueue(userId).filter((item) => !(item.kind === "update" && item.payload.taskId === taskId));
  if (!queue.some((item) => item.kind === "delete" && item.taskId === taskId)) queue.push({ id: crypto.randomUUID(), kind: "delete", taskId });
  writeQueue(userId, queue);
}

export function flushClickUpMutationQueue(userId: string, onPending?: (count: number) => void): Promise<void> {
  const autoTimer = autoFlushTimers.get(userId);
  if (autoTimer) clearTimeout(autoTimer);
  autoFlushTimers.delete(userId);
  const retryTimer = retryTimers.get(userId);
  if (retryTimer) clearTimeout(retryTimer);
  retryTimers.delete(userId);
  const active = activeFlushes.get(userId);
  if (active) return active;
  const operation = (async () => {
    let queue = readQueue(userId);
    onPending?.(queue.length);
    while (queue.length && navigator.onLine) {
      const item = queue[0];
      try {
        if (item.kind === "update") await updateClickUpTask(item.payload);
        else await deleteClickUpTask(item.taskId);
        queue = readQueue(userId).filter((queued) => queued.id !== item.id);
        writeQueue(userId, queue);
        onPending?.(queue.length);
      } catch (error) {
        queue = readQueue(userId);
        const status = error && typeof error === "object" && "status" in error ? Number((error as { status: unknown }).status) : 0;
        const message = error instanceof Error ? error.message : "A saved change could not sync.";
        emitQueueState(userId, queue, message);
        if (status === 401 || status === 403) break;
        if (!retryTimers.has(userId)) {
          retryTimers.set(userId, setTimeout(() => {
            retryTimers.delete(userId);
            void flushClickUpMutationQueue(userId, onPending);
          }, 30_000));
        }
        break;
      }
    }
  })().finally(() => activeFlushes.delete(userId));
  activeFlushes.set(userId, operation);
  return operation;
}
