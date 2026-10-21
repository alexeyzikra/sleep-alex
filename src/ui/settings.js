/**
 * Настройки режима, бэкап и опасная зона.
 *
 * Норма часов здесь не вводится — она всегда следствие отбоя и подъёма.
 * Иначе можно задать «ложусь в 23:00, встаю в 06:00, сплю 9 часов»,
 * что просто неверно арифметически.
 */

import { esc } from './common.js';
import { storageAvailable, getData } from '../state.js';
import {
  weeklyPlan, plannedFor, anchorWake, formatDuration, fromMinutes,
  isoWeek, weekParity, todayISO, PENALTY,
} from '../model.js';

const GRACE = PENALTY.planDriftGraceMin;

function driftNote(variant) {
  if (variant.driftFromAnchor <= GRACE) return '';
  return `сдвиг ${formatDuration(variant.driftFromAnchor)} от обычного подъёма — штраф каждую такую ночь`;
}

function timePair(dayIndex, kind, variant) {
  return `
    <div class="dayrow">
      <input type="time" value="${esc(variant.bedTime)}"
             data-day="${dayIndex}" data-variant="${kind}" data-field="bedTime"
             aria-label="Отбой">
      <span class="dayrow-arrow">→</span>
      <input type="time" value="${esc(variant.wakeTime)}"
             data-day="${dayIndex}" data-variant="${kind}" data-field="wakeTime"
             aria-label="Подъём">
    </div>`;
}

function dayBlock(day) {
  const altButtonTitle = day.alternates
    ? 'Сделать одинаковым во все недели'
    : 'Разное расписание по чётным и нечётным неделям';

  const head = `
    <div class="dayblock-head">
      <span class="dayblock-name">${esc(day.full)}</span>
      ${day.alternates ? '' : `<span class="dayblock-dur" data-dur="${day.index}-main">${esc(formatDuration(day.main.durationMinutes))}</span>`}
      <button class="dayblock-alt ${day.alternates ? 'on' : ''}"
              data-action="toggle-alt" data-weekday="${day.index}"
              title="${altButtonTitle}" aria-label="${altButtonTitle}">⇄</button>
    </div>`;

  if (!day.alternates) {
    return `<div class="dayblock">
      ${head}
      ${timePair(day.index, 'main', day.main)}
      <div class="dayblock-note" data-drift="${day.index}-main">${esc(driftNote(day.main))}</div>
    </div>`;
  }

  const variantGroup = (kind, label, variant) => `
    <div class="dayvariant">
      <div class="dayvariant-label">
        ${label} <span data-dur="${day.index}-${kind}">${esc(formatDuration(variant.durationMinutes))}</span>
      </div>
      ${timePair(day.index, kind, variant)}
      <div class="dayblock-note" data-drift="${day.index}-${kind}">${esc(driftNote(variant))}</div>
    </div>`;

  return `<div class="dayblock alternating">
    ${head}
    ${variantGroup('main', 'чётная неделя ·', day.main)}
    ${variantGroup('alt', 'нечётная неделя ·', day.alt)}
  </div>`;
}

/**
 * Обновляет только вычисляемые подписи, не трогая поля ввода —
 * иначе при правке времени улетает фокус.
 */
export function refreshSettingsComputed(root, settings) {
  for (const day of weeklyPlan(settings)) {
    const variants = [['main', day.main], ['alt', day.alt]];
    for (const [kind, variant] of variants) {
      if (!variant) continue;
      const duration = root.querySelector(`[data-dur="${day.index}-${kind}"]`);
      if (duration) duration.textContent = formatDuration(variant.durationMinutes);
      const note = root.querySelector(`[data-drift="${day.index}-${kind}"]`);
      if (note) note.textContent = driftNote(variant);
    }
  }

  const anchor = root.querySelector('[data-anchor]');
  if (anchor) anchor.textContent = fromMinutes(anchorWake(settings));

  const simpleNorm = root.querySelector('[data-simple-norm]');
  if (simpleNorm) {
    const plan = plannedFor(todayISO(), settings);
    simpleNorm.textContent = formatDuration(plan.durationMinutes);
  }
}

function scheduleCard(settings) {
  const weekly = settings.scheduleMode === 'weekly';
  const today = todayISO();

  const modes = `
    <div class="segmented">
      <button class="${weekly ? '' : 'active'}" data-action="mode" data-mode="simple">Одинаково каждый день</button>
      <button class="${weekly ? 'active' : ''}" data-action="mode" data-mode="weekly">По дням недели</button>
    </div>`;

  if (!weekly) {
    const plan = plannedFor(today, settings);
    return `
      <section class="card">
        <h2 class="card-title">Режим сна</h2>
        ${modes}
        <div class="row">
          <div class="field" style="margin-bottom:0">
            <label class="field-label" for="s-bed">Ложусь</label>
            <input type="time" id="s-bed" data-time="bedTime" value="${esc(settings.bedTime)}">
          </div>
          <div class="field" style="margin-bottom:0">
            <label class="field-label" for="s-wake">Встаю</label>
            <input type="time" id="s-wake" data-time="wakeTime" value="${esc(settings.wakeTime)}">
          </div>
        </div>
        <div class="field-hint" style="margin-top:11px">
          Норма сна: <strong data-simple-norm>${esc(formatDuration(plan.durationMinutes))}</strong>.
          Считается сама из отбоя и подъёма — задавать её руками нельзя,
          иначе она разойдётся с расписанием.
        </div>
      </section>`;
  }

  const isEven = weekParity(today, settings) === 'even';

  return `
    <section class="card">
      <h2 class="card-title">Режим сна</h2>
      ${modes}
      <div class="dayblocks">${weeklyPlan(settings).map(dayBlock).join('')}</div>
      <div class="field-hint" style="margin-top:14px">
        Кнопка ⇄ у дня включает разное расписание по чётным и нечётным
        неделям — для пар, которые идут через неделю.
      </div>
      <div class="parity-row">
        <span>Сейчас <strong>${isEven ? 'чётная' : 'нечётная'} неделя</strong></span>
        <button class="btn btn-sm" data-action="flip-parity">Нет, ${isEven ? 'нечётная' : 'чётная'}</button>
      </div>
      <div class="field-hint" style="margin-top:8px">
        Если это расходится с твоим расписанием, нажми — и нумерация
        сдвинется на неделю. Отсчёт чётности в универе обычно идёт
        от начала семестра, а не от начала года, так что угадать его
        приложение не может.
      </div>
      <div class="field-hint" style="margin-top:8px">
        Обычный подъём — <strong data-anchor>${esc(fromMinutes(anchorWake(settings)))}</strong>
        (медиана по всей неделе). Разброс будильника в пределах часа от него
        бесплатный, дальше начинается смещение ритма, и такой день штрафуется
        сам по себе, даже если встать ровно по плану.
      </div>
    </section>`;
}

export function renderSettings(state) {
  const entryCount = Object.keys(getData().entries).length;
  const lastExport = getData().meta.lastExportAt;

  return `
    <div class="view">
      ${scheduleCard(state.settings)}

      <section class="card">
        <h2 class="card-title">Чек-ин</h2>
        <label class="field-label">Как отмечать телефон</label>
        <div class="segmented">
          <button class="${state.settings.phoneInput === 'clock' ? '' : 'active'}"
                  data-action="phone-input" data-mode="offset">За сколько до сна</button>
          <button class="${state.settings.phoneInput === 'clock' ? 'active' : ''}"
                  data-action="phone-input" data-mode="clock">Точное время</button>
        </div>
        <div class="field-hint" style="margin-top:-4px">
          Штраф в обоих случаях считается одинаково — по тому, сколько
          времени прошло между телефоном и отбоем. Отложил за час и раньше —
          штрафа нет, в кровати — штраф растёт быстрее всего.
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
