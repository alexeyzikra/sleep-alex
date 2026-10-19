/**
 * Хранение в localStorage + экспорт/импорт JSON.
 *
 * Каждое обращение к localStorage обёрнуто в try/catch: в приватном окне
 * и при заблокированных данных сайта он может бросать исключение, и
 * приложение должно продолжать работать (пусть и без сохранения).
 */

import { todayISO } from './model.js';

const STORAGE_KEY = 'sleepmaster.v1';
export const DATA_VERSION = 1;

export const DEFAULT_SETTINGS = {
  targetSleepHours: 8,
  bedWindow: { start: '23:00', end: '00:00' },
  wakeWindow: { start: '07:00', end: '08:30' },
  bufferMinutes: 45,
};

function emptyData() {
  return {
    version: DATA_VERSION,
    settings: { ...DEFAULT_SETTINGS, bedWindow: { ...DEFAULT_SETTINGS.bedWindow }, wakeWindow: { ...DEFAULT_SETTINGS.wakeWindow } },
    entries: {},
    meta: { onboarded: false, createdAt: new Date().toISOString(), lastExportAt: null },
  };
}

/** Доступен ли localStorage вообще (приватный режим, запрет данных сайта) */
export let storageAvailable = true;

function readRaw() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    storageAvailable = false;
    return null;
  }
}

function writeRaw(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
    storageAvailable = true;
    return true;
  } catch {
    storageAvailable = false;
    return false;
  }
}

/** Приводит любой объект к актуальной схеме — на будущее, под миграции */
export function normalize(raw) {
  const base = emptyData();
  if (!raw || typeof raw !== 'object') return base;

  const settings = { ...base.settings, ...(raw.settings || {}) };
  settings.bedWindow = { ...base.settings.bedWindow, ...((raw.settings || {}).bedWindow || {}) };
  settings.wakeWindow = { ...base.settings.wakeWindow, ...((raw.settings || {}).wakeWindow || {}) };
  settings.targetSleepHours = Number(settings.targetSleepHours) || DEFAULT_SETTINGS.targetSleepHours;
  settings.bufferMinutes = Number(settings.bufferMinutes) || DEFAULT_SETTINGS.bufferMinutes;

  const entries = {};
  for (const [date, entry] of Object.entries(raw.entries || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!entry || !entry.bedTime || !entry.wakeTime) continue;
    entries[date] = {
      date,
      phoneOffTime: entry.phoneOffTime || null,
      bedTime: entry.bedTime,
      wakeTime: entry.wakeTime,
      energy: Number(entry.energy) || 5,
      hygiene: {
        noPhone: Boolean(entry.hygiene && entry.hygiene.noPhone),
        noCaffeine: Boolean(entry.hygiene && entry.hygiene.noCaffeine),
        goodRoom: Boolean(entry.hygiene && entry.hygiene.goodRoom),
      },
      note: entry.note || '',
      createdAt: entry.createdAt || new Date().toISOString(),
      updatedAt: entry.updatedAt || entry.createdAt || new Date().toISOString(),
    };
  }

  return {
    version: DATA_VERSION,
    settings,
    entries,
    meta: { ...base.meta, ...(raw.meta || {}) },
  };
}

let data = (() => {
  const raw = readRaw();
  if (!raw) return emptyData();
  try {
    return normalize(JSON.parse(raw));
  } catch {
    // Повреждённый JSON лучше не терять молча — отложим копию в сторону
    try { localStorage.setItem(STORAGE_KEY + '.broken', raw); } catch { /* не критично */ }
    return emptyData();
  }
})();

const listeners = new Set();

export function getData() {
  return data;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function commit() {
  writeRaw(JSON.stringify(data));
  for (const fn of listeners) fn(data);
}

// ---------- Операции ----------

export function saveEntry(entry) {
  const now = new Date().toISOString();
  const existing = data.entries[entry.date];
  data.entries[entry.date] = {
    ...entry,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };
  commit();
}

export function deleteEntry(date) {
  delete data.entries[date];
  commit();
}

export function updateSettings(patch) {
  data.settings = { ...data.settings, ...patch };
  commit();
}

export function updateMeta(patch) {
  data.meta = { ...data.meta, ...patch };
  commit();
}

export function clearAll() {
  data = emptyData();
  commit();
}

// ---------- Экспорт / импорт ----------

export function exportFileName() {
  return `sleepmaster-${todayISO()}.json`;
}

export function exportJSON() {
  return JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2);
}

export function downloadBackup() {
  const blob = new Blob([exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  updateMeta({ lastExportAt: new Date().toISOString() });
}

/**
 * Импорт сливает записи по дате, а не затирает всё целиком —
 * так можно свести историю с телефона и с ноутбука.
 * При конфликте побеждает более свежая по updatedAt запись.
 */
export function importJSON(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Это не похоже на JSON-файл бэкапа.');
  }
  const incoming = normalize(parsed);
  if (Object.keys(incoming.entries).length === 0 && !parsed.settings) {
    throw new Error('В файле не нашлось ни записей, ни настроек.');
  }

  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const [date, entry] of Object.entries(incoming.entries)) {
    const mine = data.entries[date];
    if (!mine) {
      data.entries[date] = entry;
      added += 1;
    } else if ((entry.updatedAt || '') > (mine.updatedAt || '')) {
      data.entries[date] = entry;
      updated += 1;
    } else {
      skipped += 1;
    }
  }
  if (parsed.settings) data.settings = incoming.settings;
  commit();
  return { added, updated, skipped };
}

/** Пора ли напомнить про бэкап (раз в 14 дней, если есть что терять) */
export function backupReminderDue() {
  const count = Object.keys(data.entries).length;
  if (count < 7) return false;
  const last = data.meta.lastExportAt;
  if (!last) return true;
  const days = (Date.now() - new Date(last).getTime()) / 86400000;
  return days > 14;
}
