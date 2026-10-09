// Экран «Гардероб»: сетка вещей, категории, быстрые отметки «надел сегодня».
import { h, icon, picture, chips, toast } from '../ui.js';
import { state, activeItems, wearCount, wornOn, idleDays, toggleWear, dayKey } from '../store.js';
import { GROUPS, GROUP, COLOR, COLORS, pluralItems } from '../catalog.js';
import { openItem } from './item.js';
import { openAdd } from './add.js';

const view = { group: 'all', sort: 'new', marking: false, markAgo: 0, color: null };
const MARK_DAYS = [
  { id: 0, name: 'Сегодня' },
  { id: 1, name: 'Вчера' },
  { id: 2, name: 'Позавчера' },
];
const markKey = () => dayKey(new Date(Date.now() - view.markAgo * 86400000));

const SORTS = [
  { id: 'new', name: 'Сначала новые' },
  { id: 'most', name: 'Чаще ношу' },
  { id: 'idle', name: 'Дольше без дела' },
  { id: 'color', name: 'По цвету' },
];

// Насколько вещь «выцвела»: 0 — носится, 1 — подзабыта, 2 — лежит без дела.
export function fadeLevel(item) {
  const age = Math.round((Date.now() - item.createdAt) / 86400000);
  if (age < 21 && !item.wears.length) return 0; // только что добавил — рано судить
  const idle = idleDays(item);
  if (idle >= 90) return 2;
  if (idle >= 45) return 1;
  return 0;
}

export function itemTitle(item) {
  return item.name || item.type || GROUP[item.group]?.name || 'Вещь';
}

export function tile(item, { onTap, selected = false, showTag = true, day } = {}) {
  const n = wearCount(item);
  const today = wornOn(item, day || dayKey());
  const fade = state.settings.fade ? fadeLevel(item) : 0;
  return h(
    'button',
    {
      class: `tile fade-${fade} ${selected ? 'is-selected' : ''} ${today ? 'is-today' : ''}`,
      type: 'button',
      dataset: { id: item.id },
      'aria-label': `${itemTitle(item)}, надевал ${n}`,
      onClick: () => onTap && onTap(item),
    },
    picture('thumbs', item.id, { rev: item.rev, class: item.cut ? 'tile-img' : 'tile-img tile-img-photo' }),
    showTag ? h('span', { class: `wear-tag ${n ? '' : 'is-zero'}` }, today ? icon('check', 13) : null, String(n)) : null,
    item.decision !== 'keep' ? h('span', { class: `verdict verdict-${item.decision}` }, { sell: 'продать', give: 'отдать', toss: 'выкинуть' }[item.decision]) : null,
  );
}

function sorted(items) {
  const list = [...items];
  if (view.sort === 'most') list.sort((a, b) => wearCount(b) - wearCount(a) || b.createdAt - a.createdAt);
  else if (view.sort === 'idle') list.sort((a, b) => idleDays(b) - idleDays(a));
  else if (view.sort === 'color') {
    const order = Object.fromEntries(COLORS.map((c, i) => [c.id, i]));
    list.sort((a, b) => (order[a.color] ?? 99) - (order[b.color] ?? 99));
  }
  return list;
}

export function renderWardrobe(root) {
  const all = activeItems();
  const idle = all.filter((i) => fadeLevel(i) === 2).length;
  const wornToday = all.filter((i) => wornOn(i)).length;

  if (!all.length) {
    root.replaceChildren(
      h(
        'div',
        { class: 'screen' },
        h('header', { class: 'screen-head' }, h('h1', null, 'Гардероб')),
        h(
          'div',
          { class: 'empty' },
          h('div', { class: 'empty-art' }, icon('hanger', 72)),
          h('h2', null, 'Здесь пока пусто'),
          h(
            'p',
            null,
            'Разложи вещь на полу или кровати, сфотографируй сверху целиком. Фон уберётся сам, вещь попадёт в свою категорию.',
          ),
          h('button', { class: 'btn btn-primary btn-big', onClick: openAdd }, icon('camera', 20), 'Добавить первую вещь'),
          h('p', { class: 'hint' }, 'Можно выбрать сразу много фото из галереи.'),
        ),
      ),
    );
    return;
  }

  const counts = { all: all.length };
  for (const it of all) counts[it.group] = (counts[it.group] || 0) + 1;
  const groupOptions = [{ id: 'all', name: 'Все', count: counts.all }].concat(
    GROUPS.filter((g) => counts[g.id]).map((g) => ({ id: g.id, name: g.name, count: counts[g.id] })),
  );
  if (view.group !== 'all' && !counts[view.group]) view.group = 'all';

  let list = view.group === 'all' ? all : all.filter((i) => i.group === view.group);
  const colorsHere = [...new Set(list.map((i) => i.color).filter(Boolean))];
  if (view.color && !colorsHere.includes(view.color)) view.color = null;
  if (view.color) list = list.filter((i) => i.color === view.color);
  list = sorted(list);

  const sortSelect = h(
    'select',
    {
      class: 'select',
      'aria-label': 'Порядок',
      onChange: (e) => {
        view.sort = e.target.value;
        renderWardrobe(root);
      },
    },
    SORTS.map((s) => h('option', { value: s.id, selected: s.id === view.sort }, s.name)),
  );

  const colorRow =
    colorsHere.length > 1
      ? h(
          'div',
          { class: 'swatch-row', role: 'group', 'aria-label': 'Цвет' },
          COLORS.filter((c) => colorsHere.includes(c.id)).map((c) =>
            h('button', {
              class: `swatch-btn ${view.color === c.id ? 'is-on' : ''}`,
              style: { '--c': c.hex },
              title: c.name,
              'aria-label': c.name,
              'aria-pressed': view.color === c.id ? 'true' : 'false',
              onClick: () => {
                view.color = view.color === c.id ? null : c.id;
                renderWardrobe(root);
              },
            }),
          ),
        )
      : null;

  const onTap = async (item) => {
    if (view.marking) {
      const on = await toggleWear(item.id, markKey());
      if (navigator.vibrate) navigator.vibrate(8);
      toast(on ? `Надел ${MARK_DAYS[view.markAgo].name.toLowerCase()}: ${itemTitle(item).toLowerCase()}` : 'Отметка снята');
    } else {
      openItem(item.id);
    }
  };

  const summary = [pluralItems(all.length)];
  if (idle) summary.push(`${idle} без дела`);

  root.replaceChildren(
    h(
      'div',
      { class: `screen ${view.marking ? 'is-marking' : ''}` },
      h(
        'header',
        { class: 'screen-head' },
        h('div', null, h('h1', null, 'Гардероб'), h('p', { class: 'screen-sub' }, summary.join(', '))),
        h(
          'button',
          {
            class: `btn ${view.marking ? 'btn-chalk' : 'btn-outline'} btn-small`,
            'aria-pressed': view.marking ? 'true' : 'false',
            onClick: () => {
              view.marking = !view.marking;
              view.markAgo = 0;
              renderWardrobe(root);
            },
          },
          view.marking ? [icon('check', 16), 'Готово'] : wornToday ? `Сегодня на мне: ${wornToday}` : 'Что на мне сегодня',
        ),
      ),
      view.marking
        ? h(
            'div',
            { class: 'marking-bar' },
            h('p', null, 'Нажимай на вещи, которые надевал. Повторное нажатие снимает отметку.'),
            chips(MARK_DAYS, view.markAgo, (v) => {
              view.markAgo = v;
              renderWardrobe(root);
            }),
          )
        : null,
      chips(
        groupOptions,
        view.group,
        (id) => {
          view.group = id;
          view.color = null;
          renderWardrobe(root);
        },
        { className: 'chips-scroll' },
      ),
      h('div', { class: 'toolbar' }, sortSelect, colorRow),
      list.length
        ? h(
            'div',
            { class: 'grid' },
            list.map((item) => tile(item, { onTap, day: view.marking ? markKey() : undefined })),
          )
        : h('p', { class: 'hint pad' }, `Вещей цвета «${COLOR[view.color]?.name.toLowerCase()}» здесь нет.`),
      state.settings.fade && idle
        ? h('p', { class: 'hint pad' }, 'Побледневшие вещи ты не надевал три месяца и дольше. Что с ними делать, подскажет «Разбор».')
        : null,
    ),
  );
}
