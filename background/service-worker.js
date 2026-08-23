import {
  CHECK_ALARM_NAME,
  CHECK_INTERVAL_MINUTES,
  STATUS,
  STORAGE_KEYS
} from "../shared/constants.js";
import { ensureFolder, saveTemporaryBookmark } from "../shared/bookmarks.js";
import { prependDeleted, toDeletedEntry } from "../shared/deleted.js";
import {
  getDeleted,
  getFolderId,
  getRecords,
  getSettings,
  saveDeleted,
  saveRecords
} from "../shared/storage.js";
import {
  countAttentionRecords,
  getLifecycle,
  resetRetention,
  startGrace
} from "../shared/retention.js";

const CONTEXT_MENU_ID = "lbb-bend-page";
const COMMAND_BEND_PAGE = "bend-current-page";
const BADGE_COLOR = "#c45c26";

async function setupContextMenu() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Bend this page",
    contexts: ["page", "link"]
  });
}

async function updateBadge(records) {
  const count = countAttentionRecords(records);
  const text = count <= 0 ? "" : count > 99 ? "99+" : String(count);

  try {
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
    await chrome.action.setTitle({
      title:
        count > 0
          ? `The Last Bookmark Bender — ${count} need attention`
          : "The Last Bookmark Bender"
    });
  } catch (error) {
    console.error("Badge update error", error);
  }
}

async function archiveRecord(record) {
  if (!record?.url) return;
  const deleted = await getDeleted();
  await saveDeleted(prependDeleted(deleted, toDeletedEntry(record)));
}

/**
 * Archive + drop tracking, then optionally remove the Chrome bookmark.
 * Persists records before bookmark removal so onRemoved does not double-archive.
 */
async function softDeleteById(bookmarkId, records, { removeBookmark = true, archive = true } = {}) {
  const record = records[bookmarkId];
  if (!record) return false;

  if (archive) await archiveRecord(record);
  delete records[bookmarkId];
  await saveRecords(records);
  await updateBadge(records);

  if (removeBookmark) {
    try {
      await chrome.bookmarks.remove(bookmarkId);
    } catch (_) {}
  }

  return true;
}

async function bookmarkStillExists(id) {
  try {
    const nodes = await chrome.bookmarks.get(id);
    return Boolean(nodes[0]);
  } catch {
    return false;
  }
}

async function reconcileRecords() {
  const folder = await ensureFolder();
  const children = await chrome.bookmarks.getChildren(folder.id);
  const idsInFolder = new Set(children.filter((item) => item.url).map((item) => item.id));
  const records = await getRecords();
  let changed = false;

  for (const id of Object.keys(records)) {
    if (idsInFolder.has(id)) continue;

    const exists = await bookmarkStillExists(id);
    if (!exists) await archiveRecord(records[id]);
    delete records[id];
    changed = true;
  }

  if (changed) await saveRecords(records);
  return records;
}

async function showNotification(id, options) {
  try {
    await chrome.notifications.create(id, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("assets/icons/icon128.png"),
      title: options.title,
      message: options.message,
      priority: 2,
      buttons: options.buttons || []
    });
  } catch (error) {
    console.error("Notification error", error);
  }
}

async function processExpirations() {
  const settings = await getSettings();
  const records = await reconcileRecords();
  const now = Date.now();
  let changed = false;

  for (const [bookmarkId, record] of Object.entries(records)) {
    const lifecycle = getLifecycle(record, now);

    if (lifecycle === STATUS.EXPIRING_SOON && !record.warnedAt) {
      records[bookmarkId] = { ...record, status: STATUS.EXPIRING_SOON, warnedAt: now };
      changed = true;

      if (settings.warningEnabled) {
        await showNotification(`warning:${bookmarkId}`, {
          title: "Bookmark expiring soon",
          message: `${record.title} is approaching its retention deadline.`
        });
      }
    }

    if (lifecycle === "start-grace") {
      records[bookmarkId] = startGrace(record, now);
      changed = true;

      await showNotification(`grace:${bookmarkId}`, {
        title: "Final 24 hours",
        message: `${record.title} will be deleted in 24 hours unless you keep it.`,
        buttons: [{ title: "Keep Bookmark" }, { title: "Delete Now" }]
      });
    }

    if (lifecycle === "delete") {
      await softDeleteById(bookmarkId, records);
      changed = true;

      if (settings.deletionNotificationEnabled) {
        await showNotification(`deleted:${bookmarkId}`, {
          title: "Bookmark bent from existence",
          message: record.title
        });
      }
    }
  }

  if (changed) await saveRecords(records);
  await updateBadge(records);
}

async function resolveNotificationUrl(notificationId) {
  const colon = notificationId.indexOf(":");
  if (colon < 0) return null;

  const kind = notificationId.slice(0, colon);
  const bookmarkId = notificationId.slice(colon + 1);
  if (!bookmarkId) return null;

  if (kind === "warning" || kind === "grace") {
    const records = await getRecords();
    return records[bookmarkId]?.url || null;
  }

  if (kind === "deleted") {
    const deleted = await getDeleted();
    const entry = deleted.find(
      (item) => item.bookmarkId === bookmarkId || item.id.endsWith(`-${bookmarkId}`)
    );
    return entry?.url || null;
  }

  return null;
}

async function openPopupFallback() {
  try {
    await chrome.action.openPopup();
  } catch (_) {
    // openPopup is not always available; ignore.
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureFolder();
  await setupContextMenu();
  await chrome.alarms.create(CHECK_ALARM_NAME, { periodInMinutes: CHECK_INTERVAL_MINUTES });

  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/onboarding.html") });
  }

  await processExpirations();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureFolder();
  await setupContextMenu();
  await chrome.alarms.create(CHECK_ALARM_NAME, { periodInMinutes: CHECK_INTERVAL_MINUTES });
  await processExpirations();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === CHECK_ALARM_NAME) await processExpirations();
});

chrome.bookmarks.onRemoved.addListener(async (id) => {
  const records = await getRecords();
  if (!records[id]) return;
  await softDeleteById(id, records, { removeBookmark: false });
});

chrome.bookmarks.onMoved.addListener(async (id, moveInfo) => {
  const folderId = await getFolderId();
  if (folderId && moveInfo.parentId !== folderId) {
    const records = await getRecords();
    if (!records[id]) return;
    await softDeleteById(id, records, { removeBookmark: false, archive: false });
  }
});

async function handleBendResult(result) {
  if (result.code === "setup-required") {
    await showNotification("setup-required", {
      title: "Setup required",
      message: result.message
    });
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/onboarding.html") });
    return;
  }

  await showNotification(`bend:${Date.now()}`, {
    title: result.ok ? "Bookmark bent" : "Could not bend bookmark",
    message: result.message
  });

  await updateBadge(await getRecords());
}

async function bendActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    await showNotification(`bend:${Date.now()}`, {
      title: "Could not bend bookmark",
      message: "No active tab found."
    });
    return;
  }

  const result = await saveTemporaryBookmark({
    title: tab.title || tab.url,
    url: tab.url
  });
  await handleBendResult(result);
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;

  const url = info.linkUrl || info.pageUrl || tab?.url;
  const title = info.linkUrl
    ? (info.selectionText || info.linkUrl)
    : (tab?.title || url);

  const result = await saveTemporaryBookmark({ title, url });
  await handleBendResult(result);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === COMMAND_BEND_PAGE) await bendActiveTab();
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  await chrome.notifications.clear(notificationId);

  const url = await resolveNotificationUrl(notificationId);
  if (url) {
    await chrome.tabs.create({ url });
    return;
  }

  await openPopupFallback();
});

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (!notificationId.startsWith("grace:")) return;
  const bookmarkId = notificationId.split(":")[1];
  const records = await getRecords();
  const record = records[bookmarkId];
  if (!record) return;

  if (buttonIndex === 0) {
    const settings = await getSettings();
    records[bookmarkId] = resetRetention(record, settings.retentionMinutes);
    await saveRecords(records);
    await updateBadge(records);
    await chrome.notifications.clear(notificationId);
    return;
  }

  if (buttonIndex === 1) {
    await softDeleteById(bookmarkId, records);
    await chrome.notifications.clear(notificationId);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[STORAGE_KEYS.RECORDS]) return;
  updateBadge(changes[STORAGE_KEYS.RECORDS].newValue || {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "PROCESS_EXPIRATIONS") {
    processExpirations().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === "ENSURE_FOLDER") {
    ensureFolder().then((folder) => sendResponse({ ok: true, folder }));
    return true;
  }

  if (message?.type === "UPDATE_BADGE") {
    getRecords().then((records) => updateBadge(records)).then(() => sendResponse({ ok: true }));
    return true;
  }
});
