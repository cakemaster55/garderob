// Случайный образ из вещей гардероба и расстановка по полотну.

// Центр (доли полотна) и ширина для каждой категории.
export const SLOTS = {
  top: { x: 0.5, y: 0.27, w: 0.5 },
  bottom: { x: 0.5, y: 0.63, w: 0.4 },
  dress: { x: 0.5, y: 0.45, w: 0.5 },
  outer: { x: 0.27, y: 0.32, w: 0.46 },
  shoes: { x: 0.5, y: 0.87, w: 0.26 },
  acc: { x: 0.82, y: 0.16, w: 0.24 },
  other: { x: 0.18, y: 0.82, w: 0.26 },
};

// Высокие вещи делаем уже, чтобы помещались в полотно 3:4.
export function fitWidth(item, w, maxHeight = 0.62) {
  const height = (w / (item.ratio || 1)) * (3 / 4);
  return height > maxHeight ? (w * maxHeight) / height : w;
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function choose(items) {
  const by = (g) => items.filter((i) => i.group === g);
  const tops = by('top');
  const bottoms = by('bottom');
  const dresses = by('dress');
  const chosen = [];

  const pairs = Math.min(tops.length, bottoms.length);
  if (dresses.length && (!pairs || Math.random() < dresses.length / (dresses.length + pairs))) {
    chosen.push(pick(dresses));
  } else {
    if (bottoms.length) chosen.push(pick(bottoms));
    if (tops.length) chosen.push(pick(tops));
  }
  const outers = by('outer');
  if (outers.length && Math.random() < 0.45) chosen.push(pick(outers));
  const shoes = by('shoes');
  if (shoes.length) chosen.push(pick(shoes));
  const accs = by('acc');
  if (accs.length && Math.random() < 0.5) chosen.push(pick(accs));

  if (!chosen.length) {
    const rest = [...items].sort(() => Math.random() - 0.5);
    chosen.push(...rest.slice(0, 3));
  }
  return chosen;
}

// Наибольшие ширина и высота вещи на полотне (доли полотна) в случайном образе.
const LIMITS = {
  top: { w: 0.5, h: 0.3 },
  dress: { w: 0.52, h: 0.66 },
  bottom: { w: 0.42, h: 0.4 },
  shoes: { w: 0.3, h: 0.14 },
  outer: { w: 0.42, h: 0.36 },
  acc: { w: 0.2, h: 0.15 },
  other: { w: 0.26, h: 0.2 },
};

// Размер вещи, вписанной в рамку: высота на полотне 3:4 равна w / ratio * 3/4.
function size(item) {
  const lim = LIMITS[item.group] || LIMITS.other;
  const ratio = item.ratio || 1;
  const w = Math.min(lim.w, (lim.h * ratio * 4) / 3);
  return { w, h: (w / ratio) * 0.75 };
}

/** Случайный набор слоёв. previous — прошлый набор, чтобы не повторяться. */
export function randomLayers(items, previous = []) {
  if (!items.length) return [];
  const before = previous.map((l) => l.itemId).sort().join();
  let chosen = choose(items);
  for (let i = 0; i < 6 && chosen.map((c) => c.id).sort().join() === before; i++) chosen = choose(items);

  // Основные вещи встают столбиком без наложений: верх (или платье), низ, обувь.
  const order = { top: 0, dress: 0, bottom: 1, shoes: 2 };
  const column = chosen.filter((c) => c.group in order).sort((a, b) => order[a.group] - order[b.group]);
  const sizes = new Map(chosen.map((c) => [c.id, size(c)]));
  const gap = 0.02;
  const total = column.reduce((sum, c) => sum + sizes.get(c.id).h, 0) + gap * Math.max(0, column.length - 1);
  const k = Math.min(1, 0.94 / (total || 1));
  const outer = chosen.find((c) => c.group === 'outer');
  // С верхней одеждой столбик уходит вправо, а она встаёт слева.
  const columnX = outer ? 0.69 : 0.5;
  const columnMax = outer ? 0.44 : 1;

  const layers = [];
  let y = (1 - total * k) / 2;
  let firstY = 0.3;
  for (const item of column) {
    const sz = sizes.get(item.id);
    const w = Math.min(sz.w * k, columnMax);
    if (!layers.length) firstY = y + (sz.h * k) / 2;
    layers.push({ itemId: item.id, x: columnX, y: y + (sz.h * k) / 2, w });
    y += sz.h * k + gap;
  }
  if (outer) {
    const sz = sizes.get(outer.id);
    layers.push({ itemId: outer.id, x: 0.24, y: Math.max(sz.h / 2 + 0.03, firstY), w: sz.w });
  }
  let loose = 0;
  for (const item of chosen) {
    if (item.group in order || item.group === 'outer') continue;
    const sz = sizes.get(item.id);
    if (item.group === 'acc') layers.push(outer ? { itemId: item.id, x: 0.24, y: 0.95 - sz.h / 2, w: sz.w } : { itemId: item.id, x: 0.87, y: 0.04 + sz.h / 2, w: sz.w });
    else layers.push({ itemId: item.id, x: 0.2 + 0.3 * loose++, y: 0.85, w: sz.w });
  }
  return layers;
}
