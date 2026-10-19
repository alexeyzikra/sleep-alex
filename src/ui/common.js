/** Экранирование — в заметках к ночи пользователь пишет свободный текст */
export function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const ENERGY_LABELS = [
  { upTo: 2, icon: '😵', label: 'Убитый' },
  { upTo: 4, icon: '😩', label: 'Разбитый' },
  { upTo: 6, icon: '😐', label: 'Нормально' },
  { upTo: 8, icon: '🙂', label: 'Бодрый' },
  { upTo: 10, icon: '⚡', label: 'Заряжен' },
];

export function energyLabel(value) {
  return ENERGY_LABELS.find((l) => value <= l.upTo) || ENERGY_LABELS[2];
}

export const HYGIENE_ITEMS = [
  { key: 'noPhone', label: 'Не сидел в телефоне минимум 30 минут до сна' },
  { key: 'noCaffeine', label: 'Не пил кофе и энергетики во второй половине дня' },
  { key: 'goodRoom', label: 'Спал в проветренной и тёмной комнате' },
];
