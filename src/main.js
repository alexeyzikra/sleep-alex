import './styles.css';

import { computeState, todayISO, formatDateHuman } from './model.js';
import * as store from './state.js';
import { expandToWeekly } from './state.js';
import { renderDashboard } from './ui/dashboard.js';
import { renderHistory } from './ui/history.js';
import { renderSettings, refreshSettingsComputed } from './ui/settings.js';
import { checkinSheet } from './ui/checkin.js';

const TABS = [
  { id: 'home', icon: '🌙', label: 'Главное' },
  { id: 'history', icon: '📊', label: 'История' },
  { id: 'settings', icon: '⚙️', label: 'Настройки' },
];

const ui = { tab: 'home', month: null };

const app = document.getElementById('app');
const tabbar = document.getElementById('tabbar');
const todayLabel = document.getElementById('today-label');

/**
 * Пока пользователь правит настройки, полный перерендер убивал бы
 * фокус в полях ввода. На вкладке настроек DOM не трогаем —
 * значения в полях и так уже актуальные.
 */
let suppressRender = false;

function render() {
  if (suppressRender) return;

  const state = computeState(store.getData(), todayISO());
  const flags = {
    month: ui.month,
    backupDue: store.backupReminderDue(),
    storageBlocked: !store.storageAvailable,
  };

  if (ui.tab === 'history') app.innerHTML = renderHistory(state, flags);
  else if (ui.tab === 'settings') app.innerHTML = renderSettings(state, flags);
  else app.innerHTML = renderDashboard(state, flags);

  tabbar.innerHTML = TABS.map((tab) => `
    <button class="tab ${tab.id === ui.tab ? 'active' : ''}" data-tab="${tab.id}">
      <span class="tab-icon">${tab.icon}</span>
      <span>${tab.label}</span>
    </button>`).join('');

  todayLabel.textContent = formatDateHuman(state.today);

}

store.subscribe(render);

// ---------- Модальное окно ----------

let activeSheet = null;

function closeSheet() {
  if (!activeSheet) return;
  activeSheet.remove();
  activeSheet = null;
  document.body.style.overflow = '';
}

function openSheet(spec) {
  closeSheet();

  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-head">
        <h2>${spec.title}</h2>
        <button class="sheet-close" aria-label="Закрыть">×</button>
      </div>
      <div class="sheet-body"></div>
    </div>`;

  const body = backdrop.querySelector('.sheet-body');
  body.innerHTML = typeof spec.html === 'function' ? spec.html() : spec.html;

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) closeSheet();
  });
  backdrop.querySelector('.sheet-close').addEventListener('click', closeSheet);

  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';
  activeSheet = backdrop;

  if (spec.mount) spec.mount(body);
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeSheet();
});

// ---------- Всплывающее сообщение ----------

let toastTimer = null;

function toast(text) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  clearTimeout(toastTimer);

  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = text;
  document.body.appendChild(node);
  toastTimer = setTimeout(() => node.remove(), 2800);
}

// ---------- Действия ----------

function openCheckin(date) {
  openSheet(checkinSheet(date, { close: closeSheet, toast }));
}

function importFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const result = store.importJSON(String(reader.result));
      const parts = [];
      if (result.added) parts.push(`добавлено ${result.added}`);
      if (result.updated) parts.push(`обновлено ${result.updated}`);
      if (result.skipped) parts.push(`пропущено ${result.skipped}`);
      toast(parts.length ? 'Импорт: ' + parts.join(', ') : 'Новых записей в файле не нашлось');
    } catch (error) {
      toast(error.message || 'Не удалось прочитать файл');
    }
  };
  reader.onerror = () => toast('Не удалось прочитать файл');
  reader.readAsText(file);
}

/**
 * Настройки пишем в хранилище без полного перерендера, иначе на каждом
 * изменении времени улетает фокус из поля. Вычисляемые подписи
 * (нормы по дням, предупреждения) обновляем точечно.
 */
function commitSettings(patch) {
  suppressRender = true;
  store.updateSettings(patch);
  suppressRender = false;
  if (ui.tab === 'settings') refreshSettingsComputed(app, store.getData().settings);
}

/** Правка одного поля в расписании дня недели */
function setDayField(index, variant, field, value) {
  const settings = store.getData().settings;
  const days = { ...settings.days };
  const base = days[index] || { bedTime: settings.bedTime, wakeTime: settings.wakeTime };

  if (variant === 'alt') {
    days[index] = { ...base, alt: { ...(base.alt || base), [field]: value } };
  } else {
    days[index] = { ...base, [field]: value };
  }
  commitSettings({ days });
}

const ACTIONS = {
  checkin: () => openCheckin(todayISO()),

  'edit-day': (el) => openCheckin(el.dataset.date),

  // Переключение режима и чередования меняют структуру экрана,
  // поэтому здесь нужен обычный полный перерендер.
  mode: (el) => {
    const mode = el.dataset.mode;
    const settings = store.getData().settings;
    if (settings.scheduleMode === mode) return;
    store.updateSettings(mode === 'weekly'
      ? { scheduleMode: 'weekly', days: expandToWeekly(settings) }
      : { scheduleMode: 'simple' });
  },

  'phone-input': (el) => {
    if (store.getData().settings.phoneInput === el.dataset.mode) return;
    store.updateSettings({ phoneInput: el.dataset.mode });
  },

  'toggle-alt': (el) => {
    const index = Number(el.dataset.weekday);
    const settings = store.getData().settings;
    const days = { ...settings.days };
    const base = days[index] || { bedTime: settings.bedTime, wakeTime: settings.wakeTime };

    if (base.alt) {
      const { alt, ...rest } = base;
      days[index] = rest;
    } else {
      days[index] = { ...base, alt: { bedTime: base.bedTime, wakeTime: base.wakeTime } };
    }
    store.updateSettings({ days });
  },

  month: (el) => {
    ui.month = el.dataset.month;
    render();
  },

  export: () => {
    store.downloadBackup();
    toast('Файл с историей скачан');
  },

  import: () => {
    const input = document.getElementById('import-file');
    if (input) input.click();
  },

  wipe: () => {
    if (!confirm('Удалить все записи и настройки? Это необратимо.')) return;
    if (!confirm('Точно? Сначала лучше скачать бэкап.')) return;
    store.clearAll();
    toast('Все данные удалены');
  },
};

app.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled) return;
  const handler = ACTIONS[target.dataset.action];
  if (handler) handler(target);
});

tabbar.addEventListener('click', (event) => {
  const target = event.target.closest('[data-tab]');
  if (!target) return;
  ui.tab = target.dataset.tab;
  if (ui.tab !== 'history') ui.month = null;
  render();
  window.scrollTo(0, 0);
});

// Настройки: пишем в хранилище, но вкладку не перерисовываем
app.addEventListener('change', (event) => {
  const el = event.target;

  if (el.id === 'import-file' && el.files && el.files[0]) {
    importFromFile(el.files[0]);
    el.value = '';
    return;
  }

  if (el.dataset.time) {
    if (!el.value) return;
    commitSettings({ [el.dataset.time]: el.value });
    return;
  }

  if (el.dataset.day !== undefined && el.tagName === 'INPUT') {
    if (!el.value) return;
    setDayField(Number(el.dataset.day), el.dataset.variant, el.dataset.field, el.value);
  }
});

// Если приложение осталось открытым через полночь — обновим «сегодня»
let renderedDay = todayISO();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (todayISO() !== renderedDay) {
    renderedDay = todayISO();
    render();
  }
});

render();

// ---------- Service Worker ----------
// Регистрируем только в собранной версии: в dev он только мешает,
// подсовывая закэшированные модули. Путь относительный — иначе
// на GitHub Pages (сайт лежит в /<имя-репы>/) scope уедет в корень домена.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* офлайн просто не включится */ });
  });
}
