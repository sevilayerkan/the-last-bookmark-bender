import { MAX_RETENTION_MINUTES, MIN_RETENTION_MINUTES } from "../shared/constants.js";
import { getSettings, saveSettings } from "../shared/storage.js";
import { clampRetention } from "../shared/retention.js";

const form = document.querySelector("#settingsForm");
const valueInput = document.querySelector("#retentionValue");
const unitSelect = document.querySelector("#retentionUnit");
const warningEnabled = document.querySelector("#warningEnabled");
const deletionNotificationEnabled = document.querySelector("#deletionNotificationEnabled");
const validationMessage = document.querySelector("#validationMessage");
const feedback = document.querySelector("#feedback");

async function load() {
  const settings = await getSettings();
  const isWholeDays = settings.retentionMinutes % 1440 === 0;
  unitSelect.value = isWholeDays ? "1440" : "60";
  valueInput.value = isWholeDays ? settings.retentionMinutes / 1440 : settings.retentionMinutes / 60;
  warningEnabled.checked = settings.warningEnabled;
  deletionNotificationEnabled.checked = settings.deletionNotificationEnabled;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const minutes = Number(valueInput.value) * Number(unitSelect.value);
  if (minutes < MIN_RETENTION_MINUTES || minutes > MAX_RETENTION_MINUTES) {
    validationMessage.textContent = "Choose a duration between 1 hour and 30 days.";
    return;
  }

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

load();
