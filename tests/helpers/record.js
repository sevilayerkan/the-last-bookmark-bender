import { STATUS } from "../../shared/constants.js";

export const NOW = 1_700_000_000_000;
export const MIN = 60_000;

export function makeRecord(overrides = {}) {
  return {
    bookmarkId: "1",
    title: "Example",
    url: "https://example.com",
    createdAt: NOW,
    retentionMinutes: 60,
    expiresAt: NOW + 60 * MIN,
    status: STATUS.ACTIVE,
    warnedAt: null,
    gracePeriodStartedAt: null,
    gracePeriodEndsAt: null,
    graceNotifiedAt: null,
    ...overrides
  };
}
