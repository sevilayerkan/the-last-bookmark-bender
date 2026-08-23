import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  MAX_BOOKMARK_COUNT,
  STATUS,
  STORAGE_KEYS
} from "../shared/constants.js";
import {
  isSupportedUrl,
  normalizeUrl,
  restoreDeletedBookmark,
  saveTemporaryBookmark
} from "../shared/bookmarks.js";
import { installChromeMock } from "./helpers/chrome-mock.js";
import { MIN, NOW, makeRecord } from "./helpers/record.js";

const URL = "https://example.com/page";
const DELETED_ID = "del-1";

function deletedEntry(overrides = {}) {
  return {
    id: DELETED_ID,
    bookmarkId: "old-1",
    title: "Old title",
    url: URL,
    deletedAt: NOW - 5 * MIN,
    retentionMinutes: 20,
    ...overrides
  };
}

function fillFolder(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `existing-${index}`,
    title: `Item ${index}`,
    url: `https://filled.example/${index}`
  }));
}

describe("normalizeUrl / isSupportedUrl", () => {
  it("accepts only http(s) URLs", () => {
    assert.equal(isSupportedUrl("https://example.com"), true);
    assert.equal(isSupportedUrl("http://example.com"), true);
    assert.equal(isSupportedUrl("chrome://extensions"), false);
    assert.equal(isSupportedUrl("chrome-extension://abc/popup.html"), false);
  });

  it("ignores hash and trailing slashes when comparing", () => {
    assert.equal(normalizeUrl("https://example.com/page/#section"), "https://example.com/page");
    assert.equal(normalizeUrl("https://example.com/"), "https://example.com");
  });
});

describe("saveTemporaryBookmark", () => {
  let mock;

  beforeEach(() => {
    mock = installChromeMock({ settings: { retentionMinutes: 60 } });
  });

  it("requires onboarding before saving", async () => {
    mock = installChromeMock({ settings: { onboardingCompleted: false } });
    const result = await saveTemporaryBookmark({ title: "Example", url: URL });
    assert.equal(result.ok, false);
    assert.equal(result.code, "setup-required");
    assert.equal(mock.createCalls(), 0);
  });

  it("rejects unsupported URLs", async () => {
    const result = await saveTemporaryBookmark({ title: "Ext", url: "chrome://flags" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "unsupported-url");
    assert.equal(mock.createCalls(), 0);
  });

  it("saves a new bookmark with clamped retention", async () => {
    const result = await saveTemporaryBookmark({ title: "Example", url: URL, now: NOW });
    assert.equal(result.ok, true);
    assert.equal(result.code, "saved");
    assert.equal(result.message, `Saved to lastbookmark. 1/${MAX_BOOKMARK_COUNT}`);

    const records = mock.store[STORAGE_KEYS.RECORDS];
    const record = records[result.bookmarkId];
    assert.equal(record.url, URL);
    assert.equal(record.status, STATUS.ACTIVE);
    assert.equal(record.retentionMinutes, 60);
    assert.equal(record.expiresAt, NOW + 60 * MIN);
    assert.equal(record.gracePeriodEndsAt, null);
    assert.equal(mock.createCalls(), 1);
  });

  it("resets retention for a duplicate URL and does not create another bookmark", async () => {
    const existing = makeRecord({
      bookmarkId: "dup-1",
      url: "https://example.com/page#old",
      expiresAt: NOW + 5 * MIN,
      gracePeriodEndsAt: NOW + MIN,
      gracePeriodStartedAt: NOW,
      status: STATUS.GRACE
    });
    mock = installChromeMock({
      settings: { retentionMinutes: 60 },
      records: { "dup-1": existing }
    });

    const result = await saveTemporaryBookmark({
      title: "Example",
      url: "https://example.com/page/",
      now: NOW
    });

    assert.equal(result.ok, true);
    assert.equal(result.code, "reset");
    assert.equal(result.bookmarkId, "dup-1");
    assert.equal(mock.createCalls(), 0);

    const record = mock.store[STORAGE_KEYS.RECORDS]["dup-1"];
    assert.equal(record.status, STATUS.ACTIVE);
    assert.equal(record.expiresAt, NOW + 60 * MIN);
    assert.equal(record.gracePeriodEndsAt, null);
    assert.equal(Object.keys(mock.store[STORAGE_KEYS.RECORDS]).length, 1);
  });

  it("rejects a new bookmark at the max count", async () => {
    mock = installChromeMock({
      settings: { retentionMinutes: 60 },
      folderChildren: fillFolder(MAX_BOOKMARK_COUNT)
    });

    const result = await saveTemporaryBookmark({ title: "One more", url: URL });
    assert.equal(result.ok, false);
    assert.equal(result.code, "limit");
    assert.equal(mock.createCalls(), 0);
    assert.deepEqual(mock.store[STORAGE_KEYS.RECORDS], {});
  });

  it("still resets a duplicate when the folder is already full", async () => {
    const existing = makeRecord({ bookmarkId: "dup-1", url: URL, expiresAt: NOW + MIN });
    mock = installChromeMock({
      settings: { retentionMinutes: 90 },
      records: { "dup-1": existing },
      folderChildren: fillFolder(MAX_BOOKMARK_COUNT)
    });

    const result = await saveTemporaryBookmark({ title: "Example", url: URL, now: NOW });
    assert.equal(result.ok, true);
    assert.equal(result.code, "reset");
    assert.equal(mock.createCalls(), 0);
    assert.equal(mock.store[STORAGE_KEYS.RECORDS]["dup-1"].expiresAt, NOW + 90 * MIN);
  });
});

describe("restoreDeletedBookmark", () => {
  let mock;

  beforeEach(() => {
    mock = installChromeMock({
      settings: { retentionMinutes: 60 },
      deleted: [deletedEntry()]
    });
  });

  it("restores a deleted entry as a new bookmark and drops it from Recently Deleted", async () => {
    const result = await restoreDeletedBookmark(DELETED_ID, { now: NOW });
    assert.equal(result.ok, true);
    assert.equal(result.code, "restored");
    assert.equal(result.message, "Bookmark restored.");

    const record = mock.store[STORAGE_KEYS.RECORDS][result.bookmarkId];
    assert.equal(record.url, URL);
    assert.equal(record.retentionMinutes, 20);
    assert.equal(record.expiresAt, NOW + 20 * MIN);
    assert.equal(record.status, STATUS.ACTIVE);
    assert.deepEqual(mock.store[STORAGE_KEYS.DELETED], []);
    assert.equal(mock.createCalls(), 1);
  });

  it("uses settings retention when the deleted entry has none", async () => {
    mock = installChromeMock({
      settings: { retentionMinutes: 60 },
      deleted: [deletedEntry({ retentionMinutes: undefined })]
    });

    const result = await restoreDeletedBookmark(DELETED_ID, { now: NOW });
    const record = mock.store[STORAGE_KEYS.RECORDS][result.bookmarkId];
    assert.equal(record.retentionMinutes, 60);
    assert.equal(record.expiresAt, NOW + 60 * MIN);
  });

  it("resets an existing duplicate instead of creating a second bookmark", async () => {
    const existing = makeRecord({
      bookmarkId: "live-1",
      url: "https://example.com/page#hash",
      expiresAt: NOW + MIN,
      gracePeriodEndsAt: NOW + MIN
    });
    mock = installChromeMock({
      settings: { retentionMinutes: 60 },
      records: { "live-1": existing },
      deleted: [deletedEntry()]
    });

    const result = await restoreDeletedBookmark(DELETED_ID, { now: NOW });
    assert.equal(result.ok, true);
    assert.equal(result.code, "reset");
    assert.equal(result.bookmarkId, "live-1");
    assert.equal(mock.createCalls(), 0);
    assert.equal(mock.store[STORAGE_KEYS.RECORDS]["live-1"].gracePeriodEndsAt, null);
    assert.deepEqual(mock.store[STORAGE_KEYS.DELETED], []);
  });

  it("rejects restore when the folder is at the max count", async () => {
    mock = installChromeMock({
      settings: { retentionMinutes: 60 },
      deleted: [deletedEntry()],
      folderChildren: fillFolder(MAX_BOOKMARK_COUNT)
    });

    const result = await restoreDeletedBookmark(DELETED_ID);
    assert.equal(result.ok, false);
    assert.equal(result.code, "limit");
    assert.equal(mock.createCalls(), 0);
    assert.equal(mock.store[STORAGE_KEYS.DELETED].length, 1);
    assert.deepEqual(mock.store[STORAGE_KEYS.RECORDS], {});
  });

  it("still resets a duplicate restore when the folder is full", async () => {
    const existing = makeRecord({ bookmarkId: "live-1", url: URL, expiresAt: NOW + MIN });
    mock = installChromeMock({
      settings: { retentionMinutes: 60 },
      records: { "live-1": existing },
      deleted: [deletedEntry()],
      folderChildren: fillFolder(MAX_BOOKMARK_COUNT)
    });

    const result = await restoreDeletedBookmark(DELETED_ID, { now: NOW });
    assert.equal(result.ok, true);
    assert.equal(result.code, "reset");
    assert.equal(mock.store[STORAGE_KEYS.DELETED].length, 0);
  });

  it("returns not-found for an unknown deleted id", async () => {
    const result = await restoreDeletedBookmark("missing");
    assert.equal(result.ok, false);
    assert.equal(result.code, "not-found");
    assert.equal(mock.createCalls(), 0);
  });
});
