import {
  formatDuration, formatSigned, fromMinutes, plannedFor,
  GRADE_LABELS, GRADE_LIMITS,
} from '../model.js';
import { esc } from './common.js';
import { renderBarcode } from './barcode.js';

function gradeBadge(grade, penalty) {
  return `<span class="grade grade-${grade}">${penalty} ${penalty === 1 ? 'очко' : (penalty % 10 >= 2 && penalty % 10 <= 4 && (penalty < 10 || penalty > 20) ? 'очка' : 'очков')}</span>`;
}

function balanceCard(state) {
  const { balanceMinutes, nights, windowDays } = state.balance;
  if (nights === 0) {
    return `
      <section class="card">
        <h2 class="card-title">Баланс сна</h2>
        <div class="empty" style="padding:8px 0">Пока нет записей за последние ${windowDays} дней.</div>
      </section>`;
  }

  let tone = 'good';
  if (balanceMinutes < -180) tone = 'bad';
  else if (balanceMinutes < -45) tone = 'warn';

  const caption = balanceMinutes >= 0
    ? `Спал даже чуть больше своей нормы. Ночей учтено: ${nights}.`
    : `Недосып относительно твоей нормы. Ночей учтено: ${nights}.`;

  return `
    <section class="card">
      <h2 class="card-title">Баланс сна за ${windowDays} дней</h2>
      <div class="balance-value ${tone}">${esc(formatSigned(balanceMinutes))}</div>
      <div class="balance-caption">${esc(caption)}</div>
    </section>`;
}

function streaksCard(state) {
  const items = [
    { icon: '✅', num: state.cleanStreak, label: 'чистых ночей<br>подряд' },
    { icon: '📱', num: state.phoneStreak, label: 'ночей подряд<br>без телефона' },
  ];
  return `<div class="streaks">${items.map((s) => `
    <div class="streak">
      <div class="streak-icon">${s.icon}</div>
      <div class="streak-num ${s.num === 0 ? 'zero' : ''}">${s.num}</div>
      <div class="streak-label">${s.label}</div>
    </div>`).join('')}</div>`;
}

function levelCard(state) {
  const lvl = state.level;
  const sub = lvl.next
    ? `${state.totalXp} XP · до «${lvl.next.title}» ещё ${lvl.toNext} XP`
    : `${state.totalXp} XP · максимальный уровень`;
  return `
    <section class="card">
      <div class="level-head">
        <div class="level-icon">${lvl.icon}</div>
        <div class="level-meta">
          <div class="level-name">Lvl ${lvl.level} — ${esc(lvl.title)}</div>
          <div class="level-sub">${esc(sub)}</div>
        </div>
      </div>
      <div class="xpbar"><div style="width:${(lvl.progress * 100).toFixed(1)}%"></div></div>
    </section>`;
}

function achievementsCard(state) {
  const unlocked = state.achievements.filter((a) => a.unlocked).length;
  return `
    <section class="card">
      <h2 class="card-title">Достижения · ${unlocked} из ${state.achievements.length}</h2>
      <div class="ach-grid">${state.achievements.map((a) => `
        <div class="ach ${a.unlocked ? 'unlocked' : 'locked'}" title="${esc(a.desc)}">
          <div class="ach-icon">${a.unlocked ? a.icon : '🔒'}</div>
          <div class="ach-title">${esc(a.title)}</div>
        </div>`).join('')}</div>
    </section>`;
}

function lastNightCard(state) {
  const day = state.byDate[state.today];
  if (!day) return '';

  return `
    <section class="card">
      <h2 class="card-title">Сегодняшняя запись</h2>
      <div class="stat">
        <div>
          <div style="font-size:21px;font-weight:650;letter-spacing:-0.4px">${esc(formatDuration(day.sleepMinutes))}</div>
          <div class="small muted" style="margin-top:2px">
            ${esc(`Лёг ${day.entry.bedTime}, встал ${day.entry.wakeTime}`)}
          </div>
        </div>
        ${gradeBadge(day.grade, day.totalPenalty)}
      </div>

      ${day.blackFlags.length ? `<div class="msg error mt">
        ${day.blackFlags.map(esc).join('<br>')}
      </div>` : ''}

      ${day.reasons.length ? `<div class="divider"></div>
        <div class="statlist">${day.reasons.map((r) => `
          <div class="stat">
            <span class="stat-label">${esc(r.label)}${r.detail ? `<br><span class="small" style="color:var(--text-faint)">${esc(r.detail)}</span>` : ''}</span>
            <span class="stat-value" style="color:var(--yellow)">+${r.points}</span>
          </div>`).join('')}</div>`
      : `<div class="divider"></div>
        <div class="small" style="color:var(--green)">Ни одного штрафного очка. Идеальная ночь.</div>`}

      <button class="btn btn-ghost btn-sm mt" data-action="edit-day" data-date="${state.today}"
              style="width:100%">Исправить запись</button>
    </section>`;
}

function targetCard(state) {
  const plan = plannedFor(state.today, state.settings);
  const mid = state.stats.avgMidpoint;

  return `
    <section class="card">
      <h2 class="card-title">План на сегодня</h2>
      <div class="statlist">
        <div class="stat">
          <span class="stat-label">Отбой</span>
          <span class="stat-value">${esc(plan.bedTime)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Подъём${plan.isOverride ? ' <span class="small muted">(по дню недели)</span>' : ''}</span>
          <span class="stat-value">${esc(plan.wakeTime)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Норма этой ночи</span>
          <span class="stat-value">${esc(formatDuration(plan.durationMinutes))}</span>
        </div>
        ${mid !== null ? `<div class="stat">
          <span class="stat-label">Середина сна за неделю</span>
          <span class="stat-value">${esc(fromMinutes(mid))}</span>
        </div>` : ''}
      </div>
    </section>`;
}

function scaleCard() {
  return `
    <section class="card">
      <h2 class="card-title">Шкала ночи</h2>
      <div class="scale-list">
        <div class="scale-row"><i class="grade-dot grade-green"></i>
          <span>0–${GRADE_LIMITS.green}</span><span class="muted">${GRADE_LABELS.green}</span></div>
        <div class="scale-row"><i class="grade-dot grade-yellow"></i>
          <span>${GRADE_LIMITS.green + 1}–${GRADE_LIMITS.yellow}</span><span class="muted">${GRADE_LABELS.yellow}</span></div>
        <div class="scale-row"><i class="grade-dot grade-red"></i>
          <span>${GRADE_LIMITS.yellow + 1}+</span><span class="muted">${GRADE_LABELS.red}</span></div>
        <div class="scale-row"><i class="grade-dot grade-black"></i>
          <span>срыв</span><span class="muted">меньше 4 часов сна, подъём мимо на 3+ часа или сбитый ритм</span></div>
      </div>
    </section>`;
}

export function renderDashboard(state, flags) {
  const hasToday = Boolean(state.byDate[state.today]);
  const empty = state.days.length === 0;

  return `
    <div class="view">
      ${flags.backupDue ? `<div class="msg warn">
        Давно не делал бэкап. История живёт только в этом браузере —
        <button class="btn-ghost" data-action="export" style="text-decoration:underline;padding:0;color:inherit;font:inherit">скачай JSON</button>.
      </div>` : ''}

      ${flags.storageBlocked ? `<div class="msg error">
        Браузер запретил сохранение данных — записи исчезнут при перезагрузке.
        Выйди из приватного режима или разреши данные сайта.
      </div>` : ''}

      <button class="btn btn-primary" data-action="checkin">
        ${hasToday ? '✏️ Изменить сегодняшний сон' : '🌙 Записать сегодняшний сон'}
      </button>

      ${empty ? `<section class="card">
        <div class="empty">
          <span class="empty-icon">🌘</span>
          Записывай сон каждое утро — одной кнопкой, за 15 секунд.<br>
          Чем меньше штрафных очков за ночь, тем лучше режим.
        </div>
      </section>` : ''}

      ${lastNightCard(state)}
      ${balanceCard(state)}
      ${streaksCard(state)}
      ${levelCard(state)}
      ${!empty ? renderBarcode(state, 14) : ''}
      ${achievementsCard(state)}
      ${targetCard(state)}
      ${empty ? scaleCard() : ''}
    </div>`;
}
