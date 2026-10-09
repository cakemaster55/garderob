// Экран «Образы»: сохранённые сочетания и вход в конструктор.
import { h, icon, picture, toast } from '../ui.js';
import { state, activeItems, wearOutfit, dayKey, humanDay } from '../store.js';
import { pluralTimes } from '../catalog.js';
import { openBuilder } from './builder.js';

export function renderOutfits(root) {
  const items = activeItems();
  const outfits = state.outfits;

  const head = h(
    'header',
    { class: 'screen-head' },
    h('div', null, h('h1', null, 'Образы'), outfits.length ? h('p', { class: 'screen-sub' }, `Собрано: ${outfits.length}`) : null),
    items.length ? h('button', { class: 'btn btn-primary btn-small', onClick: () => openBuilder() }, icon('plus', 16), 'Собрать') : null,
  );

  if (!items.length) {
    root.replaceChildren(
      h(
        'div',
        { class: 'screen' },
        head,
        h(
          'div',
          { class: 'empty' },
          h('div', { class: 'empty-art' }, icon('looks', 72)),
          h('h2', null, 'Сначала нужны вещи'),
          h('p', null, 'Добавь в гардероб хотя бы пару вещей — и собирай из них образы, перетаскивая на полотно.'),
        ),
      ),
    );
    return;
  }

  if (!outfits.length) {
    root.replaceChildren(
      h(
        'div',
        { class: 'screen' },
        head,
        h(
          'div',
          { class: 'empty' },
          h('div', { class: 'empty-art' }, icon('looks', 72)),
          h('h2', null, 'Собери первый образ'),
          h('p', null, 'Внизу будет лента твоих вещей. Тяни вещь вверх на полотно, двигай, меняй размер двумя пальцами.'),
          h('button', { class: 'btn btn-primary btn-big', onClick: () => openBuilder() }, 'Открыть конструктор'),
        ),
      ),
    );
    return;
  }

  const today = dayKey();
  root.replaceChildren(
    h(
      'div',
      { class: 'screen' },
      head,
      h(
        'div',
        { class: 'looks' },
        outfits.map((o) => {
          const wornToday = o.wears.includes(today);
          const last = o.wears[o.wears.length - 1];
          return h(
            'article',
            { class: 'look' },
            h(
              'button',
              { class: 'look-board', 'aria-label': `Открыть образ ${o.name || ''}`, onClick: () => openBuilder(o.id) },
              picture('previews', o.id, { rev: o.rev }),
              o.stale ? h('span', { class: 'look-stale' }, 'часть вещей удалена') : null,
            ),
            h(
              'div',
              { class: 'look-meta' },
              h('b', null, o.name || 'Без названия'),
              h('span', null, o.wears.length ? `${pluralTimes(o.wears.length)}, ${humanDay(last)}` : 'ещё не надевал'),
            ),
            h(
              'button',
              {
                class: `btn btn-small btn-wide ${wornToday ? 'btn-chalk' : 'btn-outline'}`,
                disabled: wornToday || !o.layers.length,
                onClick: async () => {
                  await wearOutfit(o.id);
                  toast(`Отмечено: надел сегодня, вещей: ${o.layers.length}`);
                },
              },
              wornToday ? [icon('check', 16), 'Сегодня надел'] : 'Надел сегодня',
            ),
          );
        }),
      ),
    ),
  );
}
