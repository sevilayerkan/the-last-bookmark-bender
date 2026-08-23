import {
  FOLDER_NAME,
  MAX_BOOKMARK_COUNT,
  STATUS
} from "./constants.js";
import { removeDeletedEntry } from "./deleted.js";
import { clampRetention, resetRetention } from "./retention.js";
import {
  getDeleted,
  getFolderId,
  getRecords,
  getSettings,
  saveDeleted,
  saveFolderId,
  saveRecords
} from "./storage.js";

export function isSupportedUrl(url) {
  return /^https?:\/\//i.test(url || "");
}

export function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    if (parsed.pathname === "/") parsed.pathname = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

export async function ensureFolder() {
  const storedId = await getFolderId();
  if (storedId) {
    try {
      const nodes = await chrome.bookmarks.get(storedId);
      const node = nodes[0];
      if (node && !node.url) return node;
    } catch (_) {}
  }

  const matches = await chrome.bookmarks.search({ title: FOLDER_NAME });
  const existing = matches.find((item) => item.title === FOLDER_NAME && !item.url);
  if (existing) {
    await saveFolderId(existing.id);
    return existing;
  }

  const created = await chrome.bookmarks.create({ title: FOLDER_NAME });
  await saveFolderId(created.id);
  return created;
}

function findDuplicate(records, url) {
  const normalized = normalizeUrl(url);
  return Object.values(records).find((record) => normalizeUrl(record.url) === normalized);
}

async function countFolderBookmarks(folderId) {
  const folderChildren = await chrome.bookmarks.getChildren(folderId);
  return folderChildren.filter((bookmark) => Boolean(bookmark.url)).length;
}

function createRecord({ bookmark, fallbackUrl, retentionMinutes, now }) {
  const minutes = clampRetention(retentionMinutes);
  return {
    bookmarkId: bookmark.id,
    title: bookmark.title || fallbackUrl,
    url: bookmark.url,
    createdAt: now,
    retentionMinutes: minutes,
    expiresAt: now + minutes * 60_000,
    status: STATUS.ACTIVE,
    warnedAt: null,
    gracePeriodStartedAt: null,
    gracePeriodEndsAt: null,
    graceNotifiedAt: null
  };
}

function limitResult() {
  return {
    ok: false,
    code: "limit",
    message: `Bookmark limit reached. You can keep up to ${MAX_BOOKMARK_COUNT} bookmarks.`
  };
}

/**
 * Save a URL as a temporary bookmark.
 * @returns {{ ok: boolean, code: string, message: string, bookmarkId?: string }}
 */
export async function saveTemporaryBookmark({ title, url, now = Date.now() }) {
  const settings = await getSettings();

  if (!settings.onboardingCompleted) {
    return {
      ok: false,
      code: "setup-required",
      message: "Finish setup first: choose your default retention time."
    };
  }

  if (!isSupportedUrl(url)) {
    return {
      ok: false,
      code: "unsupported-url",
      message: "Only http and https pages can be bent."
    };
  }

  const records = await getRecords();
  const duplicate = findDuplicate(records, url);

  if (duplicate) {
    records[duplicate.bookmarkId] = resetRetention(duplicate, settings.retentionMinutes, now);
    await saveRecords(records);
    return {
      ok: true,
      code: "reset",
      message: "Bookmark already existed. Retention was reset.",
      bookmarkId: duplicate.bookmarkId
    };
  }

  const folder = await ensureFolder();
  const currentBookmarkCount = await countFolderBookmarks(folder.id);

  if (currentBookmarkCount >= MAX_BOOKMARK_COUNT) {
    return limitResult();
  }

  const bookmark = await chrome.bookmarks.create({
    parentId: folder.id,
    title: title || url,
    url
  });

  records[bookmark.id] = createRecord({
    bookmark,
    fallbackUrl: url,
    retentionMinutes: settings.retentionMinutes,
    now
  });

  await saveRecords(records);

  return {
    ok: true,
    code: "saved",
    message: `Saved to ${FOLDER_NAME}. ${currentBookmarkCount + 1}/${MAX_BOOKMARK_COUNT}`,
    bookmarkId: bookmark.id
  };
}

/**
 * Restore a Recently Deleted entry as a temporary bookmark.
 * @returns {{ ok: boolean, code: string, message: string, bookmarkId?: string }}
 */
export async function restoreDeletedBookmark(entryId, { now = Date.now() } = {}) {
  const settings = await getSettings();
  const records = await getRecords();
  const deleted = await getDeleted();
  const entry = deleted.find((item) => item.id === entryId);

  if (!entry) {
    return { ok: false, code: "not-found", message: "Deleted entry not found." };
  }

  const duplicate = findDuplicate(records, entry.url);

  if (duplicate) {
    records[duplicate.bookmarkId] = resetRetention(duplicate, settings.retentionMinutes, now);
    await saveRecords(records);
    await saveDeleted(removeDeletedEntry(deleted, entryId));
    return {
      ok: true,
      code: "reset",
      message: "Already saved. Retention was reset.",
      bookmarkId: duplicate.bookmarkId
    };
  }

  const folder = await ensureFolder();
  const currentBookmarkCount = await countFolderBookmarks(folder.id);

  if (currentBookmarkCount >= MAX_BOOKMARK_COUNT) {
    return limitResult();
  }

  const bookmark = await chrome.bookmarks.create({
    parentId: folder.id,
    title: entry.title || entry.url,
    url: entry.url
  });

  records[bookmark.id] = createRecord({
    bookmark,
    fallbackUrl: entry.url,
    retentionMinutes: entry.retentionMinutes || settings.retentionMinutes,
    now
  });

  await saveRecords(records);
  await saveDeleted(removeDeletedEntry(deleted, entryId));

  return {
    ok: true,
    code: "restored",
    message: "Bookmark restored.",
    bookmarkId: bookmark.id
  };
}
