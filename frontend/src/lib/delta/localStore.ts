import type { DeltaEntry } from "./compare";

export interface SavedDeltaReview {
  id: string;
  title: string;
  contextId?: string;
  contextName?: string;
  savedAt: string;
  originalName: string;
  revisedName: string;
  entries: DeltaEntry[];
  commentsFound: boolean;
  registerFile?: Blob;
  originalFile?: File;
  revisedFile?: File;
}

type DirectoryWindow = Window & {
  showDirectoryPicker?: (options?: { id?: string; mode?: "read" | "readwrite"; startIn?: "documents" | "desktop" | "downloads" }) => Promise<FileSystemDirectoryHandle>;
};

const DB_NAME = "project-echo-delta";
const STORE_NAME = "handles";
const REVIEWS_STORE = "reviews";
const HANDLE_KEY = "reviews-directory";
const MODE_KEY = "storage-mode";

export type ReviewStorageMode = "documents" | "browser" | "indexeddb";

type StorageWithDirectory = StorageManager & { getDirectory?: () => Promise<FileSystemDirectoryHandle> };

export function supportsDocumentsFolderSaving() {
  return typeof window !== "undefined" && typeof (window as DirectoryWindow).showDirectoryPicker === "function";
}

function openHandleDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      if (!db.objectStoreNames.contains(REVIEWS_STORE)) db.createObjectStore(REVIEWS_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Local review storage could not be opened."));
  });
}

async function saveDirectoryHandle(handle: FileSystemDirectoryHandle, mode: ReviewStorageMode) {
  const db = await openHandleDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
    transaction.objectStore(STORE_NAME).put(mode, MODE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("The save folder could not be remembered."));
  });
  db.close();
}

async function saveStorageMode(mode: ReviewStorageMode) {
  const db = await openHandleDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(mode, MODE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Local review storage could not be configured."));
  });
  db.close();
}

export async function getReviewStorageMode(): Promise<ReviewStorageMode | null> {
  const db = await openHandleDb();
  const value = await new Promise<ReviewStorageMode | undefined>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(MODE_KEY);
    request.onsuccess = () => resolve(request.result as ReviewStorageMode | undefined);
    request.onerror = () => reject(request.error || new Error("Local review storage settings could not be read."));
  });
  db.close();
  if (value) return value;
  return (await getSavedDirectoryHandle()) ? "documents" : null;
}

async function getSavedDirectoryHandle() {
  const db = await openHandleDb();
  const handle = await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(HANDLE_KEY);
    request.onsuccess = () => resolve(request.result as FileSystemDirectoryHandle | undefined);
    request.onerror = () => reject(request.error || new Error("The saved folder could not be read."));
  });
  db.close();
  return handle;
}

async function requestFolderPermission(handle: FileSystemDirectoryHandle) {
  const permissionHandle = handle as FileSystemDirectoryHandle & {
    queryPermission?: (options: { mode: "readwrite" }) => Promise<PermissionState>;
    requestPermission?: (options: { mode: "readwrite" }) => Promise<PermissionState>;
  };
  if (!permissionHandle.queryPermission && !permissionHandle.requestPermission) return;
  const current = await permissionHandle.queryPermission?.({ mode: "readwrite" });
  if (current === "granted") return;
  const requested = await permissionHandle.requestPermission?.({ mode: "readwrite" });
  if (requested !== "granted") throw new Error("Allow access to the Documents folder to save or reopen contract reviews.");
}

async function reviewsDirectory(parent: FileSystemDirectoryHandle, create: boolean) {
  const getIfPresent = async (name: string) => {
    try {
      return await parent.getDirectoryHandle(name);
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") return null;
      throw error;
    }
  };
  const currentFolder = await getIfPresent("Contract Reviews");
  if (currentFolder) return currentFolder;
  // Keep access to reviews created before the folder was renamed.
  const legacyFolder = await getIfPresent("DELTA Reviews");
  if (legacyFolder) return legacyFolder;
  if (!create) throw new Error("No contract review folder was found.");
  return parent.getDirectoryHandle("Contract Reviews", { create: true });
}

export async function chooseReviewFolder() {
  const picker = (window as DirectoryWindow).showDirectoryPicker;
  if (picker) {
    const documents = await picker({ id: "project-echo-delta-documents", mode: "readwrite", startIn: "documents" });
    if (documents.name.toLowerCase() !== "documents") throw new Error("Choose the Documents folder. A contract review folder will be created there.");
    await requestFolderPermission(documents);
    const folder = await reviewsDirectory(documents, true);
    await saveDirectoryHandle(documents, "documents");
    return { folder: folder.name, mode: "documents" as const };
  }

  const privateStorage = (navigator.storage as StorageWithDirectory | undefined)?.getDirectory;
  if (privateStorage) {
    try {
      const root = await privateStorage.call(navigator.storage);
      const folder = await reviewsDirectory(root, true);
      await saveDirectoryHandle(root, "browser");
      return { folder: folder.name, mode: "browser" as const };
    } catch {
      // Use IndexedDB if this browser exposes OPFS but cannot open it in this context.
    }
  }

  await saveStorageMode("indexeddb");
  return { folder: "Contract Reviews", mode: "indexeddb" as const };
}

async function authorizedReviewsDirectory() {
  const mode = await getReviewStorageMode();
  const parent = await getSavedDirectoryHandle();
  if (!parent) throw new Error("Choose Documents as the save location before saving a review.");
  if (mode !== "browser") await requestFolderPermission(parent);
  return reviewsDirectory(parent, true);
}

async function saveIndexedDbReview(review: SavedDeltaReview) {
  const db = await openHandleDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(REVIEWS_STORE, "readwrite");
    transaction.objectStore(REVIEWS_STORE).put(review);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("The review could not be saved in local browser storage."));
  });
  db.close();
}

async function listIndexedDbReviews() {
  const db = await openHandleDb();
  const reviews = await new Promise<SavedDeltaReview[]>((resolve, reject) => {
    const request = db.transaction(REVIEWS_STORE, "readonly").objectStore(REVIEWS_STORE).getAll();
    request.onsuccess = () => resolve(request.result as SavedDeltaReview[]);
    request.onerror = () => reject(request.error || new Error("Saved reviews could not be read from local browser storage."));
  });
  db.close();
  return reviews.sort((left, right) => right.savedAt.localeCompare(left.savedAt));
}

async function writeFile(directory: FileSystemDirectoryHandle, name: string, value: Blob | string) {
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(value);
  await writable.close();
}

async function readReviewIds(root: FileSystemDirectoryHandle) {
  try {
    const file = await (await root.getFileHandle("index.json")).getFile();
    const value = JSON.parse(await file.text());
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export async function saveReview(review: SavedDeltaReview) {
  if (await getReviewStorageMode() === "indexeddb") {
    await saveIndexedDbReview(review);
    return;
  }
  const root = await authorizedReviewsDirectory();
  const directory = await root.getDirectoryHandle(`review-${review.id}`, { create: true });
  const { originalFile: _original, revisedFile: _revised, registerFile: _register, ...saved } = review;
  await writeFile(directory, "review.json", JSON.stringify(saved, null, 2));
  if (review.originalFile) await writeFile(directory, "original.docx", review.originalFile);
  if (review.revisedFile) await writeFile(directory, "reviewed.docx", review.revisedFile);
  if (review.registerFile) await writeFile(directory, "register.docx", review.registerFile);
  const ids = await readReviewIds(root);
  await writeFile(root, "index.json", JSON.stringify(Array.from(new Set([...ids, review.id]))));
}

export async function listReviews() {
  if (await getReviewStorageMode() === "indexeddb") return listIndexedDbReviews();
  const root = await authorizedReviewsDirectory();
  const reviews: SavedDeltaReview[] = [];
  for (const id of await readReviewIds(root)) {
    try {
      const directory = await root.getDirectoryHandle(`review-${id}`);
      const metadataFile = await (await directory.getFileHandle("review.json")).getFile();
      const review = JSON.parse(await metadataFile.text()) as SavedDeltaReview;
      const originalFile = await (await directory.getFileHandle("original.docx")).getFile().catch(() => undefined);
      const revisedFile = await (await directory.getFileHandle("reviewed.docx")).getFile().catch(() => undefined);
      reviews.push({ ...review, originalFile, revisedFile });
    } catch {
      // Incomplete folders are skipped; they remain on disk for manual recovery.
    }
  }
  return reviews.sort((left, right) => right.savedAt.localeCompare(left.savedAt));
}

export async function deleteReview(id: string) {
  if (await getReviewStorageMode() === "indexeddb") {
    const db = await openHandleDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(REVIEWS_STORE, "readwrite");
      transaction.objectStore(REVIEWS_STORE).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("The local comparison could not be deleted."));
    });
    db.close();
    return;
  }
  const root = await authorizedReviewsDirectory();
  await root.removeEntry(`review-${id}`, { recursive: true }).catch(() => undefined);
  await writeFile(root, "index.json", JSON.stringify((await readReviewIds(root)).filter((savedId) => savedId !== id)));
}

export async function hasChosenFolder() {
  return Boolean(await getReviewStorageMode());
}
