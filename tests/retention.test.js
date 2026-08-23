import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GRACE_PERIOD_MINUTES,
  MAX_RETENTION_MINUTES,
  MIN_RETENTION_MINUTES,
  STATUS
} from "../shared/constants.js";
import {
  canExtendRetention,
  clampRetention,
  countAttentionRecords,
  formatRemaining,
  getLifecycle,
  resetRetention,
  startGrace,
  warningLeadMinutes
} from "../shared/retention.js";
import { MIN, NOW, makeRecord } from "./helpers/record.js";

describe("clampRetention", () => {
  it("returns the minimum for non-finite values", () => {
    assert.equal(clampRetention(undefined), MIN_RETENTION_MINUTES);
    assert.equal(clampRetention("nope"), MIN_RETENTION_MINUTES);
    assert.equal(clampRetention(Number.NaN), MIN_RETENTION_MINUTES);
    assert.equal(clampRetention(Infinity), MIN_RETENTION_MINUTES);
  });

  it("clamps to the allowed range and rounds", () => {
    assert.equal(clampRetention(0), MIN_RETENTION_MINUTES);
    assert.equal(clampRetention(-10), MIN_RETENTION_MINUTES);
    assert.equal(clampRetention(MAX_RETENTION_MINUTES + 1), MAX_RETENTION_MINUTES);
    assert.equal(clampRetention(1.4), 1);
    assert.equal(clampRetention(1.5), 2);
  });
});

describe("warningLeadMinutes", () => {
  it("uses 15 minutes below 6 hours", () => {
    assert.equal(warningLeadMinutes(6 * 60 - 1), 15);
  });

  it("uses 1 hour from 6 hours through 48 hours", () => {
    assert.equal(warningLeadMinutes(6 * 60), 60);
    assert.equal(warningLeadMinutes(48 * 60), 60);
  });

  it("uses 24 hours above 48 hours", () => {
    assert.equal(warningLeadMinutes(48 * 60 + 1), 24 * 60);
  });
});

describe("getLifecycle", () => {
  it("is active before the warning window", () => {
    const record = makeRecord({ retentionMinutes: 60, expiresAt: NOW + 60 * MIN });
    const warningAt = record.expiresAt - 15 * MIN;
    assert.equal(getLifecycle(record, warningAt - 1), STATUS.ACTIVE);
  });

  it("is expiring-soon from the warning instant until expiration", () => {
    const record = makeRecord({ retentionMinutes: 60, expiresAt: NOW + 60 * MIN });
    const warningAt = record.expiresAt - 15 * MIN;
    assert.equal(getLifecycle(record, warningAt), STATUS.EXPIRING_SOON);
    assert.equal(getLifecycle(record, record.expiresAt - 1), STATUS.EXPIRING_SOON);
  });

  it("requests start-grace at expiresAt when grace has not started", () => {
    const record = makeRecord({ expiresAt: NOW, gracePeriodEndsAt: null });
    assert.equal(getLifecycle(record, NOW), "start-grace");
  });

  it("is in grace until gracePeriodEndsAt", () => {
    const record = makeRecord({
      expiresAt: NOW - MIN,
      gracePeriodEndsAt: NOW + GRACE_PERIOD_MINUTES * MIN
    });
    assert.equal(getLifecycle(record, NOW), STATUS.GRACE);
    assert.equal(getLifecycle(record, record.gracePeriodEndsAt - 1), STATUS.GRACE);
  });

  it("requests delete at gracePeriodEndsAt", () => {
    const record = makeRecord({ gracePeriodEndsAt: NOW });
    assert.equal(getLifecycle(record, NOW), "delete");
  });
});

describe("startGrace", () => {
  it("starts a grace window of GRACE_PERIOD_MINUTES", () => {
    const next = startGrace(makeRecord({ expiresAt: NOW }), NOW);
    assert.equal(next.status, STATUS.GRACE);
    assert.equal(next.gracePeriodStartedAt, NOW);
    assert.equal(next.gracePeriodEndsAt, NOW + GRACE_PERIOD_MINUTES * MIN);
    assert.equal(next.graceNotifiedAt, NOW);
    assert.equal(getLifecycle(next, NOW), STATUS.GRACE);
    assert.equal(getLifecycle(next, next.gracePeriodEndsAt), "delete");
  });

  it("keeps an existing warnedAt timestamp", () => {
    const warnedAt = NOW - 5 * MIN;
    const next = startGrace(makeRecord({ warnedAt }), NOW);
    assert.equal(next.warnedAt, warnedAt);
  });
});

describe("resetRetention", () => {
  it("clears grace fields and sets a fresh expiry", () => {
    const next = resetRetention(
      makeRecord({
        status: STATUS.GRACE,
        warnedAt: NOW,
        gracePeriodStartedAt: NOW,
        gracePeriodEndsAt: NOW + MIN,
        graceNotifiedAt: NOW
      }),
      30,
      NOW
    );

    assert.equal(next.status, STATUS.ACTIVE);
    assert.equal(next.retentionMinutes, 30);
    assert.equal(next.expiresAt, NOW + 30 * MIN);
    assert.equal(next.warnedAt, null);
    assert.equal(next.gracePeriodStartedAt, null);
    assert.equal(next.gracePeriodEndsAt, null);
    assert.equal(next.graceNotifiedAt, null);
  });
});

describe("formatRemaining", () => {
  it("formats minutes, hours, and days", () => {
    assert.equal(formatRemaining(NOW, NOW), "0m");
    assert.equal(formatRemaining(NOW + 59 * MIN, NOW), "59m");
    assert.equal(formatRemaining(NOW + 60 * MIN, NOW), "1h");
    assert.equal(formatRemaining(NOW + 24 * 60 * MIN, NOW), "1d");
  });
});

describe("canExtendRetention", () => {
  it("allows Keep during grace, pending grace, or pending delete", () => {
    assert.equal(
      canExtendRetention(makeRecord({ gracePeriodEndsAt: NOW + MIN }), 60, NOW),
      true
    );
    assert.equal(canExtendRetention(makeRecord({ expiresAt: NOW }), 60, NOW), true);
    assert.equal(canExtendRetention(makeRecord({ gracePeriodEndsAt: NOW }), 60, NOW), true);
  });

  it("rejects Extend when remaining time is already near the cap", () => {
    const record = makeRecord({ expiresAt: NOW + 60 * MIN });
    assert.equal(canExtendRetention(record, 60, NOW), false);
  });

  it("allows Extend when remaining time is under the cap", () => {
    const record = makeRecord({ expiresAt: NOW + 10 * MIN });
    assert.equal(canExtendRetention(record, 60, NOW), true);
  });
});

describe("countAttentionRecords", () => {
  it("counts warning, grace, and pending-delete records", () => {
    const records = {
      a: makeRecord({ expiresAt: NOW + 60 * MIN }),
      b: makeRecord({ bookmarkId: "2", expiresAt: NOW + 10 * MIN, retentionMinutes: 60 }),
      c: makeRecord({ bookmarkId: "3", gracePeriodEndsAt: NOW + MIN }),
      d: makeRecord({ bookmarkId: "4", expiresAt: NOW }),
      e: makeRecord({ bookmarkId: "5", gracePeriodEndsAt: NOW })
    };

    assert.equal(countAttentionRecords({}, NOW), 0);
    assert.equal(countAttentionRecords(records, NOW), 4);
  });
});
