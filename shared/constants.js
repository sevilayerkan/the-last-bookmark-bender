export const FOLDER_NAME = "lastbookmark";
export const STORAGE_KEYS = {
  SETTINGS: "lbbSettings",
  RECORDS: "lbbRecords",
  DELETED: "lbbDeleted",
  FOLDER_ID: "lbbFolderId"
};

export const DEFAULT_SETTINGS = {
  onboardingCompleted: false,
  retentionMinutes: 7 * 24 * 60,
  warningEnabled: true,
  deletionNotificationEnabled: true
};

export const MIN_RETENTION_MINUTES = 1;
export const MAX_RETENTION_MINUTES = 120 * 24 * 60;
// TEMP (testing): was 24 * 60. Restore before release.
export const GRACE_PERIOD_MINUTES = 2;
export const CHECK_ALARM_NAME = "lbb-check-expirations";
// TEMP (testing): was 15. Keep ≤ grace so deletions fire on time.
export const CHECK_INTERVAL_MINUTES = 1;
export const MAX_BOOKMARK_COUNT = 100;
export const MAX_DELETED_COUNT = 50;

export const STATUS = {
  ACTIVE: "active",
  EXPIRING_SOON: "expiring-soon",
  GRACE: "grace-period"
};
