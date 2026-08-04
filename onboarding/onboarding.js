import { MAX_RETENTION_MINUTES, MIN_RETENTION_MINUTES } from "../shared/constants.js";
import { getSettings, saveSettings } from "../shared/storage.js";
import { clampRetention } from "../shared/retention.js";

const form = document.querySelector("#setupForm");
const presetButtons = [...document.querySelectorAll("[data-minutes]")];
const customValue = document.querySelector("#customValue");
const customUnit = document.querySelector("#customUnit");
const validationMessage = document.querySelector("#validationMessage");
let selectedMinutes = 7 * 24 * 60;

function selectPreset(minutes) {
  selectedMinutes = Number(minutes);
  presetButtons.forEach((button) => button.classList.toggle("selected", Number(button.dataset.minutes) === selectedMinutes));
}

presetButtons.forEach((button) => button.addEventListener("click", () => {
  selectPreset(button.dataset.minutes);
  customValue.value = selectedMinutes % 1440 === 0 ? selectedMinutes / 1440 : selectedMinutes / 60;
  customUnit.value = selectedMinutes % 1440 === 0 ? "1440" : "60";
  validationMessage.textContent = "";
}));

function readCustomMinutes() {
  return Number(customValue.value) * Number(customUnit.value);
}

function syncCustom() {
  const minutes = readCustomMinutes();
  presetButtons.forEach((button) => button.classList.remove("selected"));
  selectedMinutes = minutes;
  validationMessage.textContent = minutes < MIN_RETENTION_MINUTES || minutes > MAX_RETENTION_MINUTES
    ? "Choose a duration between 1 minute and 10 months."
    : "";
}

customValue.addEventListener("keydown", (event) => {
  if (["e", "E", "+", "-", ".", ","].includes(event.key)) {
    event.preventDefault();
  }
});

customValue.addEventListener("paste", (event) => {
  event.preventDefault();
  const pasted = (event.clipboardData || window.clipboardData).getData("text");
  const digits = pasted.replace(/\D/g, "");
  if (!digits) return;
  customValue.value = String(Math.max(1, Number(digits)));
  syncCustom();
});

customValue.addEventListener("input", () => {
  const digits = customValue.value.replace(/\D/g, "");
  if (customValue.value !== digits) {
    customValue.value = digits;
  }
  if (digits !== "" && Number(digits) < 1) {
    customValue.value = "1";
  }
  syncCustom();
});
customUnit.addEventListener("change", syncCustom);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const minutes = selectedMinutes;
  if (minutes < MIN_RETENTION_MINUTES || minutes > MAX_RETENTION_MINUTES) {
    validationMessage.textContent = "Choose a duration between 1 minute and 10 months.";
    return;
  }

  const settings = await getSettings();
  await saveSettings({ ...settings, onboardingCompleted: true, retentionMinutes: clampRetention(minutes) });
  await chrome.runtime.sendMessage({ type: "ENSURE_FOLDER" });
  window.close();
});
