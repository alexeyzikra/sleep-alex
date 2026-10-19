/**
 * Модель и все расчёты. Чистые функции: ни DOM, ни localStorage.
 *
 * Главное соглашение: запись привязана к ДАТЕ ПРОБУЖДЕНИЯ.
 * Лёг в 01:30 и встал 19-го — это запись за 19 октября.
 *
 * Оценка ночи — через ШТРАФНЫЕ ОЧКИ: каждое нарушение добавляет очки,
 * сумма попадает в один из уровней (зелёный / жёлтый / красный / чёрный).
 * Ноль очков — идеальная ночь.
 */

// ---------- Время ----------

/** "23:40" -> 1420 (минут от полуночи) */
export function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

/** 1420 -> "23:40". Значение приводится к суткам. */
export function fromMinutes(min) {
  const v = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(v / 60);
  return String(h).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
}

/** 455 -> "7 ч 35 мин" */
export function formatDuration(min) {
  const sign = min < 0 ? '−' : '';
  const v = Math.abs(Math.round(min));
  const h = Math.floor(v / 60);
  const m = v % 60;
  if (h === 0) return sign + m + ' мин';
  if (m === 0) return sign + h + ' ч';
  return sign + h + ' ч ' + m + ' мин';
}

/** Со знаком: "+35 мин", "−1 ч 10 мин", "0" */
export function formatSigned(min) {
  const r = Math.round(min);
  if (r === 0) return '0';
  return (r > 0 ? '+' : '') + formatDuration(r);
}

/** Кратчайшее расстояние между двумя точками на циферблате суток */
export function circularDistance(a, b) {
  const d = Math.abs(a - b) % 1440;
  return Math.min(d, 1440 - d);
}

// ---------- Даты ----------

/** Date -> "2026-10-19" в локальной зоне (а не в UTC, как делает toISOString) */
export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO() {
  return toISODate(new Date());
}

export function addDays(iso, delta) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + delta);
  return toISODate(date);
}

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** Дни недели в порядке «понедельник первый», с индексом JS getDay() */
export const WEEK_ORDER = [
  { index: 1, short: 'пн', full: 'Понедельник' },
  { index: 2, short: 'вт', full: 'Вторник' },
  { index: 3, short: 'ср', full: 'Среда' },
  { index: 4, short: 'чт', full: 'Четверг' },
  { index: 5, short: 'пт', full: 'Пятница' },
  { index: 6, short: 'сб', full: 'Суббота' },
  { index: 0, short: 'вс', full: 'Воскресенье' },
];

export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateHuman(iso) {
  const date = parseISO(iso);
  return `${date.getDate()} ${MONTHS[date.getMonth()]}, ${WEEKDAYS[date.getDay()]}`;
}

export function weekdayShort(iso) {
  return WEEKDAYS[parseISO(iso).getDay()];
}

/** Понедельник = 0, воскресенье = 6 — для сетки календаря */
export function weekdayIndexMonday(iso) {
  return (parseISO(iso).getDay() + 6) % 7;
}

// ---------- План на конкретную ночь ----------

/**
 * Во сколько по плану надо лечь и встать именно в эту ночь.
 *
 * Подъём берётся из переопределения по дню недели, если оно задано,
 * иначе — базовый якорь. Норма часов НЕ вводится руками: она всегда
 * равна промежутку между отбоем и подъёмом, поэтому противоречивые
 * настройки («ложусь в 23:00, встаю в 6:00, сплю 9 часов») невозможны
 * в принципе.
 */
export function plannedFor(dateISO, settings) {
  const dayOfWeek = parseISO(dateISO).getDay();
  const override = settings.weekdayWake ? settings.weekdayWake[dayOfWeek] : null;
  const wakeTime = override || settings.wakeTime;

  const wakeClock = toMinutes(wakeTime);
  const bedClock = toMinutes(settings.bedTime);
  const bedAbs = bedClock > wakeClock ? bedClock - 1440 : bedClock;

  // Насколько план этого дня уехал от базового якоря подъёма
  const driftFromAnchor = circularDistance(wakeClock, toMinutes(settings.wakeTime));

  return {
    bedTime: settings.bedTime,
    wakeTime,
    bedClock,
    wakeClock,
    bedAbs,
    durationMinutes: wakeClock - bedAbs,
    isOverride: Boolean(override) && override !== settings.wakeTime,
    driftFromAnchor,
  };
}

/** Норма сна по дням недели — для показа в настройках */
export function weeklyPlan(settings) {
  return WEEK_ORDER.map((day) => {
    const wakeTime = (settings.weekdayWake && settings.weekdayWake[day.index]) || settings.wakeTime;
    const wakeClock = toMinutes(wakeTime);
    const bedClock = toMinutes(settings.bedTime);
    const bedAbs = bedClock > wakeClock ? bedClock - 1440 : bedClock;
    return {
      ...day,
      wakeTime,
      durationMinutes: wakeClock - bedAbs,
      isOverride: Boolean(settings.weekdayWake && settings.weekdayWake[day.index]),
      driftFromAnchor: circularDistance(wakeClock, toMinutes(settings.wakeTime)),
    };
  });
}

// ---------- Штрафные очки ----------

/**
 * Веса подобраны «на глаз» по принципу «регулярность важнее длительности»
 * и нуждаются в калибровке. Всё в одном месте, чтобы крутить было просто.
 */
export const PENALTY = {
  // За каждую минуту отклонения факта от плана
  wakeDeviationPerMin: 1.5,   // подъём — главный якорь ритма, вес наибольший
  bedLatePerMin: 1.0,         // лёг позже плана
  bedEarlyPerMin: 0.5,        // лёг раньше — нарушение ритма, но куда безобиднее

  // За каждую минуту отклонения длительности от нормы этой ночи
  underSleepPerMin: 1.2,
  overSleepPerMin: 0.5,

  // Сам план уехал от якоря: штраф за каждую минуту СВЕРХ часа.
  // Это то, что не даёт «законно» спать до обеда по субботам,
  // просто прописав субботу в настройках.
  planDriftPerMin: 1.0,
  planDriftGraceMin: 60,

  // Гигиена сна — фиксированные штрафы за невыполненный пункт
  hygiene: {
    noPhone: 55,   // экран перед сном — самый злободневный пункт, в одиночку уводит ночь из зелёного
    noCaffeine: 35,
    goodRoom: 20,
  },
};

/** Границы уровней по сумме очков. Выше жёлтого — красный. */
export const GRADE_LIMITS = { green: 50, yellow: 180 };

/** Чёрный уровень — не по сумме, а по отдельным правилам «так нельзя». */
export const BLACK_RULES = {
  minSleepMinutes: 240,     // меньше 4 часов сна
  maxWakeDeviation: 180,    // встал на 3+ часа мимо плана
  maxMidpointShift: 180,    // середина сна уехала на 3+ часа от привычной
};

export const GRADE_LABELS = {
  green: 'всё в порядке',
  yellow: 'есть над чем поработать',
  red: 'режим сбит',
  black: 'так нельзя',
};

export const HYGIENE_PENALTY_LABELS = {
  noPhone: 'Телефон перед сном',
  noCaffeine: 'Кофе или энергетики во второй половине дня',
  goodRoom: 'Душная или светлая комната',
};

// ---------- Разбор записи ----------

/**
 * Превращает «часы на циферблате» в непрерывную шкалу.
 * Точка отсчёта — полночь даты пробуждения, поэтому отбой в 23:40
 * даёт −20, а отбой в 01:30 даёт +90. Такая шкала непрерывна вокруг
 * полуночи, и по ней можно считать среднее и разброс без хитростей.
 */
export function resolveEntry(entry) {
  const wakeClock = toMinutes(entry.wakeTime);
  const bedClock = toMinutes(entry.bedTime);

  const bedAbs = bedClock > wakeClock ? bedClock - 1440 : bedClock;
  const sleepMinutes = wakeClock - bedAbs;

  let phoneAbs = null;
  let phoneFreeMinutes = null;
  if (entry.phoneOffTime) {
    const p = toMinutes(entry.phoneOffTime);
    // Выбираем ту календарную дату, при которой «отложил телефон»
    // оказывается ближе всего к отбою (в пределах ±12 часов).
    const candidates = [p, p - 1440, p + 1440];
    phoneAbs = candidates.reduce((best, c) =>
      Math.abs(c - bedAbs) < Math.abs(best - bedAbs) ? c : best);
    phoneFreeMinutes = bedAbs - phoneAbs;
  }

  const midpointAbs = (bedAbs + wakeClock) / 2;

  return { wakeClock, bedClock, bedAbs, sleepMinutes, phoneAbs, phoneFreeMinutes, midpointAbs };
}

// ---------- Оценка одной ночи ----------

/**
 * @param context { midpointBaseline } — привычная середина сна (медиана
 *        предыдущих ночей) или null, если истории ещё мало.
 */
export function scoreEntry(entry, settings, context = {}) {
  const r = resolveEntry(entry);
  const plan = plannedFor(entry.date, settings);

  const reasons = [];
  const add = (label, points, detail) => {
    const rounded = Math.round(points);
    if (rounded > 0) reasons.push({ label, points: rounded, detail });
  };

  // 1. Подъём мимо плана
  const wakeDeviation = circularDistance(r.wakeClock, plan.wakeClock);
  const wakeLate = r.wakeClock > plan.wakeClock;
  add(
    wakeLate ? 'Встал позже плана' : 'Встал раньше плана',
    wakeDeviation * PENALTY.wakeDeviationPerMin,
    `на ${formatDuration(wakeDeviation)} (план ${plan.wakeTime})`
  );

  // 2. Отбой мимо плана
  const bedDeviationSigned = r.bedAbs - plan.bedAbs;
  const bedDeviation = Math.abs(bedDeviationSigned);
  const bedLate = bedDeviationSigned > 0;
  add(
    bedLate ? 'Лёг позже плана' : 'Лёг раньше плана',
    bedDeviation * (bedLate ? PENALTY.bedLatePerMin : PENALTY.bedEarlyPerMin),
    `на ${formatDuration(bedDeviation)} (план ${plan.bedTime})`
  );

  // 3. Длительность сна мимо нормы этой ночи
  const sleepDeviation = r.sleepMinutes - plan.durationMinutes;
  if (sleepDeviation < 0) {
    add('Недосып', -sleepDeviation * PENALTY.underSleepPerMin,
      `${formatDuration(-sleepDeviation)} до нормы (${formatDuration(plan.durationMinutes)})`);
  } else {
    add('Пересып', sleepDeviation * PENALTY.overSleepPerMin,
      `${formatDuration(sleepDeviation)} сверх нормы (${formatDuration(plan.durationMinutes)})`);
  }

  // 4. Сам план этого дня уехал от якоря подъёма
  const driftExcess = Math.max(0, plan.driftFromAnchor - PENALTY.planDriftGraceMin);
  add('План дня сдвинут от обычного подъёма', driftExcess * PENALTY.planDriftPerMin,
    `${plan.wakeTime} против обычных ${settings.wakeTime}`);

  // 5. Гигиена сна
  for (const [key, points] of Object.entries(PENALTY.hygiene)) {
    const done = Boolean(entry.hygiene && entry.hygiene[key]);
    if (!done) add(HYGIENE_PENALTY_LABELS[key], points);
  }

  const totalPenalty = reasons.reduce((sum, item) => sum + item.points, 0);

  // Чёрный уровень — отдельные правила, а не сумма очков
  const blackFlags = [];
  if (r.sleepMinutes < BLACK_RULES.minSleepMinutes) {
    blackFlags.push(`Меньше ${BLACK_RULES.minSleepMinutes / 60} часов сна`);
  }
  if (wakeDeviation > BLACK_RULES.maxWakeDeviation) {
    blackFlags.push(`Подъём мимо плана больше чем на ${BLACK_RULES.maxWakeDeviation / 60} часа`);
  }
  const baseline = context.midpointBaseline;
  if (baseline !== null && baseline !== undefined) {
    const shift = Math.abs(r.midpointAbs - baseline);
    if (shift > BLACK_RULES.maxMidpointShift) {
      blackFlags.push(`Середина сна уехала на ${formatDuration(shift)} от привычной`);
    }
  }

  let grade;
  if (blackFlags.length) grade = 'black';
  else if (totalPenalty <= GRADE_LIMITS.green) grade = 'green';
  else if (totalPenalty <= GRADE_LIMITS.yellow) grade = 'yellow';
  else grade = 'red';

  return {
    ...r, entry, plan,
    wakeDeviation, bedDeviation, bedLate, sleepDeviation,
    reasons, totalPenalty, blackFlags, grade,
  };
}

/** Медиана — устойчивее среднего к одной-двум диким ночам */
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdev(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
}

/** Сколько ночей нужно, чтобы «привычная середина сна» вообще что-то значила */
const BASELINE_MIN_NIGHTS = 5;

// ---------- Уровни ----------
// Временная шкала: вся геймификация ещё будет переделана.
// Очки за ночь выводятся из её уровня, а не из отдельных правил.

export const GRADE_XP = { green: 100, yellow: 40, red: 10, black: 0 };

export const LEVELS = [
  { level: 1, from: 0, title: 'Сонный Зомби', icon: '🧟' },
  { level: 2, from: 300, title: 'Дневной Дрыщ', icon: '😪' },
  { level: 3, from: 1200, title: 'Осознанный Студент', icon: '🧑‍🎓' },
  { level: 4, from: 3000, title: 'Мастер Циркадных Ритмов', icon: '🌗' },
  { level: 5, from: 6000, title: 'Повелитель Снов', icon: '🌌' },
  { level: 6, from: 12000, title: 'Легенда Режима', icon: '🏆' },
];

export function levelInfo(xp) {
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i].from) index = i;
  const current = LEVELS[index];
  const next = LEVELS[index + 1] || null;
  const span = next ? next.from - current.from : 1;
  return {
    ...current, next,
    progress: next ? Math.min(1, (xp - current.from) / span) : 1,
    toNext: next ? Math.max(0, next.from - xp) : 0,
  };
}

// ---------- Свод по всей истории ----------

/**
 * Пересчитывает ВСЁ из записей и настроек. Единственный источник правды —
 * сами записи, поэтому ничего не может «разойтись» с историей.
 *
 * Пропущенные дни стрик не рвут и не продлевают: идём по заполненным
 * ночам и просто пропускаем дырки.
 */
export function computeState(data, today = todayISO()) {
  const settings = data.settings;
  const sorted = Object.values(data.entries).sort((a, b) => (a.date < b.date ? -1 : 1));

  // Привычная середина сна считается по ПРЕДЫДУЩИМ ночам, иначе дикая
  // ночь сама себя сделала бы нормой и чёрный флаг не сработал бы.
  const days = [];
  const midpointHistory = [];
  for (const entry of sorted) {
    const baseline = midpointHistory.length >= BASELINE_MIN_NIGHTS
      ? median(midpointHistory.slice(-14))
      : null;
    const day = scoreEntry(entry, settings, { midpointBaseline: baseline });
    day.xp = GRADE_XP[day.grade];
    days.push(day);
    midpointHistory.push(day.midpointAbs);
  }

  const totalXp = days.reduce((sum, d) => sum + d.xp, 0);

  const countFromEnd = (predicate) => {
    let n = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (!predicate(days[i])) break;
      n += 1;
    }
    return n;
  };
  const cleanStreak = countFromEnd((d) => d.grade === 'green');
  const phoneStreak = countFromEnd((d) => d.entry.hygiene && d.entry.hygiene.noPhone);

  let best = 0;
  let run = 0;
  let bestPhone = 0;
  let phoneRun = 0;
  for (const day of days) {
    run = day.grade === 'green' ? run + 1 : 0;
    best = Math.max(best, run);
    phoneRun = day.entry.hygiene && day.entry.hygiene.noPhone ? phoneRun + 1 : 0;
    bestPhone = Math.max(bestPhone, phoneRun);
  }

  const byDate = {};
  for (const day of days) byDate[day.entry.date] = day;

  const balance = sleepBalance(days, today, 7);
  const stats = weekStats(days, today);

  return {
    settings, today, days, byDate, totalXp,
    level: levelInfo(totalXp),
    cleanStreak, phoneStreak,
    bestCleanStreak: best, bestPhoneStreak: bestPhone,
    balance, stats,
    achievements: evaluateAchievements({
      days, totalXp, balance, stats,
      bestCleanStreak: best, bestPhoneStreak: bestPhone,
    }),
  };
}

/** Баланс сна: сколько набежало относительно нормы за последние N дней */
export function sleepBalance(days, today, windowDays) {
  const from = addDays(today, -(windowDays - 1));
  const used = days.filter((d) => d.entry.date >= from && d.entry.date <= today);
  return {
    balanceMinutes: used.reduce((sum, d) => sum + d.sleepDeviation, 0),
    nights: used.length,
    windowDays,
  };
}

/** Статистика за последние 7 заполненных ночей */
export function weekStats(days, today) {
  const last = days.slice(-7);
  if (last.length === 0) {
    return {
      nights: 0, avgSleep: null, avgPenalty: null, bedSpread: null,
      wakeSpread: null, avgMidpoint: null, worstFactor: null, badNights: 0,
    };
  }

  const bad = days.filter((d) => d.grade !== 'green');
  let worstFactor = null;
  if (bad.length >= 5) {
    const counts = Object.keys(PENALTY.hygiene).map((key) => ({
      key,
      label: HYGIENE_PENALTY_LABELS[key],
      count: bad.filter((d) => !(d.entry.hygiene && d.entry.hygiene[key])).length,
    })).sort((a, b) => b.count - a.count);
    if (counts[0].count > 0) worstFactor = { ...counts[0], of: bad.length };
  }

  return {
    nights: last.length,
    avgSleep: last.reduce((s, d) => s + d.sleepMinutes, 0) / last.length,
    avgPenalty: last.reduce((s, d) => s + d.totalPenalty, 0) / last.length,
    bedSpread: stdev(last.map((d) => d.bedAbs)),
    wakeSpread: stdev(last.map((d) => d.wakeClock)),
    avgMidpoint: last.reduce((s, d) => s + d.midpointAbs, 0) / last.length,
    worstFactor,
    badNights: bad.length,
  };
}

// ---------- Достижения ----------

export const ACHIEVEMENTS = [
  { id: 'first', icon: '🌙', title: 'Первая ночь', desc: 'Записал первый сон',
    test: (s) => s.days.length >= 1 },
  { id: 'week', icon: '📅', title: 'Неделя наблюдений', desc: '7 записанных ночей',
    test: (s) => s.days.length >= 7 },
  { id: 'month', icon: '🗓️', title: 'Месяц наблюдений', desc: '30 записанных ночей',
    test: (s) => s.days.length >= 30 },
  { id: 'clean3', icon: '🔥', title: 'Три чистых ночи', desc: '3 зелёные ночи подряд',
    test: (s) => s.bestCleanStreak >= 3 },
  { id: 'clean7', icon: '🔥', title: 'Чистая неделя', desc: '7 зелёных ночей подряд',
    test: (s) => s.bestCleanStreak >= 7 },
  { id: 'phone5', icon: '📱', title: 'Телефон в стороне', desc: '5 ночей подряд без телефона перед сном',
    test: (s) => s.bestPhoneStreak >= 5 },
  { id: 'zero', icon: '💎', title: 'Ноль штрафов', desc: 'Ночь без единого штрафного очка',
    test: (s) => s.days.some((d) => d.totalPenalty === 0) },
  { id: 'nodebt', icon: '⚖️', title: 'Долгов нет', desc: 'Баланс сна за неделю вышел в плюс',
    test: (s) => s.balance.nights >= 5 && s.balance.balanceMinutes >= 0 },
  { id: 'steady', icon: '🎯', title: 'Стабильность', desc: 'Разброс отбоя меньше 45 минут за 7 ночей',
    test: (s) => s.stats.nights >= 7 && s.stats.bedSpread !== null && s.stats.bedSpread < 45 },
  { id: 'no6h', icon: '💪', title: 'Без провалов', desc: '14 ночей подряд, ни одной короче 6 часов',
    test: (s) => s.days.length >= 14 && s.days.slice(-14).every((d) => d.sleepMinutes >= 360) },
  { id: 'noblack', icon: '🛡️', title: 'Без срывов', desc: '21 ночь подряд без чёрных ночей',
    test: (s) => s.days.length >= 21 && s.days.slice(-21).every((d) => d.grade !== 'black') },
];

export function evaluateAchievements(summary) {
  return ACHIEVEMENTS.map((a) => {
    let unlocked = false;
    try { unlocked = Boolean(a.test(summary)); } catch { unlocked = false; }
    return { ...a, unlocked };
  });
}

// ---------- Валидация формы ----------

export function validateEntry(entry) {
  const errors = [];
  const warnings = [];
  if (!entry.bedTime) errors.push('Укажи, во сколько лёг.');
  if (!entry.wakeTime) errors.push('Укажи, во сколько проснулся.');
  if (errors.length) return { errors, warnings, resolved: null };

  const r = resolveEntry(entry);
  if (r.sleepMinutes <= 0) {
    errors.push('Подъём получился раньше отбоя — проверь время.');
  } else {
    if (r.sleepMinutes < 60) warnings.push('Меньше часа сна — это точно верные значения?');
    if (r.sleepMinutes > 14 * 60) warnings.push('Больше 14 часов сна — проверь, не перепутаны ли времена.');
  }
  if (r.phoneFreeMinutes !== null && r.phoneFreeMinutes < 0) {
    warnings.push(`Телефон отложен на ${formatDuration(-r.phoneFreeMinutes)} позже отбоя — значит, листал уже в кровати.`);
  }
  return { errors, warnings, resolved: r };
}
