/**
 * Настройки целевого режима, бэкап и служебная информация.
 */

import { esc } from './common.js';
import { storageAvailable, getData } from '../state.js';

export function renderSettings(state) {
  const s = state.settings;
  const entryCount = Object.keys(getData().entries).length;
  const lastExport = getData().meta.lastExportAt;

  return `
    <div class="view">
      <section class="card">
        <h2 class="card-title">Целевой режим</h2>

        <div class="field">
          <label class="field-label" for="s-norm">Норма сна, часов</label>
          <input type="number" id="s-norm" data-setting="targetSleepHours"
                 min="4" max="12" step="0.25" value="${s.targetSleepHours}">
          <div class="field-hint">Студентам обычно нужно 7–9 часов.</div>
        </div>

        <div class="field">
          <label class="field-label">Окно отхода ко сну</label>
          <div class="time-pair">
            <input type="time" data-window="bedWindow.start" value="${esc(s.bedWindow.start)}">
            <span>—</span>
            <input type="time" data-window="bedWindow.end" value="${esc(s.bedWindow.end)}">
          </div>
          <div class="field-hint">Окно может проходить через полночь, это нормально.</div>
        </div>

        <div class="field">
          <label class="field-label">Окно подъёма</label>
          <div class="time-pair">
            <input type="time" data-window="wakeWindow.start" value="${esc(s.wakeWindow.start)}">
            <span>—</span>
            <input type="time" data-window="wakeWindow.end" value="${esc(s.wakeWindow.end)}">
          </div>
        </div>

        <div class="field" style="margin-bottom:0">
          <label class="field-label" for="s-buffer">Допустимое отклонение</label>
          <select id="s-buffer" data-setting="bufferMinutes">
            ${[15, 30, 45, 60].map((m) => `
              <option value="${m}" ${s.bufferMinutes === m ? 'selected' : ''}>± ${m} минут</option>`).join('')}
          </select>
          <div class="field-hint">
            Попал в окно — день зелёный. Промахнулся, но в пределах отклонения — жёлтый.
            Этим же допуском считается «сон близко к норме».
          </div>
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">Бэкап и перенос</h2>
        <p class="small muted" style="margin:0 0 13px">
          История хранится только в этом браузере. Экспорт — единственный способ
          перенести её на другое устройство или не потерять при чистке данных.
          Импорт сливает записи по дате, так что телефон и ноутбук можно сводить вместе.
        </p>
        <button class="btn" data-action="export">⬇️ Скачать JSON${entryCount ? ` (${entryCount} ночей)` : ''}</button>
        <button class="btn mt" data-action="import">⬆️ Загрузить JSON</button>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
        <div class="small muted mt">
          ${lastExport
            ? 'Последний бэкап: ' + esc(new Date(lastExport).toLocaleDateString('ru-RU'))
            : 'Бэкапов пока не было.'}
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">Как это работает</h2>
        <div class="small muted" style="line-height:1.55">
          <p style="margin:0 0 10px">
            <strong style="color:var(--text-dim)">Добавь на домашний экран.</strong>
            Это не про красивую иконку: у обычных сайтов iOS подчищает сохранённые
            данные, если не заходить неделю, а у установленного приложения — нет.
          </p>
          <p style="margin:0 0 10px">
            <strong style="color:var(--text-dim)">Будильник ставь системный.</strong>
            Браузер не может разбудить при закрытой вкладке — такого API просто нет.
            Поставь один повторяющийся будильник в часах телефона и не трогай его:
            стабильное время подъёма и так важнее стабильного отбоя.
          </p>
          <p style="margin:0">
            <strong style="color:var(--text-dim)">XP пересчитывается из истории.</strong>
            Очки не хранятся отдельно, поэтому не могут разойтись с записями.
            Обратная сторона: если поменять целевые окна, прошлые ночи пересчитаются
            по новым правилам.
          </p>
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">Опасная зона</h2>
        ${!storageAvailable ? `<div class="msg error">
          Браузер запрещает сохранение — данные не переживут перезагрузку.
        </div>` : ''}
        <button class="btn btn-danger" data-action="wipe">Удалить все данные</button>
      </section>
    </div>`;
}
