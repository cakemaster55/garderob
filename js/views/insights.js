// Экран «Разбор»: что носится, что лежит, что продать, отдать, выкинуть и купить.
import { h, icon, picture, chips, toast, money } from '../ui.js';
import { state, activeItems, wearCount, idleDays, daysBetween, updateItem, getWishlist, setWishlist, dayKey } from '../store.js';
import { GROUPS, GROUP, COLOR, COLORS, DECISIONS, GONE, plural, pluralItems, pluralTimes, pluralDays } from '../catalog.js';
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

function row(item, text, actions) {
  return h(
    'div',
    { class: 'row' },
    h('button', { class: 'row-main', onClick: () => openItem(item.id) }, h('span', { class: 'row-thumb' }, picture('thumbs', item.id, { rev: item.rev })), h('span', { class: 'row-text' }, h('b', null, itemTitle(item)), h('span', null, text))),
    actions ? h('div', { class: 'row-actions' }, actions) : null,
  );
}

function buyHints(items, period) {
  const hints = [];
  const by = {};
  for (const g of GROUPS) by[g.id] = items.filter((i) => i.group === g.id);
  const tops = by.top.length;
  const bottoms = by.bottom.length;
  if (bottoms >= 1 && tops >= bottoms * 4 && tops >= 8) {
    hints.push(`На ${tops} ${plural(tops, 'верх', 'верха', 'верхов')} приходится ${bottoms} ${plural(bottoms, 'низ', 'низа', 'низов')}. Сочетать особо не с чем — скорее не хватает низа.`);
  }
  for (const id of ['top', 'bottom', 'shoes', 'outer']) {
    const list = by[id];
    if (!list.length) continue;
    const wears = list.reduce((s, i) => s + wearsIn(i, period), 0);
    const perItem = wears / list.length;
    const weeks = period / 7;
    if (list.length <= 3 && perItem >= weeks * 1.2) {
      hints.push(`${GROUP[id].name}: всего ${pluralItems(list.length)}, и каждую носишь чаще раза в неделю. Здесь запас пригодится.`);
    }
    const unused = list.filter((i) => fadeLevel(i) === 2).length;
    if (list.length >= 6 && unused / list.length >= 0.5) {
      hints.push(`${GROUP[id].name}: из ${list.length} ${plural(list.length, 'вещи', 'вещей', 'вещей')} половина и больше лежит без дела. Новое сюда покупать рано.`);
    }
  }
  return hints;
}

export function renderInsights(root) {
  const items = activeItems();
  const gone = state.items.filter((i) => i.goneAt);
  const head = h('header', { class: 'screen-head' }, h('div', null, h('h1', null, 'Разбор')));

  if (!items.length && !gone.length) {
    root.replaceChildren(
      h(
        'div',
        { class: 'screen' },
        head,
        h(
          'div',
          { class: 'empty' },
          h('div', { class: 'empty-art' }, icon('chart', 72)),
          h('h2', null, 'Разбирать пока нечего'),
          h('p', null, 'Добавь вещи и отмечай, что надеваешь. Через пару недель здесь будет видно, чем ты правда пользуешься.'),
        ),
      ),
    );
    return;
  }

  const period = view.period;
  const totalWears = items.reduce((s, i) => s + wearCount(i), 0);
  const worn = items.filter((i) => wearsIn(i, period) > 0);
  const share = items.length ? Math.round((worn.length / items.length) * 100) : 0;
  const firstDay = items.length ? Math.max(...items.map((i) => daysBetween(dayKey(new Date(i.createdAt))))) : 0;

  const sections = [];

  // --- главная цифра ---
  if (!totalWears) {
    sections.push(
      h(
        'section',
        { class: 'lead' },
        h('p', { class: 'lead-text' }, `В гардеробе ${pluralItems(items.length)}. Отметок «надел» пока нет.`),
        h('p', { class: 'hint' }, 'Каждый день нажимай «Что на мне сегодня» в гардеробе и отмечай вещи. Через пару недель станет видно, что носится, а что занимает место.'),
      ),
    );
  } else {
    sections.push(
      h(
        'section',
        { class: 'lead' },
        chips(PERIODS, period, (v) => {
          view.period = v;
          renderInsights(root);
        }),
        h('p', { class: 'lead-text' }, `Из ${items.length} ${plural(items.length, 'вещи', 'вещей', 'вещей')} ты надевал ${worn.length}.`),
        h('div', { class: 'meter', role: 'img', 'aria-label': `Носишь ${share}% гардероба` }, h('i', { style: { width: `${share}%` } })),
        h('p', { class: 'hint' }, `Это ${share}% гардероба за ${PERIODS.find((p) => p.id === period).name.replace('3 месяца', 'три месяца').replace('Год', 'год')}.${firstDay < period ? ` Учёт идёт ${pluralDays(Math.max(1, firstDay))}, картина ещё уточнится.` : ''}`),
      ),
    );
  }

  // --- любимые ---
  const top = [...items].filter((i) => wearsIn(i, period) > 0).sort((a, b) => wearsIn(b, period) - wearsIn(a, period)).slice(0, 8);
  if (top.length) {
    sections.push(
      h(
        'section',
        { class: 'block' },
        h('h2', null, 'На чём держится гардероб'),
        h(
          'div',
          { class: 'strip' },
          top.map((i) => h('button', { class: 'strip-item', onClick: () => openItem(i.id) }, picture('thumbs', i.id, { rev: i.rev }), h('span', { class: 'wear-tag' }, String(wearsIn(i, period))))),
        ),
      ),
    );
  }

  // --- без дела ---
  const idle = items.filter((i) => i.decision === 'keep' && fadeLevel(i) >= 1).sort((a, b) => idleDays(b) - idleDays(a));
  if (idle.length) {
    const shown = view.showAllIdle ? idle : idle.slice(0, 5);
    const idleValue = idle.reduce((s, i) => s + (i.price || 0), 0);
    sections.push(
      h(
        'section',
        { class: 'block' },
        h('h2', null, 'Лежит без дела'),
        h('p', { class: 'hint' }, `${pluralItems(idle.length)} не надевал полтора месяца и дольше${idleValue ? `, это ${money(idleValue)} по ценам покупки` : ''}. Реши судьбу каждой.`),
        shown.map((i) =>
          row(
            i,
            i.wears.length ? `не надевал ${pluralDays(idleDays(i))}` : `ни разу за ${pluralDays(idleDays(i))}`,
            ['sell', 'give', 'toss'].map((d) =>
              h(
                'button',
                {
                  class: `mini mini-${d}`,
                  onClick: async () => {
                    await updateItem(i.id, { decision: d });
                    toast(`${itemTitle(i)}: ${DECISIONS.find((x) => x.id === d).name.toLowerCase()}`, { label: 'Отменить', run: () => updateItem(i.id, { decision: 'keep' }) });
                  },
                },
                DECISIONS.find((x) => x.id === d).name,
              ),
            ),
          ),
        ),
        idle.length > shown.length
          ? h(
              'button',
              {
                class: 'btn btn-ghost btn-wide',
                onClick: () => {
                  view.showAllIdle = true;
                  renderInsights(root);
                },
              },
              `Показать все ${idle.length}`,
            )
          : null,
      ),
    );
  }

  // --- решения ---
  const verdicts = ['sell', 'give', 'toss'].map((d) => ({ d, list: items.filter((i) => i.decision === d) })).filter((v) => v.list.length);
  if (verdicts.length) {
    sections.push(
      h(
        'section',
        { class: 'block' },
        h('h2', null, 'На выход'),
        verdicts.map(({ d, list }) => {
          const sum = list.reduce((s, i) => s + (i.price || 0), 0);
          return h(
            'div',
            { class: 'verdict-group' },
            h('h3', null, h('i', { class: `dot dot-${d}` }), `${DECISIONS.find((x) => x.id === d).name}: ${list.length}`, d === 'sell' && sum ? h('span', { class: 'muted' }, `покупал за ${money(sum)}`) : null),
            list.map((i) =>
              row(i, wearCount(i) ? `надевал ${pluralTimes(wearCount(i))}` : 'ни разу не надевал', [
                h(
                  'button',
                  {
                    class: 'mini',
                    onClick: async () => {
                      await updateItem(i.id, { goneAt: Date.now() });
                      toast(`${GONE[d]}. Убрано из гардероба`, { label: 'Вернуть', run: () => updateItem(i.id, { goneAt: null }) });
                    },
                  },
                  { sell: 'Продал', give: 'Отдал', toss: 'Выкинул' }[d],
                ),
                h('button', { class: 'mini mini-quiet', onClick: () => updateItem(i.id, { decision: 'keep' }) }, 'Оставлю'),
              ]),
            ),
          );
        }),
      ),
    );
  }

  // --- категории ---
  const groups = GROUPS.map((g) => {
    const list = items.filter((i) => i.group === g.id);
    return { g, count: list.length, worn: list.filter((i) => wearsIn(i, period) > 0).length };
  }).filter((x) => x.count);
  if (groups.length) {
    const max = Math.max(...groups.map((x) => x.count));
    sections.push(
      h(
        'section',
        { class: 'block' },
        h('h2', null, 'По категориям'),
        h(
          'div',
          { class: 'bars' },
          groups.map(({ g, count, worn: w }) =>
            h(
              'div',
              { class: 'bar-row' },
              h('div', { class: 'bar-label' }, h('b', null, g.name), h('span', null, totalWears ? `носишь ${w} из ${count}` : pluralItems(count))),
              h('div', { class: 'bar', style: { width: `${Math.max(6, (count / max) * 100)}%` } }, h('i', { style: { width: `${count ? (w / count) * 100 : 0}%` } })),
            ),
          ),
        ),
        totalWears ? h('p', { class: 'legend' }, h('i', { class: 'key key-on' }), 'надевал', h('i', { class: 'key key-off' }), 'не надевал') : null,
      ),
    );
  }

  // --- цвета ---
  const colorCounts = {};
  for (const i of items) if (i.color) colorCounts[i.color] = (colorCounts[i.color] || 0) + 1;
  const colorList = COLORS.filter((c) => colorCounts[c.id]).sort((a, b) => colorCounts[b.id] - colorCounts[a.id]);
  if (colorList.length > 1) {
    const total = colorList.reduce((s, c) => s + colorCounts[c.id], 0);
    sections.push(
      h(
        'section',
        { class: 'block' },
        h('h2', null, 'Цвета'),
        h('div', { class: 'palette', role: 'img', 'aria-label': 'Доли цветов в гардеробе' }, colorList.map((c) => h('i', { style: { background: c.hex, flexGrow: colorCounts[c.id] }, title: c.name }))),
        h(
          'div',
          { class: 'palette-legend' },
          colorList.slice(0, 6).map((c) => h('span', null, h('i', { class: 'swatch', style: { background: c.hex } }), `${c.name} ${Math.round((colorCounts[c.id] / total) * 100)}%`)),
        ),
      ),
    );
  }

  // --- цена за выход ---
  const priced = items.filter((i) => i.price > 0);
  if (priced.length) {
    const value = priced.reduce((s, i) => s + i.price, 0);
    const worst = [...priced].sort((a, b) => b.price / Math.max(1, wearCount(b)) - a.price / Math.max(1, wearCount(a))).slice(0, 5);
    sections.push(
      h(
        'section',
        { class: 'block' },
        h('h2', null, 'Цена одного выхода'),
        h('p', { class: 'hint' }, `Цена указана у ${priced.length} из ${items.length} ${plural(items.length, 'вещи', 'вещей', 'вещей')}, вместе они стоили ${money(value)}. Чем реже носишь, тем дороже каждый выход.`),
        worst.map((i) => row(i, wearCount(i) ? `${money(i.price / wearCount(i))} за выход, надевал ${pluralTimes(wearCount(i))}` : `${money(i.price)} и ни одного выхода`)),
      ),
    );
  }

  // --- купить ---
  const hints = totalWears ? buyHints(items, period) : [];
  const wishEl = h('div', { class: 'wish' });
  const wishInput = h('input', { class: 'input', type: 'text', placeholder: 'Например, чёрные джинсы', enterKeyHint: 'done', 'aria-label': 'Что купить' });
  async function drawWish() {
    const list = await getWishlist();
    wishEl.replaceChildren(
      ...list.map((w) =>
        h(
          'div',
          { class: `wish-row ${w.done ? 'is-done' : ''}` },
          h(
            'label',
            null,
            h('input', {
              type: 'checkbox',
              checked: w.done,
              onChange: async (e) => {
                w.done = e.target.checked;
                await setWishlist(list);
                drawWish();
              },
            }),
            h('span', null, w.text),
          ),
          h(
            'button',
            {
              class: 'icon-btn',
              'aria-label': `Убрать из списка: ${w.text}`,
              onClick: async () => {
                await setWishlist(list.filter((x) => x.id !== w.id));
                drawWish();
              },
            },
            icon('close', 16),
          ),
        ),
      ),
    );
  }
  const addWish = async () => {
    const text = wishInput.value.trim();
    if (!text) return;
    const list = await getWishlist();
    list.push({ id: uid(), text, done: false });
    await setWishlist(list);
    wishInput.value = '';
    drawWish();
  };
  wishInput.addEventListener('keydown', (e) => e.key === 'Enter' && addWish());
  drawWish();
  sections.push(
    h(
      'section',
      { class: 'block' },
      h('h2', null, 'Купить'),
      hints.length ? h('ul', { class: 'tips' }, hints.map((t) => h('li', null, t))) : null,
      wishEl,
      h('div', { class: 'wish-add' }, wishInput, h('button', { class: 'btn btn-outline btn-small', onClick: addWish }, 'Добавить')),
    ),
  );

  // --- архив ---
  if (gone.length) {
    const by = {};
    for (const i of gone) by[i.decision] = (by[i.decision] || 0) + 1;
    sections.push(
      h(
        'section',
        { class: 'block' },
        h('h2', null, 'Уже ушло'),
        h(
          'p',
          { class: 'hint' },
          `Из гардероба убрано ${pluralItems(gone.length)}: ` +
            Object.entries(by)
              .map(([d, n]) => `${GONE[d].toLowerCase()} ${n}`)
              .join(', ') +
            '. Вернуть можно в разделе «Ещё».',
        ),
      ),
    );
  }

  root.replaceChildren(h('div', { class: 'screen screen-insights' }, head, sections));
}
