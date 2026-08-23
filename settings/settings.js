import { MAX_RETENTION_MINUTES, MIN_RETENTION_MINUTES } from "../shared/constants.js";
import { getDeleted, getRecords, getSettings, saveSettings } from "../shared/storage.js";
import { clampRetention } from "../shared/retention.js";

const form = document.querySelector("#settingsForm");
const valueInput = document.querySelector("#retentionValue");
const unitSelect = document.querySelector("#retentionUnit");
const warningEnabled = document.querySelector("#warningEnabled");
const deletionNotificationEnabled = document.querySelector("#deletionNotificationEnabled");
const validationMessage = document.querySelector("#validationMessage");
const feedback = document.querySelector("#feedback");
const exportButton = document.querySelector("#exportButton");
const exportFeedback = document.querySelector("#exportFeedback");

const RANGE_MESSAGE = "Choose a duration between 1 minute and 10 months.";

function readMinutes() {
  return Number(valueInput.value) * Number(unitSelect.value);
}

function validateDuration() {
  const minutes = readMinutes();
  validationMessage.textContent =
    minutes < MIN_RETENTION_MINUTES || minutes > MAX_RETENTION_MINUTES ? RANGE_MESSAGE : "";
  return validationMessage.textContent === "";
}

function setDurationFromMinutes(totalMinutes) {
  if (totalMinutes % 1440 === 0) {
    unitSelect.value = "1440";
    valueInput.value = totalMinutes / 1440;
  } else if (totalMinutes % 60 === 0) {
    unitSelect.value = "60";
    valueInput.value = totalMinutes / 60;
  } else {
    unitSelect.value = "1";
    valueInput.value = totalMinutes;
  }
}

async function load() {
  const settings = await getSettings();
  setDurationFromMinutes(settings.retentionMinutes);
  warningEnabled.checked = settings.warningEnabled;
  deletionNotificationEnabled.checked = settings.deletionNotificationEnabled;
  validationMessage.textContent = "";
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function exportData() {
  exportFeedback.textContent = "Preparing export…";

  const [settings, records, deleted] = await Promise.all([
    getSettings(),
    getRecords(),
    getDeleted()
  ]);

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const payload = {
    exportedAt: new Date().toISOString(),
    formatVersion: 1,
    extension: "The Last Bookmark Bender",
    settings,
    bookmarks: Object.values(records),
    recentlyDeleted: deleted
  };

  downloadJson(`last-bookmark-bender-export-${stamp}.json`, payload);
  exportFeedback.textContent = `Exported ${payload.bookmarks.length} bookmarks and ${payload.recentlyDeleted.length} deleted items.`;
}

valueInput.addEventListener("keydown", (event) => {
  if (["e", "E", "+", "-", ".", ","].includes(event.key)) {
    event.preventDefault();
  }
});

valueInput.addEventListener("paste", (event) => {
  event.preventDefault();
  const pasted = (event.clipboardData || window.clipboardData).getData("text");
  const digits = pasted.replace(/\D/g, "");
  if (!digits) return;
  valueInput.value = String(Math.max(1, Number(digits)));
  validateDuration();
});

valueInput.addEventListener("input", () => {
  const digits = valueInput.value.replace(/\D/g, "");
  if (valueInput.value !== digits) {
    valueInput.value = digits;
  }
  if (digits !== "" && Number(digits) < 1) {
    valueInput.value = "1";
  }
  feedback.textContent = "";
  validateDuration();
});

unitSelect.addEventListener("change", () => {
  feedback.textContent = "";
  validateDuration();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const minutes = readMinutes();
  if (!validateDuration()) return;

  const current = await getSettings();
  await saveSettings({
    ...current,
    retentionMinutes: clampRetention(minutes),
    warningEnabled: warningEnabled.checked,
    deletionNotificationEnabled: deletionNotificationEnabled.checked
  });
  validationMessage.textContent = "";
  feedback.textContent = "Settings saved.";
});

exportButton.addEventListener("click", () => {
  exportData().catch((error) => {
    console.error(error);
    exportFeedback.textContent = "Export failed.";
  });
});

load();
