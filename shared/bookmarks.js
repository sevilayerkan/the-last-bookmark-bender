import {
  FOLDER_NAME,
  MAX_BOOKMARK_COUNT,
  STATUS
} from "./constants.js";
import { clampRetention, resetRetention } from "./retention.js";
import {
  getFolderId,
  getRecords,
  getSettings,
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

/**
 * Save a URL as a temporary bookmark.
 * @returns {{ ok: boolean, code: string, message: string, bookmarkId?: string }}
 */
export async function saveTemporaryBookmark({ title, url }) {
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
  const normalized = normalizeUrl(url);
  const duplicate = Object.values(records).find(
    (record) => normalizeUrl(record.url) === normalized
  );

  if (duplicate) {
    records[duplicate.bookmarkId] = resetRetention(duplicate, settings.retentionMinutes);
    await saveRecords(records);
    return {
      ok: true,
      code: "reset",
      message: "Bookmark already existed. Retention was reset.",
      bookmarkId: duplicate.bookmarkId
    };
  }

  const folder = await ensureFolder();
  const folderChildren = await chrome.bookmarks.getChildren(folder.id);
  const currentBookmarkCount = folderChildren.filter((bookmark) => Boolean(bookmark.url)).length;

  if (currentBookmarkCount >= MAX_BOOKMARK_COUNT) {
    return {
      ok: false,
      code: "limit",
      message: `Bookmark limit reached. You can keep up to ${MAX_BOOKMARK_COUNT} bookmarks.`
    };
  }

  const bookmark = await chrome.bookmarks.create({
    parentId: folder.id,
    title: title || url,
    url
  });

  const now = Date.now();
  const retentionMinutes = clampRetention(settings.retentionMinutes);

  records[bookmark.id] = {
    bookmarkId: bookmark.id,
    title: bookmark.title || url,
    url: bookmark.url,
    createdAt: now,
    retentionMinutes,
    expiresAt: now + retentionMinutes * 60_000,
    status: STATUS.ACTIVE,
    warnedAt: null,
    gracePeriodStartedAt: null,
    gracePeriodEndsAt: null,
    graceNotifiedAt: null
  };

  await saveRecords(records);

  return {
    ok: true,
    code: "saved",
    message: `Saved to ${FOLDER_NAME}. ${currentBookmarkCount + 1}/${MAX_BOOKMARK_COUNT}`,
    bookmarkId: bookmark.id
  };
}
