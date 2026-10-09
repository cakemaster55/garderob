// Справочники: категории, типы вещей, цвета, решения.

export const GROUPS = [
  { id: 'top', name: 'Верх', one: 'верх', types: ['Футболка', 'Лонгслив', 'Рубашка', 'Поло', 'Майка', 'Топ', 'Блузка', 'Свитер', 'Худи', 'Свитшот', 'Кардиган'] },
  { id: 'bottom', name: 'Низ', one: 'низ', types: ['Джинсы', 'Брюки', 'Шорты', 'Юбка', 'Спортивные штаны', 'Леггинсы'] },
  { id: 'dress', name: 'Платья', one: 'платье', types: ['Платье', 'Сарафан', 'Комбинезон'] },
  { id: 'outer', name: 'Верхняя одежда', one: 'верхняя одежда', types: ['Куртка', 'Пальто', 'Пуховик', 'Пиджак', 'Плащ', 'Жилет', 'Ветровка'] },
  { id: 'shoes', name: 'Обувь', one: 'обувь', types: ['Кроссовки', 'Кеды', 'Ботинки', 'Туфли', 'Лоферы', 'Сандалии', 'Сапоги', 'Шлёпанцы'] },
  { id: 'acc', name: 'Аксессуары', one: 'аксессуар', types: ['Сумка', 'Рюкзак', 'Головной убор', 'Шарф', 'Ремень', 'Очки', 'Часы', 'Украшение', 'Перчатки', 'Галстук'] },
  { id: 'other', name: 'Другое', one: 'другое', types: ['Бельё', 'Носки', 'Купальник', 'Спорт', 'Пижама'] },
];
export const GROUP = Object.fromEntries(GROUPS.map((g) => [g.id, g]));

export const SEASONS = [
  { id: 'all', name: 'Круглый год' },
  { id: 'warm', name: 'Тепло' },
  { id: 'cold', name: 'Холод' },
];

// Что решил делать с вещью.
export const DECISIONS = [
  { id: 'keep', name: 'Оставить', short: 'Оставляю' },
  { id: 'sell', name: 'Продать', short: 'Продать' },
  { id: 'give', name: 'Отдать', short: 'Отдать' },
  { id: 'toss', name: 'Выкинуть', short: 'Выкинуть' },
];
export const DECISION = Object.fromEntries(DECISIONS.map((d) => [d.id, d]));

// Куда вещь ушла, когда её убрали из гардероба.
export const GONE = { sell: 'Продано', give: 'Отдано', toss: 'Выкинуто', keep: 'Убрано' };

export const COLORS = [
  { id: 'black', name: 'Чёрный', hex: '#1b1b1d' },
  { id: 'white', name: 'Белый', hex: '#fafafa' },
  { id: 'grey', name: 'Серый', hex: '#9a9da3' },
  { id: 'beige', name: 'Бежевый', hex: '#d9c4a3' },
  { id: 'brown', name: 'Коричневый', hex: '#7a5234' },
  { id: 'red', name: 'Красный', hex: '#d0342c' },
  { id: 'pink', name: 'Розовый', hex: '#ef9db8' },
  { id: 'orange', name: 'Оранжевый', hex: '#f08a2c' },
  { id: 'yellow', name: 'Жёлтый', hex: '#f2cf3b' },
  { id: 'green', name: 'Зелёный', hex: '#3f8f52' },
  { id: 'khaki', name: 'Хаки', hex: '#75794f' },
  { id: 'lightblue', name: 'Голубой', hex: '#8fbfe6' },
  { id: 'blue', name: 'Синий', hex: '#2c4f9e' },
  { id: 'navy', name: 'Тёмно-синий', hex: '#1f2a44' },
  { id: 'purple', name: 'Фиолетовый', hex: '#7b4fa3' },
];
export const COLOR = Object.fromEntries(COLORS.map((c) => [c.id, c]));

// Метки классификатора одежды -> категория и тип.
export const CLOTHES_LABELS = {
  dress: ['dress', 'Платье'],
  hat: ['acc', 'Головной убор'],
  longsleeve: ['top', 'Лонгслив'],
  outwear: ['outer', 'Куртка'],
  pants: ['bottom', 'Брюки'],
  shirt: ['top', 'Рубашка'],
  shoes: ['shoes', ''],
  shorts: ['bottom', 'Шорты'],
  skirt: ['bottom', 'Юбка'],
  't-shirt': ['top', 'Футболка'],
};

// Классы ImageNet, которые уточняют тип или дают категории, которых нет в основном классификаторе.
// kind: 'refine' — уточняет тип внутри уже угаданной категории; 'new' — может заменить категорию.
export const IMAGENET_HINTS = {
  608: { group: 'bottom', type: 'Джинсы', kind: 'refine' }, // jean
  841: { group: 'top', type: 'Свитшот', kind: 'refine' }, // sweatshirt
  474: { group: 'top', type: 'Кардиган', kind: 'refine' }, // cardigan
  869: { group: 'outer', type: 'Плащ', kind: 'refine' }, // trench coat
  568: { group: 'outer', type: 'Пальто', kind: 'refine' }, // fur coat
  770: { group: 'shoes', type: 'Кроссовки', kind: 'refine' }, // running shoe
  774: { group: 'shoes', type: 'Сандалии', kind: 'refine' }, // sandal
  630: { group: 'shoes', type: 'Лоферы', kind: 'refine' }, // loafer
  514: { group: 'shoes', type: 'Сапоги', kind: 'refine' }, // cowboy boot
  502: { group: 'shoes', type: 'Шлёпанцы', kind: 'refine' }, // clog
  414: { group: 'acc', type: 'Рюкзак', kind: 'new' }, // backpack
  748: { group: 'acc', type: 'Сумка', kind: 'new' }, // purse
  636: { group: 'acc', type: 'Сумка', kind: 'new' }, // mailbag
  893: { group: 'acc', type: 'Сумка', kind: 'new' }, // wallet
  837: { group: 'acc', type: 'Очки', kind: 'new' }, // sunglasses
  836: { group: 'acc', type: 'Очки', kind: 'new' }, // sunglass
  531: { group: 'acc', type: 'Часы', kind: 'new' }, // digital watch
  409: { group: 'acc', type: 'Часы', kind: 'new' }, // analog clock
  826: { group: 'acc', type: 'Часы', kind: 'new' }, // stopwatch
  679: { group: 'acc', type: 'Украшение', kind: 'new' }, // necklace
  488: { group: 'acc', type: 'Украшение', kind: 'new' }, // chain
  457: { group: 'acc', type: 'Галстук', kind: 'new' }, // bow tie
  906: { group: 'acc', type: 'Галстук', kind: 'new' }, // Windsor tie
  824: { group: 'acc', type: 'Шарф', kind: 'new' }, // stole
  658: { group: 'acc', type: 'Перчатки', kind: 'new' }, // mitten
  806: { group: 'other', type: 'Носки', kind: 'new' }, // sock
  445: { group: 'other', type: 'Купальник', kind: 'new' }, // bikini
  639: { group: 'other', type: 'Купальник', kind: 'new' }, // maillot
  842: { group: 'other', type: 'Купальник', kind: 'new' }, // swimming trunks
  459: { group: 'other', type: 'Бельё', kind: 'new' }, // brassiere
  697: { group: 'other', type: 'Пижама', kind: 'new' }, // pajama
  464: { group: 'acc', type: 'Ремень', kind: 'new' }, // buckle
  834: { group: 'outer', type: 'Пиджак', kind: 'refine' }, // suit
};

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
export const pluralItems = (n) => `${n} ${plural(n, 'вещь', 'вещи', 'вещей')}`;
export const pluralTimes = (n) => `${n} ${plural(n, 'раз', 'раза', 'раз')}`;
export const pluralDays = (n) => `${n} ${plural(n, 'день', 'дня', 'дней')}`;
