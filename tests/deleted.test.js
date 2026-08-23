import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_DELETED_COUNT } from "../shared/constants.js";
import { prependDeleted, removeDeletedEntry, toDeletedEntry } from "../shared/deleted.js";
import { NOW, makeRecord } from "./helpers/record.js";

describe("toDeletedEntry", () => {
  it("copies bookmark fields into a deleted entry", () => {
    const record = makeRecord({ bookmarkId: "bm-9", retentionMinutes: 45 });
    const entry = toDeletedEntry(record, NOW);

    assert.equal(entry.id, `${NOW}-bm-9`);
    assert.equal(entry.bookmarkId, "bm-9");
    assert.equal(entry.title, record.title);
    assert.equal(entry.url, record.url);
    assert.equal(entry.deletedAt, NOW);
    assert.equal(entry.retentionMinutes, 45);
  });
});

describe("prependDeleted", () => {
  it("puts the newest entry first and caps the list", () => {
    const first = { id: "old" };
    const second = { id: "new" };
    assert.deepEqual(prependDeleted([first], second), [second, first]);

    const overflow = Array.from({ length: MAX_DELETED_COUNT }, (_, index) => ({ id: String(index) }));
    const next = prependDeleted(overflow, { id: "newest" });
    assert.equal(next.length, MAX_DELETED_COUNT);
    assert.equal(next[0].id, "newest");
    assert.equal(next.at(-1).id, String(MAX_DELETED_COUNT - 2));
  });
});

describe("removeDeletedEntry", () => {
  it("removes only the matching id", () => {
    const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
    assert.deepEqual(removeDeletedEntry(list, "b"), [{ id: "a" }, { id: "c" }]);
    assert.deepEqual(removeDeletedEntry(null, "a"), []);
  });
});
