import {
  GRACE_PERIOD_MINUTES,
  MAX_RETENTION_MINUTES,
  MIN_RETENTION_MINUTES,
  STATUS
} from "./constants.js";

export function clampRetention(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value)) return MIN_RETENTION_MINUTES;
  return Math.min(MAX_RETENTION_MINUTES, Math.max(MIN_RETENTION_MINUTES, Math.round(value)));
}

export function warningLeadMinutes(retentionMinutes) {
  if (retentionMinutes < 6 * 60) return 15;
  if (retentionMinutes <= 48 * 60) return 60;
  return 24 * 60;
}

export function getLifecycle(record, now = Date.now()) {
  if (record.gracePeriodEndsAt) {
    if (now >= record.gracePeriodEndsAt) return "delete";
    return STATUS.GRACE;
  }

  if (now >= record.expiresAt) return "start-grace";

  const warningAt = record.expiresAt - warningLeadMinutes(record.retentionMinutes) * 60_000;
  if (now >= warningAt) return STATUS.EXPIRING_SOON;
  return STATUS.ACTIVE;
}

export function startGrace(record, now = Date.now()) {
  return {
    ...record,
    status: STATUS.GRACE,
    gracePeriodStartedAt: now,
    gracePeriodEndsAt: now + GRACE_PERIOD_MINUTES * 60_000,
    warnedAt: record.warnedAt || now,
    graceNotifiedAt: now
  };
}

export function resetRetention(record, retentionMinutes, now = Date.now()) {
  const safeMinutes = clampRetention(retentionMinutes);
  return {
    ...record,
    retentionMinutes: safeMinutes,
    expiresAt: now + safeMinutes * 60_000,
    status: STATUS.ACTIVE,
    warnedAt: null,
    gracePeriodStartedAt: null,
    gracePeriodEndsAt: null,
    graceNotifiedAt: null
  };
}

export function formatRemaining(targetTimestamp, now = Date.now()) {
  const diff = Math.max(0, targetTimestamp - now);
  const minutes = Math.ceil(diff / 60_000);

  if (minutes < 60) return `${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.ceil(hours / 24);
  return `${days}d`;
}
