import {
  FOLDER_NAME,
  MAX_BOOKMARK_COUNT,
  MAX_RETENTION_MINUTES,
  STATUS
} from "../shared/constants.js";
import { prependDeleted, removeDeletedEntry, toDeletedEntry } from "../shared/deleted.js";
import {
  getDeleted,
  getFolderId,
  getRecords,
  getSettings,
  saveDeleted,
  saveRecords
} from "../shared/storage.js";
import { clampRetention, formatRemaining, getLifecycle, resetRetention } from "../shared/retention.js";

const elements = {
  currentPage: document.querySelector("#currentPage"),
  saveButton: document.querySelector("#saveButton"),
  feedback: document.querySelector("#feedback"),
  list: document.querySelector("#bookmarkList"),
  deletedSection: document.querySelector("#deletedSection"),
  deletedList: document.querySelector("#deletedList"),
  deletedCount: document.querySelector("#deletedCount"),
  search: document.querySelector("#searchInput"),
  sort: document.querySelector("#sortSelect"),
  settingsButton: document.querySelector("#settingsButton"),
  refreshButton: document.querySelector("#refreshButton"),
  onboardingNotice: document.querySelector("#onboardingNotice"),
  openOnboardingButton: document.querySelector("#openOnboardingButton"),
  confirmDialog: document.querySelector("#confirmDialog"),
  confirmTitle: document.querySelector("#confirmTitle"),
  confirmMessage: document.querySelector("#confirmMessage"),
  confirmCancel: document.querySelector("#confirmCancel"),
  confirmOk: document.querySelector("#confirmOk")
};

let activeTab = null;
let settings = null;
let records = {};
let deleted = [];
const itemFeedback = {};

function isSupportedUrl(url) {
  return /^https?:\/\//i.test(url || "");
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    if (parsed.pathname === "/") parsed.pathname = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

async function ensureFolder() {
  const storedId = await getFolderId();
  if (storedId) {
    try {
      const nodes = await chrome.bookmarks.get(storedId);
      if (nodes[0] && !nodes[0].url) return nodes[0];
    } catch (_) {}
  }

  const response = await chrome.runtime.sendMessage({ type: "ENSURE_FOLDER" });
  return response.folder;
}

async function loadData() {
  settings = await getSettings();
  records = await getRecords();
  deleted = await getDeleted();
  elements.onboardingNotice.classList.toggle("hidden", settings.onboardingCompleted);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab;
  elements.currentPage.textContent = tab?.title || "Untitled page";
  elements.saveButton.disabled = !isSupportedUrl(tab?.url) || !settings.onboardingCompleted;

  await chrome.runtime.sendMessage({ type: "PROCESS_EXPIRATIONS" });
  records = await getRecords();
  deleted = await getDeleted();
  render();
}

function groupLabel(record) {
  const lifecycle = getLifecycle(record);
  if (lifecycle === STATUS.GRACE || lifecycle === "delete") return "FINAL BENDING";
  if (lifecycle === STATUS.EXPIRING_SOON || lifecycle === "start-grace") return "EXPIRING SOON";
  return "ACTIVE BOOKMARKS";
}

function filteredRecords() {
  const query = elements.search.value.trim().toLowerCase();
  let items = Object.values(records).filter((record) => {
    return !query || record.title.toLowerCase().includes(query) || record.url.toLowerCase().includes(query);
  });

  if (elements.sort.value === "newest") items.sort((a, b) => b.createdAt - a.createdAt);
  else if (elements.sort.value === "title") items.sort((a, b) => a.title.localeCompare(b.title));
  else items.sort((a, b) => (a.gracePeriodEndsAt || a.expiresAt) - (b.gracePeriodEndsAt || b.expiresAt));

  return items;
}

function filteredDeleted() {
  const query = elements.search.value.trim().toLowerCase();
  return deleted.filter((entry) => {
    return !query || entry.title.toLowerCase().includes(query) || entry.url.toLowerCase().includes(query);
  });
}

function render() {
  const groups = { "FINAL BENDING": [], "EXPIRING SOON": [], "ACTIVE BOOKMARKS": [] };
  for (const record of filteredRecords()) groups[groupLabel(record)].push(record);

  const fragment = document.createDocumentFragment();
  let total = 0;

  for (const [label, items] of Object.entries(groups)) {
    if (!items.length) continue;
    total += items.length;

    const heading = document.createElement("div");
    heading.className = "section-title";
    heading.textContent = `${label} — ${items.length}`;
    fragment.appendChild(heading);

    for (const record of items) fragment.appendChild(renderBookmark(record));
  }

  elements.list.replaceChildren(fragment);
  if (!total) {
    elements.list.innerHTML = '<div class="empty">No temporary bookmarks yet.<br />The folder is waiting.</div>';
  }

  renderDeleted();
}

function renderDeleted() {
  const items = filteredDeleted();
  elements.deletedCount.textContent = String(items.length);
  elements.deletedSection.classList.toggle("hidden", deleted.length === 0);

  const fragment = document.createDocumentFragment();
  for (const entry of items) fragment.appendChild(renderDeletedItem(entry));
  elements.deletedList.replaceChildren(fragment);
}

function setItemFeedback(bookmarkId, message) {
  for (const key of Object.keys(itemFeedback)) delete itemFeedback[key];
  if (message) itemFeedback[bookmarkId] = message;

  for (const el of elements.list.querySelectorAll(".item-feedback")) {
    const id = el.closest("[data-bookmark-id]")?.dataset.bookmarkId;
    const text = id && itemFeedback[id] ? itemFeedback[id] : "";
    el.textContent = text;
    el.hidden = !text;
  }
}

function renderBookmark(record) {
  const lifecycle = getLifecycle(record);
  const item = document.createElement("article");
  item.className = "bookmark-item";
  item.dataset.bookmarkId = record.bookmarkId;
  if (lifecycle === STATUS.GRACE || lifecycle === "delete") item.classList.add("status-grace");
  else if (lifecycle === STATUS.EXPIRING_SOON || lifecycle === "start-grace") item.classList.add("status-expiring");

  const target = record.gracePeriodEndsAt || record.expiresAt;
  const feedbackText = itemFeedback[record.bookmarkId] || "";
  item.innerHTML = `
    <a class="bookmark-title" href="#" title="${escapeHtml(record.title)}">${escapeHtml(record.title)}</a>
    <div class="bookmark-url">${escapeHtml(record.url)}</div>
    <div class="meta"><span>${lifecycle === STATUS.GRACE ? "Deletion in" : "Remaining"}</span><strong>${formatRemaining(target)}</strong></div>
    <div class="actions">
      <button data-action="open">Open</button>
      <button data-action="keep">${lifecycle === STATUS.GRACE ? "Keep" : "Extend"}</button>
      <button data-action="delete" class="danger">Delete</button>
    </div>
    <p class="item-feedback" role="status"${feedbackText ? "" : " hidden"}>${escapeHtml(feedbackText)}</p>`;

  item.querySelector(".bookmark-title").addEventListener("click", (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: record.url });
  });
  item.querySelector('[data-action="open"]').addEventListener("click", () => chrome.tabs.create({ url: record.url }));
  item.querySelector('[data-action="keep"]').addEventListener("click", () => extendBookmark(record.bookmarkId));
  item.querySelector('[data-action="delete"]').addEventListener("click", () => deleteBookmark(record.bookmarkId));
  return item;
}

function renderDeletedItem(entry) {
  const item = document.createElement("article");
  item.className = "bookmark-item status-deleted";
  item.dataset.deletedId = entry.id;
  item.innerHTML = `
    <a class="bookmark-title" href="#" title="${escapeHtml(entry.title)}">${escapeHtml(entry.title)}</a>
    <div class="bookmark-url">${escapeHtml(entry.url)}</div>
    <div class="meta"><span>Deleted</span><strong>${formatDeletedAge(entry.deletedAt)}</strong></div>
    <div class="actions">
      <button data-action="open">Open</button>
      <button data-action="restore">Restore</button>
      <button data-action="purge" class="danger">Remove</button>
    </div>`;

  item.querySelector(".bookmark-title").addEventListener("click", (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: entry.url });
  });
  item.querySelector('[data-action="open"]').addEventListener("click", () => chrome.tabs.create({ url: entry.url }));
  item.querySelector('[data-action="restore"]').addEventListener("click", () => restoreDeleted(entry.id));
  item.querySelector('[data-action="purge"]').addEventListener("click", () => purgeDeleted(entry.id));
  return item;
}

function formatDeletedAge(deletedAt, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - deletedAt) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function saveCurrentPage() {
  if (!activeTab || !isSupportedUrl(activeTab.url)) return;

  const normalized = normalizeUrl(activeTab.url);

  const duplicate = Object.values(records).find(
    (record) => normalizeUrl(record.url) === normalized
  );

  if (duplicate) {
    records[duplicate.bookmarkId] = resetRetention(
      duplicate,
      settings.retentionMinutes
    );

    await saveRecords(records);

    elements.feedback.textContent =
      "Bookmark already existed. Retention was reset.";

    render();
    return;
  }

  const folder = await ensureFolder();
  const folderChildren = await chrome.bookmarks.getChildren(folder.id);

  const currentBookmarkCount = folderChildren.filter(
    (bookmark) => Boolean(bookmark.url)
  ).length;

  if (currentBookmarkCount >= MAX_BOOKMARK_COUNT) {
    elements.feedback.textContent =
      `Bookmark limit reached. You can keep up to ${MAX_BOOKMARK_COUNT} bookmarks.`;

    return;
  }

  const bookmark = await chrome.bookmarks.create({
    parentId: folder.id,
    title: activeTab.title || activeTab.url,
    url: activeTab.url
  });

  const now = Date.now();

  records[bookmark.id] = {
    bookmarkId: bookmark.id,
    title: bookmark.title || activeTab.url,
    url: bookmark.url,
    createdAt: now,
    retentionMinutes: settings.retentionMinutes,
    expiresAt: now + settings.retentionMinutes * 60_000,
    status: STATUS.ACTIVE,
    warnedAt: null,
    gracePeriodStartedAt: null,
    gracePeriodEndsAt: null,
    graceNotifiedAt: null
  };

  await saveRecords(records);

  elements.feedback.textContent =
    `Saved to ${FOLDER_NAME}. ${currentBookmarkCount + 1}/${MAX_BOOKMARK_COUNT}`;

  render();
}

function canExtendRetention(record, now = Date.now()) {
  const lifecycle = getLifecycle(record, now);
  if (lifecycle === STATUS.GRACE || lifecycle === "delete" || lifecycle === "start-grace") {
    return true;
  }

  const remainingMinutes = Math.max(0, (record.expiresAt - now) / 60_000);
  const targetMinutes = clampRetention(settings.retentionMinutes);
  const maxAllowed = Math.min(targetMinutes, MAX_RETENTION_MINUTES);

  // Already at (or within 1 minute of) full retention / max time — further Extend does nothing useful.
  return remainingMinutes < maxAllowed - 1;
}

async function extendBookmark(bookmarkId) {
  const record = records[bookmarkId];
  if (!record) return;

  if (!canExtendRetention(record)) {
    setItemFeedback(
      bookmarkId,
      "You cannot extend the duration further. Retention is already at its maximum."
    );
    return;
  }

  const lifecycle = getLifecycle(record);
  records[bookmarkId] = resetRetention(record, settings.retentionMinutes);
  await saveRecords(records);
  setItemFeedback(
    bookmarkId,
    lifecycle === STATUS.GRACE ? "Bookmark kept. Retention reset." : "Retention extended."
  );
  render();
}

async function deleteBookmark(bookmarkId) {
  const record = records[bookmarkId];
  if (!record) return;

  const confirmed = await askConfirm({
    title: "Delete bookmark?",
    message: `"${record.title}" will move to Recently Deleted.`,
    confirmLabel: "Delete"
  });
  if (!confirmed) return;

  deleted = prependDeleted(deleted, toDeletedEntry(record));
  await saveDeleted(deleted);
  delete records[bookmarkId];
  await saveRecords(records);

  try {
    await chrome.bookmarks.remove(bookmarkId);
  } catch (_) {}

  render();
}

function askConfirm({ title, message, confirmLabel = "Delete" }) {
  elements.confirmTitle.textContent = title;
  elements.confirmMessage.textContent = message;
  elements.confirmOk.textContent = confirmLabel;
  elements.confirmDialog.classList.remove("hidden");
  elements.confirmOk.focus();

  return new Promise((resolve) => {
    const finish = (value) => {
      elements.confirmDialog.classList.add("hidden");
      elements.confirmCancel.removeEventListener("click", onCancel);
      elements.confirmOk.removeEventListener("click", onOk);
      elements.confirmDialog.removeEventListener("click", onOverlay);
      document.removeEventListener("keydown", onKey);
      resolve(value);
    };
    const onCancel = () => finish(false);
    const onOk = () => finish(true);
    const onOverlay = (event) => {
      if (event.target === elements.confirmDialog) finish(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") finish(false);
    };

    elements.confirmCancel.addEventListener("click", onCancel);
    elements.confirmOk.addEventListener("click", onOk);
    elements.confirmDialog.addEventListener("click", onOverlay);
    document.addEventListener("keydown", onKey);
  });
}

async function restoreDeleted(entryId) {
  const entry = deleted.find((item) => item.id === entryId);
  if (!entry) return;

  const folder = await ensureFolder();
  const folderChildren = await chrome.bookmarks.getChildren(folder.id);
  const currentBookmarkCount = folderChildren.filter((bookmark) => Boolean(bookmark.url)).length;

  if (currentBookmarkCount >= MAX_BOOKMARK_COUNT) {
    elements.feedback.textContent =
      `Bookmark limit reached. You can keep up to ${MAX_BOOKMARK_COUNT} bookmarks.`;
    return;
  }

  const normalized = normalizeUrl(entry.url);
  const duplicate = Object.values(records).find(
    (record) => normalizeUrl(record.url) === normalized
  );

  if (duplicate) {
    records[duplicate.bookmarkId] = resetRetention(duplicate, settings.retentionMinutes);
    await saveRecords(records);
    deleted = removeDeletedEntry(deleted, entryId);
    await saveDeleted(deleted);
    elements.feedback.textContent = "Already saved. Retention was reset.";
    render();
    return;
  }

  const bookmark = await chrome.bookmarks.create({
    parentId: folder.id,
    title: entry.title || entry.url,
    url: entry.url
  });

  const now = Date.now();
  const retentionMinutes = clampRetention(entry.retentionMinutes || settings.retentionMinutes);

  records[bookmark.id] = {
    bookmarkId: bookmark.id,
    title: bookmark.title || entry.url,
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
  deleted = removeDeletedEntry(deleted, entryId);
  await saveDeleted(deleted);
  elements.feedback.textContent = "Bookmark restored.";
  render();
}

async function purgeDeleted(entryId) {
  deleted = removeDeletedEntry(deleted, entryId);
  await saveDeleted(deleted);
  render();
}

async function refreshTimers() {
  elements.refreshButton.classList.remove("spinning");
  // Restart animation even on rapid clicks.
  void elements.refreshButton.offsetWidth;
  elements.refreshButton.classList.add("spinning");

  await loadData();
  elements.feedback.textContent = "Timers refreshed.";
}

elements.saveButton.addEventListener("click", saveCurrentPage);
elements.search.addEventListener("input", render);
elements.sort.addEventListener("change", render);
elements.refreshButton.addEventListener("click", refreshTimers);
elements.refreshButton.addEventListener("animationend", () => {
  elements.refreshButton.classList.remove("spinning");
});
elements.settingsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
elements.openOnboardingButton.addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/onboarding.html") }));

loadData();
