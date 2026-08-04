import {
  CHECK_ALARM_NAME,
  CHECK_INTERVAL_MINUTES,
  FOLDER_NAME,
  STATUS,
  STORAGE_KEYS
} from "../shared/constants.js";
import { getFolderId, getRecords, getSettings, saveFolderId, saveRecords } from "../shared/storage.js";
import { getLifecycle, resetRetention, startGrace } from "../shared/retention.js";

async function ensureFolder() {
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

async function reconcileRecords() {
  const folder = await ensureFolder();
  const children = await chrome.bookmarks.getChildren(folder.id);
  const idsInFolder = new Set(children.filter((item) => item.url).map((item) => item.id));
  const records = await getRecords();
  let changed = false;

  for (const id of Object.keys(records)) {
    if (!idsInFolder.has(id)) {
      delete records[id];
      changed = true;
    }
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
      try {
        await chrome.bookmarks.remove(bookmarkId);
      } catch (_) {}
      delete records[bookmarkId];
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
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureFolder();
  await chrome.alarms.create(CHECK_ALARM_NAME, { periodInMinutes: CHECK_INTERVAL_MINUTES });

  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/onboarding.html") });
  }

  await processExpirations();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureFolder();
  await chrome.alarms.create(CHECK_ALARM_NAME, { periodInMinutes: CHECK_INTERVAL_MINUTES });
  await processExpirations();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === CHECK_ALARM_NAME) await processExpirations();
});

chrome.bookmarks.onRemoved.addListener(async (id) => {
  const records = await getRecords();
  if (records[id]) {
    delete records[id];
    await saveRecords(records);
  }
});

chrome.bookmarks.onMoved.addListener(async (id, moveInfo) => {
  const folderId = await getFolderId();
  if (folderId && moveInfo.parentId !== folderId) {
    const records = await getRecords();
    if (records[id]) {
      delete records[id];
      await saveRecords(records);
    }
  }
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
    await chrome.notifications.clear(notificationId);
    return;
  }

  if (buttonIndex === 1) {
    try {
      await chrome.bookmarks.remove(bookmarkId);
    } catch (_) {}
    delete records[bookmarkId];
    await saveRecords(records);
    await chrome.notifications.clear(notificationId);
  }
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
});
