// Экран «Гардероб»: сетка вещей, категории, отметки «надел».
import { h, icon, picture, chips } from '../ui.js';
import { state, activeItems, wearCount, wornOn, idleDays, toggleWear, dayKey } from '../store.js';
import { GROUPS, GROUP, COLORS } from '../catalog.js';
import { openItem } from './item.js';
import { addControl } from './add.js';

const view = { group: 'all', sort: 'new', marking: false, markAgo: 0 };
const MARK_DAYS = [
  { id: 0, name: 'Сегодня' },
  { id: 1, name: 'Вчера' },
  { id: 2, name: 'Позавчера' },
];
const markKey = () => dayKey(new Date(Date.now() - view.markAgo * 86400000));

const SORTS = [
  { id: 'new', name: 'Новые' },
  { id: 'most', name: 'Часто ношу' },
  { id: 'idle', name: 'Давно не носил' },
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

const VERDICT = { sell: 'Продать', give: 'Отдать', toss: 'Выкинуть' };

export function tile(item, { onTap, day } = {}) {
  const n = wearCount(item);
  const worn = wornOn(item, day || dayKey());
  const fade = state.settings.fade ? fadeLevel(item) : 0;
  return h(
    'button',
    {
      class: `tile fade-${fade} ${worn ? 'is-worn' : ''}`,
      type: 'button',
      dataset: { id: item.id },
      'aria-label': `${itemTitle(item)}, выходов: ${n}`,
      onClick: () => onTap && onTap(item),
    },
    picture('thumbs', item.id, { rev: item.rev, class: item.cut ? 'tile-img' : 'tile-img tile-img-photo' }),
    n ? h('span', { class: 'badge' }, String(n)) : null,
    worn ? h('span', { class: 'tile-check' }, icon('check', 12)) : null,
    item.decision !== 'keep' ? h('span', { class: `verdict verdict-${item.decision}` }, VERDICT[item.decision]) : null,
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

  if (!all.length) {
    view.marking = false;
    root.replaceChildren(
      h(
        'div',
        { class: 'screen' },
        h('header', { class: 'nav' }, h('h1', { class: 'large-title' }, 'Гардероб'), h('div', { class: 'nav-actions' }, addControl(icon('plus', 26), 'icon-btn'))),
        h('div', { class: 'empty' }, h('div', { class: 'empty-art' }, icon('hanger', 56)), h('h2', null, 'Нет вещей'), addControl('Добавить фото', 'btn btn-fill')),
      ),
    );
    return;
  }

  const present = new Set(all.map((i) => i.group));
  const groupOptions = [{ id: 'all', name: 'Все' }].concat(GROUPS.filter((g) => present.has(g.id)).map((g) => ({ id: g.id, name: g.name })));
  if (view.group !== 'all' && !present.has(view.group)) view.group = 'all';
  const list = sorted(view.group === 'all' ? all : all.filter((i) => i.group === view.group));

  const rerender = () => renderWardrobe(root);

  const sortButton = h(
    'label',
    { class: 'icon-btn select-btn', title: 'Порядок' },
    icon('sort', 22),
    h(
      'select',
      {
        'aria-label': 'Порядок',
        onChange: (e) => {
          view.sort = e.target.value;
          rerender();
        },
      },
      SORTS.map((s) => h('option', { value: s.id, selected: s.id === view.sort }, s.name)),
    ),
  );

  const onTap = async (item) => {
    if (!view.marking) return openItem(item.id);
    await toggleWear(item.id, markKey());
    if (navigator.vibrate) navigator.vibrate(8);
  };

  const actions = view.marking
    ? h(
        'button',
        {
          class: 'text-btn text-btn-strong',
          onClick: () => {
            view.marking = false;
            view.markAgo = 0;
            rerender();
          },
        },
        'Готово',
      )
    : [
        h(
          'button',
          {
            class: 'text-btn',
            onClick: () => {
              view.marking = true;
              rerender();
            },
          },
          'Надел',
        ),
        sortButton,
        addControl(icon('plus', 26), 'icon-btn'),
      ];

  root.replaceChildren(
    h(
      'div',
      { class: `screen ${view.marking ? 'is-marking' : ''}` },
      h('header', { class: 'nav' }, h('h1', { class: 'large-title' }, view.marking ? 'Что надел' : 'Гардероб'), h('div', { class: 'nav-actions' }, actions)),
      view.marking
        ? h(
            'div',
            { class: 'bar' },
            chips(
              MARK_DAYS,
              view.markAgo,
              (v) => {
                view.markAgo = v;
                rerender();
              },
              { className: 'segmented' },
            ),
          )
        : null,
      chips(
        groupOptions,
        view.group,
        (id) => {
          view.group = id;
          rerender();
        },
        { className: 'chips-scroll' },
      ),
      h(
        'div',
        { class: 'grid' },
        list.map((item) => tile(item, { onTap, day: view.marking ? markKey() : undefined })),
      ),
    ),
  );
}
