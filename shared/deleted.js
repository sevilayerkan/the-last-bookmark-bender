import { MAX_DELETED_COUNT } from "./constants.js";

export function toDeletedEntry(record, now = Date.now()) {
  return {
    id: `${now}-${record.bookmarkId || "x"}`,
    bookmarkId: record.bookmarkId || null,
    title: record.title,
    url: record.url,
    deletedAt: now,
    retentionMinutes: record.retentionMinutes
  };
}

export function prependDeleted(deletedList, entry, max = MAX_DELETED_COUNT) {
  return [entry, ...(deletedList || [])].slice(0, max);
}

export function removeDeletedEntry(deletedList, entryId) {
  return (deletedList || []).filter((entry) => entry.id !== entryId);
}
