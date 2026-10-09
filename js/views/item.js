// Карточка вещи: отметка «надел», решение, свойства, фото.
import { h, icon, picture, chips, openSheet, confirmSheet, toast, forgetPicture } from '../ui.js';
import { itemById, updateItem, deleteItem, toggleWear, wearCount, lastWorn, wornOn, dayKey, humanDay, imageBlob, replaceItemImages, subscribe } from '../store.js';
import { GROUPS, GROUP, COLORS, SEASONS, DECISIONS, GONE, pluralTimes } from '../catalog.js';
import { processPhoto } from '../pipeline.js';
import { itemTitle } from './wardrobe.js';

function wearLine(item) {
  const n = wearCount(item);
  return n ? `${pluralTimes(n)}, последний ${humanDay(lastWorn(item))}` : 'Ещё не надевал';
}

export function openItem(id) {
  const first = itemById(id);
  if (!first) return;
  let busy = false;

  const sheet = openSheet({
    title: itemTitle(first),
    full: true,
    className: 'sheet-item',
    onClose: () => unsubscribe(),
  });

  const section = (label, ...nodes) => h('section', { class: 'section' }, label ? h('h3', { class: 'section-title' }, label) : null, nodes);

  async function redo(options) {
    if (busy) return;
    busy = true;
    render();
    try {
      const orig = await imageBlob('origs', id);
      if (!orig) throw new Error('исходное фото не сохранилось');
      const r = await processPhoto(orig, { ...options, skipOrig: true, skipClassify: true });
      forgetPicture('thumbs', id);
      forgetPicture('fulls', id);
      await replaceItemImages(id, { full: r.full, thumb: r.thumb }, { cut: r.cut, ratio: r.ratio });
      if (!r.cut && !options.keepBackground) toast('Вещь на фото не найдена');
    } catch (err) {
      toast(`Не получилось: ${err.message}`);
    } finally {
      busy = false;
      render();
    }
  }

  function render() {
    const item = itemById(id);
    if (!item) return sheet.close();
    sheet.setTitle(itemTitle(item));
    const today = wornOn(item);
    const group = GROUP[item.group] || GROUPS[GROUPS.length - 1];

    const dateInput = h('input', {
      type: 'date',
      class: 'date-input',
      max: dayKey(),
      'aria-label': 'Другой день',
      onChange: (e) => {
        const key = e.target.value;
        if (key && key <= dayKey()) toggleWear(id, key, true);
      },
    });

    const wearBlock = h(
      'section',
      { class: 'section' },
      h(
        'button',
        {
          class: `btn ${today ? 'btn-tinted' : 'btn-fill'}`,
          'aria-pressed': today ? 'true' : 'false',
          onClick: async () => {
            await toggleWear(id);
            if (navigator.vibrate) navigator.vibrate(10);
          },
        },
        today ? icon('check', 20) : null,
        'Надел сегодня',
      ),
      h('p', { class: 'caption center' }, wearLine(item)),
      h(
        'div',
        { class: 'days' },
        [...item.wears]
          .reverse()
          .slice(0, 6)
          .map((key) => h('button', { class: 'day', 'aria-label': `Убрать отметку: ${humanDay(key)}`, onClick: () => toggleWear(id, key, false) }, humanDay(key), icon('close', 11))),
        h('label', { class: 'day day-add' }, icon('plus', 12), 'Дата', dateInput),
      ),
    );

    const typeOptions = group.types.map((t) => ({ id: t, name: t }));
    if (item.type && !group.types.includes(item.type)) typeOptions.unshift({ id: item.type, name: item.type });

    const input = (attrs) => h('input', { class: 'cell-input', ...attrs });

    sheet.setBody(
      h('div', { class: `hero ${busy ? 'is-busy' : ''}` }, picture('fulls', id, { rev: item.rev, class: item.cut ? '' : 'is-photo', alt: itemTitle(item) })),
      wearBlock,
      section(
        'Решение',
        chips(DECISIONS, item.decision, (v) => updateItem(id, { decision: v }), { className: 'segmented' }),
        item.decision !== 'keep'
          ? h(
              'div',
              { class: 'group' },
              h(
                'button',
                {
                  class: 'cell cell-action',
                  onClick: async () => {
                    await updateItem(id, { goneAt: Date.now() });
                    toast(GONE[item.decision], { label: 'Вернуть', run: () => updateItem(id, { goneAt: null }) });
                    sheet.close();
                  },
                },
                { sell: 'Продано, убрать из гардероба', give: 'Отдано, убрать из гардероба', toss: 'Выкинуто, убрать из гардероба' }[item.decision],
              ),
            )
          : null,
      ),
      section(
        'Категория',
        chips(
          GROUPS.map((g) => ({ id: g.id, name: g.name })),
          item.group,
          (v) => updateItem(id, { group: v, type: GROUP[v].types.includes(item.type) ? item.type : '' }),
        ),
      ),
      section('Тип', chips(typeOptions, item.type, (v) => updateItem(id, { type: v || '' }), { allowNone: true })),
      section(
        'Цвет',
        chips(
          COLORS.map((c) => ({ id: c.id, name: c.name, swatch: c.hex, hideName: true })),
          item.color,
          (v) => updateItem(id, { color: v }),
          { allowNone: true, className: 'swatches' },
        ),
      ),
      section('Сезон', chips(SEASONS, item.season, (v) => updateItem(id, { season: v }), { className: 'segmented' })),
      section(
        null,
        h(
          'div',
          { class: 'group' },
          h('label', { class: 'cell' }, h('span', null, 'Название'), input({ type: 'text', value: item.name || '', enterKeyHint: 'done', onChange: (e) => updateItem(id, { name: e.target.value.trim() }) })),
          h(
            'label',
            { class: 'cell' },
            h('span', null, 'Цена'),
            input({
              type: 'number',
              inputMode: 'decimal',
              min: '0',
              value: item.price ?? '',
              onChange: (e) => {
                const v = parseFloat(e.target.value);
                updateItem(id, { price: Number.isFinite(v) && v >= 0 ? v : null });
              },
            }),
          ),
          h('label', { class: 'cell' }, h('span', null, 'Заметка'), input({ type: 'text', value: item.note || '', enterKeyHint: 'done', onChange: (e) => updateItem(id, { note: e.target.value.trim() }) })),
        ),
      ),
      section(
        null,
        h(
          'div',
          { class: 'group' },
          h('button', { class: 'cell cell-action', disabled: busy, onClick: () => redo({ fine: true }) }, busy ? 'Обработка…' : 'Вырезать точнее'),
          item.cut
            ? h('button', { class: 'cell cell-action', disabled: busy, onClick: () => redo({ keepBackground: true }) }, 'Вернуть фон')
            : h('button', { class: 'cell cell-action', disabled: busy, onClick: () => redo({}) }, 'Убрать фон'),
        ),
      ),
      section(
        null,
        h(
          'div',
          { class: 'group' },
          h(
            'button',
            {
              class: 'cell cell-action cell-danger',
              onClick: async () => {
                if (!(await confirmSheet({ title: 'Удалить вещь?', text: 'Фото и история носки удалятся.', confirm: 'Удалить', danger: true }))) return;
                sheet.close();
                await deleteItem(id);
              },
            },
            'Удалить',
          ),
        ),
      ),
    );
  }

  const unsubscribe = subscribe((what) => {
    if (what !== 'items') return;
    // Не перерисовываем, пока человек печатает в поле.
    const a = document.activeElement;
    if (a && sheet.el.contains(a) && a.tagName === 'INPUT' && a.type !== 'date') return;
    const top = sheet.body.scrollTop;
    render();
    sheet.body.scrollTop = top;
  });
  render();
}
