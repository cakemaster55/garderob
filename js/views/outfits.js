// Экран «Образы»: сохранённые сочетания, случайный образ, вход в конструктор.
import { h, icon, picture } from '../ui.js';
import { state, activeItems, wearOutfit, dayKey } from '../store.js';
import { pluralTimes } from '../catalog.js';
import { openBuilder } from './builder.js';
import { addControl } from './add.js';

export function renderOutfits(root) {
  const items = activeItems();
  const outfits = state.outfits;

  const nav = h(
    'header',
    { class: 'nav' },
    h('h1', { class: 'large-title' }, 'Образы'),
    items.length
      ? h(
          'div',
          { class: 'nav-actions' },
          h('button', { class: 'icon-btn', 'aria-label': 'Случайный образ', title: 'Случайный образ', onClick: () => openBuilder(null, { shuffle: true }) }, icon('shuffle', 24)),
          h('button', { class: 'icon-btn', 'aria-label': 'Новый образ', title: 'Новый образ', onClick: () => openBuilder() }, icon('plus', 26)),
        )
      : null,
  );

  if (!items.length) {
    root.replaceChildren(h('div', { class: 'screen' }, nav, h('div', { class: 'empty' }, h('div', { class: 'empty-art' }, icon('looks', 56)), h('h2', null, 'Нет вещей'), addControl('Добавить фото', 'btn btn-fill'))));
    return;
  }

  if (!outfits.length) {
    root.replaceChildren(
      h(
        'div',
        { class: 'screen' },
        nav,
        h(
          'div',
          { class: 'empty' },
          h('div', { class: 'empty-art' }, icon('looks', 56)),
          h('h2', null, 'Нет образов'),
          h('button', { class: 'btn btn-fill', onClick: () => openBuilder() }, 'Собрать'),
          h('button', { class: 'btn btn-tinted', onClick: () => openBuilder(null, { shuffle: true }) }, icon('shuffle', 20), 'Случайный'),
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
      nav,
      h(
        'div',
        { class: 'looks' },
        outfits.map((o) => {
          const worn = o.wears.includes(today);
          return h(
            'article',
            { class: 'look' },
            h('button', { class: 'look-board', 'aria-label': `Открыть: ${o.name || 'образ'}`, onClick: () => openBuilder(o.id) }, picture('previews', o.id, { rev: o.rev })),
            h(
              'div',
              { class: 'look-row' },
              h('div', { class: 'look-meta' }, h('b', null, o.name || 'Образ'), o.wears.length ? h('span', null, pluralTimes(o.wears.length)) : null),
              h(
                'button',
                {
                  class: `round-check ${worn ? 'is-on' : ''}`,
                  disabled: worn || !o.layers.length,
                  'aria-label': worn ? 'Сегодня надет' : 'Надел сегодня',
                  title: 'Надел сегодня',
                  onClick: () => wearOutfit(o.id),
                },
                icon('check', 16),
              ),
            ),
          );
        }),
      ),
    ),
  );
}
