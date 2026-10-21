/** Экранирование — в заметках к ночи пользователь пишет свободный текст */
export function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Своя реакция на каждое из десяти делений, а не одна на пару */
export const ENERGY_LEVELS = [
  { value: 1, icon: '💀', label: 'Разбитый' },
  { value: 2, icon: '😵', label: 'Очень тяжело' },
  { value: 3, icon: '😩', label: 'Вялый' },
  { value: 4, icon: '😕', label: 'Так себе' },
  { value: 5, icon: '😐', label: 'Нормально' },
  { value: 6, icon: '🙂', label: 'Неплохо' },
  { value: 7, icon: '😌', label: 'Бодрый' },
  { value: 8, icon: '😃', label: 'Выспался' },
  { value: 9, icon: '😁', label: 'Отлично' },
  { value: 10, icon: '⚡', label: 'Как новый' },
];

export function energyLabel(value) {
  return ENERGY_LEVELS[Math.min(10, Math.max(1, Math.round(value))) - 1];
}

/**
 * Отмечаются именно НАРУШЕНИЯ: в обычную ночь ничего отмечать не нужно.
 * Обратный вариант («не пил кофе») заставлял бы каждое утро
 * подтверждать то, что и так верно почти всегда.
 */
export const VIOLATION_ITEMS = [
  { key: 'caffeine', label: 'Пил кофе или энергетики во второй половине дня' },
  { key: 'badRoom', label: 'Было душно, жарко или светло' },
  { key: 'snoozed', label: 'Вставал не с первого раза, откладывал будильник' },
];

