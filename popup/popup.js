import {
  FOLDER_NAME,
  MAX_BOOKMARK_COUNT,
  STATUS
} from "../shared/constants.js";
import { getFolderId, getRecords, getSettings, saveRecords } from "../shared/storage.js";
import { formatRemaining, getLifecycle, resetRetention } from "../shared/retention.js";

const elements = {
  currentPage: document.querySelector("#currentPage"),
  saveButton: document.querySelector("#saveButton"),
  feedback: document.querySelector("#feedback"),
  list: document.querySelector("#bookmarkList"),
  search: document.querySelector("#searchInput"),
  sort: document.querySelector("#sortSelect"),
  settingsButton: document.querySelector("#settingsButton"),
  onboardingNotice: document.querySelector("#onboardingNotice"),
  openOnboardingButton: document.querySelector("#openOnboardingButton")
};

let activeTab = null;
let settings = null;
let records = {};

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
  elements.onboardingNotice.classList.toggle("hidden", settings.onboardingCompleted);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab;
  elements.currentPage.textContent = tab?.title || "Untitled page";
  elements.saveButton.disabled = !isSupportedUrl(tab?.url) || !settings.onboardingCompleted;

  await chrome.runtime.sendMessage({ type: "PROCESS_EXPIRATIONS" });
  records = await getRecords();
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
}

function renderBookmark(record) {
  const lifecycle = getLifecycle(record);
  const item = document.createElement("article");
  item.className = "bookmark-item";
  if (lifecycle === STATUS.GRACE || lifecycle === "delete") item.classList.add("status-grace");
  else if (lifecycle === STATUS.EXPIRING_SOON || lifecycle === "start-grace") item.classList.add("status-expiring");

  const target = record.gracePeriodEndsAt || record.expiresAt;
  item.innerHTML = `
    <a class="bookmark-title" href="#" title="${escapeHtml(record.title)}">${escapeHtml(record.title)}</a>
    <div class="bookmark-url">${escapeHtml(record.url)}</div>
    <div class="meta"><span>${lifecycle === STATUS.GRACE ? "Deletion in" : "Remaining"}</span><strong>${formatRemaining(target)}</strong></div>
    <div class="actions">
      <button data-action="open">Open</button>
      <button data-action="keep">${lifecycle === STATUS.GRACE ? "Keep" : "Extend"}</button>
      <button data-action="delete" class="danger">Delete</button>
    </div>`;

  item.querySelector(".bookmark-title").addEventListener("click", (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: record.url });
  });
  item.querySelector('[data-action="open"]').addEventListener("click", () => chrome.tabs.create({ url: record.url }));
  item.querySelector('[data-action="keep"]').addEventListener("click", () => extendBookmark(record.bookmarkId));
  item.querySelector('[data-action="delete"]').addEventListener("click", () => deleteBookmark(record.bookmarkId));
  return item;
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

async function extendBookmark(bookmarkId) {
  if (!records[bookmarkId]) return;
  records[bookmarkId] = resetRetention(records[bookmarkId], settings.retentionMinutes);
  await saveRecords(records);
  render();
}

async function deleteBookmark(bookmarkId) {
  try {
    await chrome.bookmarks.remove(bookmarkId);
  } catch (_) {}
  delete records[bookmarkId];
  await saveRecords(records);
  render();
}

elements.saveButton.addEventListener("click", saveCurrentPage);
elements.search.addEventListener("input", render);
elements.sort.addEventListener("change", render);
elements.settingsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
elements.openOnboardingButton.addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/onboarding.html") }));

loadData();

