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

// ---------- Чётность недели ----------

/**
 * Номер недели по ISO 8601 — тот же, что показывают календари.
 * Нужен для расписаний, которые чередуются через неделю.
 */
export function isoWeek(dateISO) {
  const date = parseISO(dateISO);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // Переходим на четверг своей недели: по ISO год недели определяет именно он
  target.setDate(target.getDate() - ((target.getDay() + 6) % 7) + 3);

  const firstThursday = new Date(target.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3);

  return 1 + Math.round((target - firstThursday) / (7 * 86400000));
}

/** 'even' — чётная неделя, 'odd' — нечётная */
export function weekParity(dateISO) {
  return isoWeek(dateISO) % 2 === 0 ? 'even' : 'odd';
}

export const PARITY_LABELS = { even: 'чёт', odd: 'нечёт' };

// ---------- План на конкретную ночь ----------

/** Промежуток между отбоем и подъёмом, с переходом через полночь */
function spanOf(bedTime, wakeTime) {
  const wakeClock = toMinutes(wakeTime);
  const bedClock = toMinutes(bedTime);
  const bedAbs = bedClock > wakeClock ? bedClock - 1440 : bedClock;
  return { bedTime, wakeTime, bedClock, wakeClock, bedAbs, durationMinutes: wakeClock - bedAbs };
}

/** Расписание конкретного дня недели, с учётом чётности, или null */
function daySchedule(settings, dayOfWeek, parity) {
  if (settings.scheduleMode !== 'weekly') return null;
  const day = settings.days && settings.days[dayOfWeek];
  if (!day) return null;
  // Основной вариант — чётная неделя, alt — нечётная.
  // Нет alt — день одинаков обе недели.
  return (day.alt && parity === 'odd') ? day.alt : day;
}

/**
 * Якорь ритма — то, относительно чего считается «сдвиг плана».
 *
 * В простом режиме это единственное время подъёма. В недельном —
 * медиана всех запланированных подъёмов, включая оба варианта
 * чередующихся дней. Отдельной настройки якоря не нужно: он и так
 * однозначно следует из расписания.
 */
export function anchorWake(settings) {
  if (settings.scheduleMode !== 'weekly') return toMinutes(settings.wakeTime);

  const times = [];
  for (const day of WEEK_ORDER) {
    const entry = settings.days && settings.days[day.index];
    if (!entry) { times.push(toMinutes(settings.wakeTime)); continue; }
    times.push(toMinutes(entry.wakeTime));
    if (entry.alt) times.push(toMinutes(entry.alt.wakeTime));
  }
  const sorted = times.sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Во сколько по плану надо лечь и встать именно в эту ночь.
 *
 * Норма часов НЕ вводится руками: она всегда равна промежутку между
 * отбоем и подъёмом, поэтому противоречивые настройки («ложусь в 23:00,
 * встаю в 6:00, сплю 9 часов») невозможны в принципе.
 */
export function plannedFor(dateISO, settings) {
  const dayOfWeek = parseISO(dateISO).getDay();
  const parity = weekParity(dateISO);
  const scheduled = daySchedule(settings, dayOfWeek, parity);

  const span = scheduled
    ? spanOf(scheduled.bedTime, scheduled.wakeTime)
    : spanOf(settings.bedTime, settings.wakeTime);

  const entry = settings.days && settings.days[dayOfWeek];

  return {
    ...span,
    parity,
    week: isoWeek(dateISO),
    alternates: Boolean(settings.scheduleMode === 'weekly' && entry && entry.alt),
    isWeekly: settings.scheduleMode === 'weekly',
    driftFromAnchor: circularDistance(span.wakeClock, anchorWake(settings)),
  };
}

/** Раскладка недели для экрана настроек */
export function weeklyPlan(settings) {
  const anchor = anchorWake(settings);

  return WEEK_ORDER.map((day) => {
    const entry = (settings.days && settings.days[day.index])
      || { bedTime: settings.bedTime, wakeTime: settings.wakeTime };

    const variant = (source) => {
      const span = spanOf(source.bedTime, source.wakeTime);
      return { ...span, driftFromAnchor: circularDistance(span.wakeClock, anchor) };
    };

    return {
      ...day,
      main: variant(entry),
      alt: entry.alt ? variant(entry.alt) : null,
      alternates: Boolean(entry.alt),
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
    `${plan.wakeTime} против обычных ${fromMinutes(anchorWake(settings))}`);

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

// ---------- Форма ----------

/**
 * «Форма» вместо уровней.
 *
 * Уровни на накопительных очках показывали посещаемость, а не сон:
 * три месяца плохого режима всё равно оставляли высокий уровень,
 * потому что очки только прибавлялись. Форма — это среднее число
 * штрафных очков за ночь в скользящем окне: она растёт и падает
 * вместе с реальным положением дел и не накручивается тем,
 * что ты просто открываешь приложение.
 */

export const FORM_WINDOW = 7;
export const FORM_MIN_NIGHTS = 4;

export const FORM_BANDS = [
  { upTo: 60, title: 'Режим держится', tone: 'green' },
  { upTo: 150, title: 'Режим съезжает', tone: 'yellow' },
  { upTo: Infinity, title: 'Режим сбит', tone: 'red' },
];

function averagePenalty(days) {
  if (!days.length) return null;
  return days.reduce((sum, d) => sum + d.totalPenalty, 0) / days.length;
}

/**
 * Окно — неделя, а не две: за две недели хорошая неделя после плохой
 * всё равно показывала бы «режим сбит», хотя сейчас всё уже в порядке.
 * Тренд сравнивает эту неделю с предыдущей.
 */
export function computeForm(days) {
  const window = days.slice(-FORM_WINDOW);
  if (window.length < FORM_MIN_NIGHTS) {
    return {
      nights: window.length,
      enough: false,
      needed: FORM_MIN_NIGHTS - window.length,
      avgPenalty: null, band: null, trend: null,
    };
  }

  const avgPenalty = averagePenalty(window);
  const band = FORM_BANDS.find((b) => avgPenalty <= b.upTo);

  const recent = days.slice(-7);
  const previous = days.slice(-14, -7);
  let trend = null;
  if (recent.length >= 3 && previous.length >= 3) {
    const delta = averagePenalty(recent) - averagePenalty(previous);
    trend = {
      delta: Math.round(delta),
      direction: Math.abs(delta) < 5 ? 'flat' : (delta < 0 ? 'better' : 'worse'),
    };
  }

  return { nights: window.length, enough: true, avgPenalty, band, trend };
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
    days.push(scoreEntry(entry, settings, { midpointBaseline: baseline }));
    midpointHistory.push(days[days.length - 1].midpointAbs);
  }

  const countFromEnd = (predicate) => {
    let n = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (!predicate(days[i])) break;
      n += 1;
    }
    return n;
  };
  const isClean = (d) => d.grade === 'green';
  const noBlack = (d) => d.grade !== 'black';
  const noPhone = (d) => Boolean(d.entry.hygiene && d.entry.hygiene.noPhone);

  const cleanStreak = countFromEnd(isClean);
  const phoneStreak = countFromEnd(noPhone);
  const noBlackStreak = countFromEnd(noBlack);

  // Лучший результат запоминается навсегда: сорванный стрик не должен
  // отбирать уже пройденную веху.
  const bestOf = (predicate) => {
    let best = 0;
    let run = 0;
    for (const day of days) {
      run = predicate(day) ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return best;
  };

  const byDate = {};
  for (const day of days) byDate[day.entry.date] = day;

  const balance = sleepBalance(days, today, 7);
  const stats = weekStats(days, today);

  const summary = {
    days, balance, stats,
    cleanStreak, phoneStreak, noBlackStreak,
    bestCleanStreak: bestOf(isClean),
    bestPhoneStreak: bestOf(noPhone),
    bestNoBlackStreak: bestOf(noBlack),
    hasPerfectNight: days.some((d) => d.totalPenalty === 0),
  };

  return {
    settings, today, days, byDate,
    ...summary,
    form: computeForm(days),
    milestones: evaluateMilestones(summary),
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

// ---------- Вехи ----------

/**
 * Вехи вместо достижений с замочками.
 *
 * У каждой есть текущий прогресс и лучший достигнутый результат.
 * Засчитывается по лучшему — сорванный стрик не отбирает пройденное,
 * а прогресс показывает, сколько осталось до следующей. Полоска
 * «4 из 7» тянет вперёд, серый замочек не тянет никуда.
 */
export const MILESTONES = [
  { id: 'first', title: 'Первая записанная ночь', target: 1,
    current: (s) => s.days.length, best: (s) => s.days.length },

  { id: 'perfect', title: 'Ночь без единого штрафного очка', target: 1,
    current: (s) => (s.hasPerfectNight ? 1 : 0), best: (s) => (s.hasPerfectNight ? 1 : 0) },

  { id: 'clean5', title: 'Пять чистых ночей подряд', unit: 'ночей', target: 5,
    current: (s) => s.cleanStreak, best: (s) => s.bestCleanStreak },

  { id: 'noblack7', title: 'Неделя без срывов', unit: 'ночей', target: 7,
    current: (s) => s.noBlackStreak, best: (s) => s.bestNoBlackStreak },

  { id: 'phone7', title: 'Неделя без телефона перед сном', unit: 'ночей', target: 7,
    current: (s) => s.phoneStreak, best: (s) => s.bestPhoneStreak },

  { id: 'clean10', title: 'Десять чистых ночей подряд', unit: 'ночей', target: 10,
    current: (s) => s.cleanStreak, best: (s) => s.bestCleanStreak },

  { id: 'noblack14', title: 'Две недели без срывов', unit: 'ночей', target: 14,
    current: (s) => s.noBlackStreak, best: (s) => s.bestNoBlackStreak },

  { id: 'nights30', title: 'Месяц наблюдений', unit: 'ночей', target: 30,
    current: (s) => s.days.length, best: (s) => s.days.length },
];

export function evaluateMilestones(summary) {
  const safe = (fn) => {
    try { return Math.max(0, Number(fn(summary)) || 0); } catch { return 0; }
  };

  return MILESTONES.map((m) => {
    const best = safe(m.best);
    const current = Math.min(safe(m.current), m.target);
    const done = best >= m.target;
    return {
      ...m, current, best, done,
      progress: done ? 1 : Math.min(1, current / m.target),
      remaining: Math.max(0, m.target - current),
    };
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
