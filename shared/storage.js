import { DEFAULT_SETTINGS, STORAGE_KEYS } from "./constants.js";

export async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) };
}

export async function saveSettings(settings) {
  const normalized = { ...DEFAULT_SETTINGS, ...settings };
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: normalized });
  return normalized;
}

export async function getRecords() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.RECORDS);
  return result[STORAGE_KEYS.RECORDS] || {};
}

export async function saveRecords(records) {
  await chrome.storage.local.set({ [STORAGE_KEYS.RECORDS]: records });
}

export async function getFolderId() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.FOLDER_ID);
  return result[STORAGE_KEYS.FOLDER_ID] || null;
}

export async function saveFolderId(folderId) {
  await chrome.storage.local.set({ [STORAGE_KEYS.FOLDER_ID]: folderId });
}
