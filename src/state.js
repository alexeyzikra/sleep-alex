/**
 * Хранение в localStorage + экспорт/импорт JSON.
 *
 * Каждое обращение к localStorage обёрнуто в try/catch: в приватном окне
 * и при заблокированных данных сайта он может бросать исключение, и
 * приложение должно продолжать работать (пусть и без сохранения).
 */

import { todayISO, planSnapshot } from './model.js';

const STORAGE_KEY = 'sleep-control.v1';

// Ключ от прежнего названия приложения. Читается ровно один раз —
// при первом запуске после переименования, — чтобы уже записанные
// ночи не остались висеть под недоступным именем.
const LEGACY_STORAGE_KEY = 'sleepmaster.v1';
export const DATA_VERSION = 1;

export const DEFAULT_SETTINGS = {
  // 'simple'  — одно время отбоя и подъёма на все дни
  // 'weekly'  — своё расписание на каждый день недели
  scheduleMode: 'simple',
  // Как отмечать телефон в чек-ине:
  // 'offset' — «за сколько минут до сна», 'clock' — точное время
  phoneInput: 'offset',
  // Сдвиг чётности недели на единицу: ISO-нумерация от начала года
  // не обязана совпадать с учебной от начала семестра
  weekParityOffset: 0,
  bedTime: '23:00',
  wakeTime: '07:30',
  // Расписание по дням недели, ключ — JS getDay() (вс = 0).
  // У дня может быть alt — вариант для нечётных недель.
  days: {},
};

/** Норма часов не хранится: она всегда выводится из отбоя и подъёма. */

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validTime(value, fallback) {
  return TIME_RE.test(String(value)) ? String(value) : fallback;
}

/**
 * Приводит настройки к актуальной схеме, в том числе из старой,
 * где вместо точного времени были окна «с — по» и норма часов руками.
 * Из окна берём его начало: это и есть время будильника.
 */
/**
 * Галочки раньше отмечали СОБЛЮДЁННУЮ гигиену, теперь — НАРУШЕНИЯ.
 * Старое «не пил кофе: нет» означало штраф, поэтому разворачивается
 * в «пил кофе: да»: так оценка прошлых ночей не меняется задним числом.
 * Отметки про будильник в старых записях не было — остаётся пустой,
 * выдумывать её нельзя.
 */
/** Снимок плана из записи: только если он полный, иначе null */
function readPlanSnapshot(plan) {
  if (!plan || typeof plan !== 'object') return null;
  if (!TIME_RE.test(String(plan.bedTime)) || !TIME_RE.test(String(plan.wakeTime))) return null;
  return {
    bedTime: String(plan.bedTime),
    wakeTime: String(plan.wakeTime),
    anchor: TIME_RE.test(String(plan.anchor)) ? String(plan.anchor) : null,
  };
}

/** Число 1..10 или null. Пустые значения не должны схлопываться в 0 */
function readLevel(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function migrateViolations(entry) {
  if (entry.violations && typeof entry.violations === 'object') {
    return {
      caffeine: Boolean(entry.violations.caffeine),
      badRoom: Boolean(entry.violations.badRoom),
      snoozed: Boolean(entry.violations.snoozed),
    };
  }
  const old = entry.hygiene;
  if (!old || typeof old !== 'object') {
    return { caffeine: false, badRoom: false, snoozed: false };
  }
  return {
    caffeine: !old.noCaffeine,
    badRoom: !old.goodRoom,
    snoozed: false,
  };
}

export function migrateSettings(raw) {
  const incoming = raw && typeof raw === 'object' ? raw : {};

  const legacyBed = incoming.bedWindow && incoming.bedWindow.start;
  const legacyWake = incoming.wakeWindow && incoming.wakeWindow.start;

  const bedTime = validTime(incoming.bedTime || legacyBed, DEFAULT_SETTINGS.bedTime);
  const wakeTime = validTime(incoming.wakeTime || legacyWake, DEFAULT_SETTINGS.wakeTime);

  const readVariant = (value) => {
    if (!value || typeof value !== 'object') return null;
    if (!TIME_RE.test(String(value.bedTime)) || !TIME_RE.test(String(value.wakeTime))) return null;
    return { bedTime: String(value.bedTime), wakeTime: String(value.wakeTime) };
  };

  const days = {};
  for (const [key, value] of Object.entries(incoming.days || {})) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index > 6) continue;
    const main = readVariant(value);
    if (!main) continue;
    const alt = readVariant(value.alt);
    days[index] = alt ? { ...main, alt } : main;
  }

  // Старая схема: переопределялось только время подъёма, отбой был общий.
  // Разворачиваем её в полноценное расписание по дням.
  const legacyWeekday = incoming.weekdayWake;
  if (!Object.keys(days).length && legacyWeekday && typeof legacyWeekday === 'object') {
    const used = Object.entries(legacyWeekday)
      .filter(([k, v]) => Number.isInteger(Number(k)) && TIME_RE.test(String(v)));
    if (used.length) {
      for (let index = 0; index <= 6; index++) {
        const override = legacyWeekday[index];
        days[index] = {
          bedTime,
          wakeTime: TIME_RE.test(String(override)) ? String(override) : wakeTime,
        };
      }
    }
  }

  const mode = incoming.scheduleMode === 'weekly' || (!incoming.scheduleMode && Object.keys(days).length)
    ? 'weekly'
    : 'simple';

  const phoneInput = incoming.phoneInput === 'clock' ? 'clock' : 'offset';

  const weekParityOffset = Number(incoming.weekParityOffset) ? 1 : 0;

  return { scheduleMode: mode, phoneInput, weekParityOffset, bedTime, wakeTime, days };
}

/** Заполняет расписание по дням текущим базовым временем */
export function expandToWeekly(settings) {
  const days = {};
  for (let index = 0; index <= 6; index++) {
    days[index] = settings.days[index] || { bedTime: settings.bedTime, wakeTime: settings.wakeTime };
  }
  return days;
}

function emptyData() {
  return {
    version: DATA_VERSION,
    settings: { ...DEFAULT_SETTINGS, days: {} },
    entries: {},
    meta: { onboarded: false, createdAt: new Date().toISOString(), lastExportAt: null },
  };
}

/** Доступен ли localStorage вообще (приватный режим, запрет данных сайта) */
export let storageAvailable = true;

function readRaw() {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current !== null) return current;

    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy !== null) {
      localStorage.setItem(STORAGE_KEY, legacy);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return legacy;
    }
    return null;
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

  const settings = migrateSettings(raw.settings);

  const entries = {};
  for (const [date, entry] of Object.entries(raw.entries || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!entry || !entry.bedTime || !entry.wakeTime) continue;
    const gap = readLevel(entry.phoneGapMinutes);
    entries[date] = {
      date,
      phoneOffTime: entry.phoneOffTime || null,
      phoneGapMinutes: gap,
      bedTime: entry.bedTime,
      wakeTime: entry.wakeTime,
      // Самочувствие может быть не отмечено. Проверять через Number()
      // нельзя: Number(null) и Number('') дают 0, а не NaN, — пустое
      // поле превращалось бы в настоящую единицу на шкале.
      energy: readLevel(entry.energy),
      // У записей, сделанных до появления снимков, его нет. Замораживаем
      // по текущим настройкам: это и есть то расписание, при котором
      // их записывали, а без снимка они поедут при первой же правке режима.
      plan: readPlanSnapshot(entry.plan) || planSnapshot(date, settings),
      violations: migrateViolations(entry),
      bonuses: {
        morningLight: Boolean(entry.bonuses && entry.bonuses.morningLight),
        morningExercise: Boolean(entry.bonuses && entry.bonuses.morningExercise),
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

  // План фиксируется один раз — при создании записи. Правка полей
  // существующей ночи его не трогает: расписание той ночи уже случилось.
  const plan = (existing && existing.plan) || planSnapshot(entry.date, data.settings);

  data.entries[entry.date] = {
    ...entry,
    plan,
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
  return `sleep-${todayISO()}.json`;
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
