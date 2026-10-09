// Экран «Разбор»: что носится, что лежит, что продать, отдать, выкинуть и купить.
import { h, icon, picture, chips, toast, money } from '../ui.js';
import { state, activeItems, wearCount, idleDays, daysBetween, updateItem, getWishlist, setWishlist } from '../store.js';
import { GROUPS, COLORS, DECISION, GONE, pluralDays, pluralTimes, pluralItems } from '../catalog.js';
import { uid } from '../db.js';
import { openItem } from './item.js';
import { itemTitle, fadeLevel } from './wardrobe.js';

const view = { period: 90, showAllIdle: false };
const PERIODS = [
  { id: 30, name: '30 дней' },
  { id: 90, name: '3 месяца' },
  { id: 365, name: 'Год' },
];

const wearsIn = (item, days) => item.wears.filter((k) => daysBetween(k) < days).length;

function row(item, caption, trailing) {
  return h(
    'div',
    { class: 'cell cell-item' },
    h('button', { class: 'cell-main', onClick: () => openItem(item.id) }, h('span', { class: 'cell-thumb' }, picture('thumbs', item.id, { rev: item.rev })), h('span', { class: 'cell-text' }, h('b', null, itemTitle(item)), h('span', null, caption))),
    trailing || null,
  );
}

const card = (title, ...nodes) => h('section', { class: 'section' }, title ? h('h2', { class: 'title' }, title) : null, nodes);

export function renderInsights(root) {
  const items = activeItems();
  const nav = h('header', { class: 'nav' }, h('h1', { class: 'large-title' }, 'Разбор'));

  if (!items.length) {
    root.replaceChildren(h('div', { class: 'screen' }, nav, h('div', { class: 'empty' }, h('div', { class: 'empty-art' }, icon('chart', 56)), h('h2', null, 'Нет данных'))));
    return;
  }

  const period = view.period;
  const totalWears = items.reduce((s, i) => s + wearCount(i), 0);
  const worn = items.filter((i) => wearsIn(i, period) > 0);
  const share = Math.round((worn.length / items.length) * 100);
  const rerender = () => renderInsights(root);
  const sections = [];

  // --- сводка ---
  sections.push(
    h(
      'section',
      { class: 'section' },
      totalWears
        ? chips(
            PERIODS,
            period,
            (v) => {
              view.period = v;
              rerender();
            },
            { className: 'segmented' },
          )
        : null,
      h(
        'div',
        { class: 'group summary' },
        totalWears
          ? [h('p', { class: 'figure' }, `${worn.length} из ${items.length}`), h('p', { class: 'caption' }, 'вещей в носке'), h('div', { class: 'meter', role: 'img', 'aria-label': `${share}%` }, h('i', { style: { width: `${share}%` } }))]
          : [h('p', { class: 'figure' }, String(items.length)), h('p', { class: 'caption' }, 'Отмечай в гардеробе, что надел')],
      ),
    ),
  );

  // --- чаще всего ---
  const top = [...items].filter((i) => wearsIn(i, period) > 0).sort((a, b) => wearsIn(b, period) - wearsIn(a, period)).slice(0, 8);
  if (top.length) {
    sections.push(
      card(
        'Чаще всего',
        h(
          'div',
          { class: 'strip' },
          top.map((i) => h('button', { class: 'strip-item', 'aria-label': itemTitle(i), onClick: () => openItem(i.id) }, picture('thumbs', i.id, { rev: i.rev }), h('span', { class: 'badge' }, String(wearsIn(i, period))))),
        ),
      ),
    );
  }

  // --- без дела ---
  const idle = items.filter((i) => i.decision === 'keep' && fadeLevel(i) >= 1).sort((a, b) => idleDays(b) - idleDays(a));
  if (idle.length) {
    const shown = view.showAllIdle ? idle : idle.slice(0, 5);
    const value = idle.reduce((s, i) => s + (i.price || 0), 0);
    sections.push(
      card(
        'Без дела',
        h(
          'div',
          { class: 'group' },
          shown.map((i) =>
            row(
              i,
              pluralDays(idleDays(i)),
              h(
                'label',
                { class: 'menu-btn' },
                'Решить',
                h(
                  'select',
                  {
                    'aria-label': `Решение: ${itemTitle(i)}`,
                    onChange: (e) => {
                      const d = e.target.value;
                      if (!d) return;
                      updateItem(i.id, { decision: d });
                      toast(DECISION[d].name, { label: 'Отменить', run: () => updateItem(i.id, { decision: 'keep' }) });
                    },
                  },
                  h('option', { value: '' }, 'Оставить'),
                  ['sell', 'give', 'toss'].map((d) => h('option', { value: d }, DECISION[d].name)),
                ),
              ),
            ),
          ),
          idle.length > shown.length
            ? h(
                'button',
                {
                  class: 'cell cell-action',
                  onClick: () => {
                    view.showAllIdle = true;
                    rerender();
                  },
                },
                `Все ${idle.length}`,
              )
            : null,
        ),
        value ? h('p', { class: 'caption' }, `Куплено за ${money(value)}`) : null,
      ),
    );
  }

  // --- на выход ---
  const leaving = items.filter((i) => i.decision !== 'keep');
  if (leaving.length) {
    sections.push(
      card(
        'На выход',
        h(
          'div',
          { class: 'group' },
          leaving.map((i) =>
            row(
              i,
              h('span', { class: `tag tag-${i.decision}` }, DECISION[i.decision].name),
              h(
                'button',
                {
                  class: 'text-btn',
                  onClick: async () => {
                    await updateItem(i.id, { goneAt: Date.now() });
                    toast(GONE[i.decision], { label: 'Вернуть', run: () => updateItem(i.id, { goneAt: null }) });
                  },
                },
                'Убрать',
              ),
            ),
          ),
        ),
      ),
    );
  }

  // --- категории ---
  const groups = GROUPS.map((g) => {
    const list = items.filter((i) => i.group === g.id);
    return { g, count: list.length, worn: list.filter((i) => wearsIn(i, period) > 0).length };
  }).filter((x) => x.count);
  const max = Math.max(...groups.map((x) => x.count));
  sections.push(
    card(
      'Категории',
      h(
        'div',
        { class: 'group bars' },
        groups.map(({ g, count, worn: w }) =>
          h(
            'div',
            { class: 'bar-row' },
            h('div', { class: 'bar-label' }, h('span', null, g.name), h('span', { class: 'muted' }, totalWears ? `${w} из ${count}` : String(count))),
            h('div', { class: 'bar', style: { width: `${Math.max(8, (count / max) * 100)}%` } }, h('i', { style: { width: `${(w / count) * 100}%` } })),
          ),
        ),
      ),
    ),
  );

  // --- цвета ---
  const colorCounts = {};
  for (const i of items) if (i.color) colorCounts[i.color] = (colorCounts[i.color] || 0) + 1;
  const colorList = COLORS.filter((c) => colorCounts[c.id]).sort((a, b) => colorCounts[b.id] - colorCounts[a.id]);
  if (colorList.length > 1) {
    const total = colorList.reduce((s, c) => s + colorCounts[c.id], 0);
    sections.push(
      card(
        'Цвета',
        h(
          'div',
          { class: 'group pad' },
          h('div', { class: 'palette', role: 'img', 'aria-label': 'Доли цветов' }, colorList.map((c) => h('i', { style: { background: c.hex, flexGrow: colorCounts[c.id] }, title: c.name }))),
          h(
            'div',
            { class: 'palette-legend' },
            colorList.slice(0, 5).map((c) => h('span', null, h('i', { class: 'swatch', style: { background: c.hex } }), `${c.name} ${Math.round((colorCounts[c.id] / total) * 100)}%`)),
          ),
        ),
      ),
    );
  }

  // --- цена выхода ---
  const priced = items.filter((i) => i.price > 0);
  if (priced.length) {
    const worst = [...priced].sort((a, b) => b.price / Math.max(1, wearCount(b)) - a.price / Math.max(1, wearCount(a))).slice(0, 5);
    sections.push(
      card(
        'Цена выхода',
        h(
          'div',
          { class: 'group' },
          worst.map((i) => row(i, wearCount(i) ? pluralTimes(wearCount(i)) : 'Не надевал', h('span', { class: 'cell-value' }, money(i.price / Math.max(1, wearCount(i)))))),
        ),
      ),
    );
  }

  // --- купить ---
  const wishEl = h('div', { class: 'group' });
  async function drawWish() {
    const list = await getWishlist();
    const field = h('input', { class: 'cell-input cell-input-left', type: 'text', placeholder: 'Добавить', enterKeyHint: 'done', 'aria-label': 'Что купить' });
    const add = async () => {
      const text = field.value.trim();
      field.value = '';
      if (!text) return;
      list.push({ id: uid(), text, done: false });
      await setWishlist(list);
      await drawWish();
      wishEl.querySelector('.cell-input')?.focus();
    };
    field.addEventListener('keydown', (e) => e.key === 'Enter' && add());
    field.addEventListener('blur', add);
    wishEl.replaceChildren(
      ...list.map((w) =>
        h(
          'div',
          { class: `cell wish ${w.done ? 'is-done' : ''}` },
          h(
            'button',
            {
              class: `round-check ${w.done ? 'is-on' : ''}`,
              'aria-label': w.done ? 'Вернуть в список' : 'Куплено',
              onClick: async () => {
                w.done = !w.done;
                await setWishlist(list);
                drawWish();
              },
            },
            icon('check', 14),
          ),
          h('span', { class: 'wish-text' }, w.text),
          h(
            'button',
            {
              class: 'icon-btn icon-btn-quiet',
              'aria-label': `Удалить: ${w.text}`,
              onClick: async () => {
                await setWishlist(list.filter((x) => x.id !== w.id));
                drawWish();
              },
            },
            icon('close', 16),
          ),
        ),
      ),
      h('div', { class: 'cell' }, h('span', { class: 'plus-mark' }, icon('plus', 18)), field),
    );
  }
  drawWish();
  sections.push(card('Купить', wishEl));

  const gone = state.items.filter((i) => i.goneAt).length;
  if (gone) sections.push(h('p', { class: 'caption center' }, `Ушло из гардероба: ${pluralItems(gone)}`));

  root.replaceChildren(h('div', { class: 'screen screen-list' }, nav, sections));
}
