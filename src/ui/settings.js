/**
 * Настройки режима, бэкап и опасная зона.
 *
 * Норма часов здесь не вводится — она всегда следствие отбоя и подъёма.
 * Иначе можно задать «ложусь в 23:00, встаю в 06:00, сплю 9 часов»,
 * что просто неверно арифметически.
 */

import { esc } from './common.js';
import { storageAvailable, getData } from '../state.js';
import { weeklyPlan, formatDuration, PENALTY } from '../model.js';

const GRACE = PENALTY.planDriftGraceMin;

function driftNote(day) {
  if (!day.isOverride || day.driftFromAnchor <= GRACE) return '';
  return `сдвиг ${formatDuration(day.driftFromAnchor)} от обычного — штраф каждую такую ночь`;
}

function weekRows(settings) {
  return weeklyPlan(settings).map((day) => `
    <div class="wday" data-row="${day.index}">
      <span class="wday-name">${day.short}</span>
      <input type="time" data-weekday="${day.index}" value="${esc(day.wakeTime)}"
             aria-label="Подъём, ${esc(day.full.toLowerCase())}">
      <button class="wday-reset" data-action="reset-weekday" data-weekday="${day.index}"
              title="Вернуть базовое время"
              ${day.isOverride ? '' : 'hidden'}>×</button>
      <span class="wday-dur" data-dur="${day.index}">${esc(formatDuration(day.durationMinutes))}</span>
    </div>
    <div class="wday-note" data-drift="${day.index}">${esc(driftNote(day))}</div>`).join('');
}

/**
 * Обновляет только вычисляемые части (нормы, предупреждения), не трогая
 * сами поля ввода — иначе при правке времени улетает фокус.
 */
export function refreshSettingsComputed(root, settings) {
  for (const day of weeklyPlan(settings)) {
    const duration = root.querySelector(`[data-dur="${day.index}"]`);
    if (duration) duration.textContent = formatDuration(day.durationMinutes);

    const note = root.querySelector(`[data-drift="${day.index}"]`);
    if (note) note.textContent = driftNote(day);

    const reset = root.querySelector(`[data-action="reset-weekday"][data-weekday="${day.index}"]`);
    if (reset) reset.hidden = !day.isOverride;

    const input = root.querySelector(`input[data-weekday="${day.index}"]`);
    if (input && document.activeElement !== input) input.value = day.wakeTime;
  }
}

export function renderSettings(state) {
  const s = state.settings;
  const entryCount = Object.keys(getData().entries).length;
  const lastExport = getData().meta.lastExportAt;

  return `
    <div class="view">
      <section class="card">
        <h2 class="card-title">Базовый режим</h2>

        <div class="row">
          <div class="field">
            <label class="field-label" for="s-bed">Ложусь</label>
            <input type="time" id="s-bed" data-time="bedTime" value="${esc(s.bedTime)}">
          </div>
          <div class="field">
            <label class="field-label" for="s-wake">Встаю</label>
            <input type="time" id="s-wake" data-time="wakeTime" value="${esc(s.wakeTime)}">
          </div>
        </div>

        <div class="field-hint" style="margin-top:-6px">
          Это якорь ритма. Норма сна считается сама — задавать её руками
          нельзя, иначе она разойдётся со временем отбоя и подъёма.
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">Подъём по дням недели</h2>
        <div class="wdays">${weekRows(s)}</div>
        <div class="field-hint" style="margin-top:12px">
          Будильник в разные дни разный — это нормально, пока разброс
          в пределах часа. Дальше начинается смещение ритма, и такой день
          будет штрафоваться сам по себе, даже если встать ровно по плану.
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">Бэкап и перенос</h2>
        <p class="small muted" style="margin:0 0 13px">
          История хранится только в этом браузере. Импорт сливает записи
          по дате, так что телефон и ноутбук можно сводить вместе.
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
        <h2 class="card-title">Опасная зона</h2>
        ${!storageAvailable ? `<div class="msg error">
          Браузер запрещает сохранение — данные не переживут перезагрузку.
        </div>` : ''}
        <button class="btn btn-danger" data-action="wipe">Удалить все данные</button>
      </section>
    </div>`;
}
