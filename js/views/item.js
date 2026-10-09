// Карточка вещи: отметка «надел», решение, свойства, фото.
import { h, icon, picture, chips, openSheet, confirmSheet, toast, forgetPicture } from '../ui.js';
import {
  itemById,
  updateItem,
  deleteItem,
  toggleWear,
  wearCount,
  lastWorn,
  wornOn,
  dayKey,
  humanDay,
  daysBetween,
  imageBlob,
  replaceItemImages,
  subscribe,
} from '../store.js';
import { GROUPS, GROUP, COLORS, SEASONS, DECISIONS, GONE, pluralTimes, pluralDays } from '../catalog.js';
import { processPhoto } from '../pipeline.js';
import { itemTitle } from './wardrobe.js';

function wearLine(item) {
  const n = wearCount(item);
  const since = dayKey(new Date(item.createdAt));
  if (!n) {
    const d = daysBetween(since);
    return d < 1 ? 'Добавлена сегодня, ещё не надевал.' : `Ни разу не надевал за ${pluralDays(d)} в гардеробе.`;
  }
  return `Надевал ${pluralTimes(n)}. Последний раз ${humanDay(lastWorn(item))}.`;
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

  const field = (label, control) => h('div', { class: 'field' }, h('div', { class: 'field-label' }, label), control);

  async function redo(options, doneText) {
    if (busy) return;
    busy = true;
    render();
    try {
      const orig = await imageBlob('origs', id);
      if (!orig) throw new Error('Исходное фото не сохранилось');
      const r = await processPhoto(orig, { ...options, skipOrig: true, skipClassify: true });
      forgetPicture('thumbs', id);
      forgetPicture('fulls', id);
      await replaceItemImages(id, { full: r.full, thumb: r.thumb }, { cut: r.cut, ratio: r.ratio });
      toast(r.cut || options.keepBackground ? doneText : 'Вещь на фото не нашлась, оставил как есть');
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
      onChange: async (e) => {
        const key = e.target.value;
        if (!key || key > dayKey()) return;
        await toggleWear(id, key, true);
        toast(`Отмечено: ${humanDay(key)}`);
      },
    });

    const recent = [...item.wears].reverse().slice(0, 8);

    const wearBlock = h(
      'section',
      { class: 'wear-block' },
      h(
        'button',
        {
          class: `btn btn-big ${today ? 'btn-chalk' : 'btn-primary'}`,
          'aria-pressed': today ? 'true' : 'false',
          onClick: async () => {
            const on = await toggleWear(id);
            if (navigator.vibrate) navigator.vibrate(10);
            toast(on ? 'Отмечено: надел сегодня' : 'Отметка за сегодня снята');
          },
        },
        today ? [icon('check', 20), 'Сегодня надел'] : 'Надел сегодня',
      ),
      h('p', { class: 'wear-line' }, wearLine(item)),
      h(
        'div',
        { class: 'wear-days' },
        recent.map((key) =>
          h(
            'button',
            { class: 'day-chip', title: 'Убрать отметку', 'aria-label': `Убрать отметку за ${humanDay(key)}`, onClick: () => toggleWear(id, key, false) },
            humanDay(key),
            icon('close', 12),
          ),
        ),
        h('label', { class: 'day-chip day-add' }, icon('plus', 12), 'другой день', dateInput),
      ),
    );

    const decisionBlock = h(
      'section',
      { class: 'block' },
      h('h3', null, 'Что с ней делать'),
      chips(DECISIONS, item.decision, (v) => updateItem(id, { decision: v }), { className: 'chips-verdict' }),
      item.decision !== 'keep'
        ? h(
            'button',
            {
              class: 'btn btn-outline btn-wide',
              onClick: async () => {
                await updateItem(id, { goneAt: Date.now() });
                toast(`${GONE[item.decision]}. Вещь убрана из гардероба`, {
                  label: 'Вернуть',
                  run: () => updateItem(id, { goneAt: null }),
                });
                sheet.close();
              },
            },
            { sell: 'Уже продал — убрать из гардероба', give: 'Уже отдал — убрать из гардероба', toss: 'Уже выкинул — убрать из гардероба' }[item.decision],
          )
        : null,
    );

    const typeOptions = group.types.map((t) => ({ id: t, name: t }));
    if (item.type && !group.types.includes(item.type)) typeOptions.unshift({ id: item.type, name: item.type });

    const props = h(
      'section',
      { class: 'block' },
      h('h3', null, 'Свойства'),
      field(
        'Категория',
        chips(
          GROUPS.map((g) => ({ id: g.id, name: g.name })),
          item.group,
          (v) => updateItem(id, { group: v, type: GROUP[v].types.includes(item.type) ? item.type : '' }),
        ),
      ),
      field('Тип', chips(typeOptions, item.type, (v) => updateItem(id, { type: v || '' }), { allowNone: true })),
      field(
        'Цвет',
        chips(
          COLORS.map((c) => ({ id: c.id, name: c.name, swatch: c.hex })),
          item.color,
          (v) => updateItem(id, { color: v }),
          { allowNone: true, className: 'chips-color' },
        ),
      ),
      field('Сезон', chips(SEASONS, item.season, (v) => updateItem(id, { season: v }))),
      h(
        'div',
        { class: 'field-row' },
        field(
          'Название или бренд',
          h('input', {
            class: 'input',
            type: 'text',
            value: item.name || '',
            placeholder: 'Например, Uniqlo оверсайз',
            enterKeyHint: 'done',
            onChange: (e) => updateItem(id, { name: e.target.value.trim() }),
          }),
        ),
        field(
          'Цена',
          h('input', {
            class: 'input',
            type: 'number',
            inputMode: 'decimal',
            min: '0',
            value: item.price ?? '',
            placeholder: '0',
            onChange: (e) => {
              const v = parseFloat(e.target.value);
              updateItem(id, { price: Number.isFinite(v) && v >= 0 ? v : null });
            },
          }),
        ),
      ),
      field(
        'Заметка',
        h('textarea', {
          class: 'input',
          rows: 2,
          value: item.note || '',
          placeholder: 'Размер, где лежит, с чем носить',
          onChange: (e) => updateItem(id, { note: e.target.value.trim() }),
        }),
      ),
    );

    const photoBlock = h(
      'section',
      { class: 'block' },
      h('h3', null, 'Фото'),
      h(
        'div',
        { class: 'btn-col' },
        h('button', { class: 'btn btn-outline', disabled: busy, onClick: () => redo({ fine: true }, 'Вырезано точнее') }, icon('sparkle', 18), busy ? 'Обрабатываю…' : 'Вырезать точнее'),
        item.cut
          ? h('button', { class: 'btn btn-outline', disabled: busy, onClick: () => redo({ keepBackground: true }, 'Фото оставлено с фоном') }, 'Оставить фото с фоном')
          : h('button', { class: 'btn btn-outline', disabled: busy, onClick: () => redo({}, 'Фон убран') }, 'Убрать фон'),
      ),
      h('p', { class: 'hint' }, 'Точное вырезание работает дольше и в первый раз скачивает модель на 86 МБ. Пригодится, когда фон пёстрый.'),
    );

    const danger = h(
      'section',
      { class: 'block' },
      h(
        'button',
        {
          class: 'btn btn-danger-ghost',
          onClick: async () => {
            const ok = await confirmSheet({
              title: 'Удалить вещь?',
              text: 'Фото и вся история носки удалятся. Если вещь продана или выброшена, лучше убрать её через «Что с ней делать» — тогда она останется в статистике.',
              confirm: 'Удалить',
              danger: true,
            });
            if (!ok) return;
            sheet.close();
            await deleteItem(id);
            toast('Вещь удалена');
          },
        },
        icon('trash', 18),
        'Удалить вещь',
      ),
    );

    sheet.setBody(
      h('div', { class: `item-hero ${busy ? 'is-busy' : ''}` }, picture('fulls', id, { rev: item.rev, class: item.cut ? '' : 'is-photo', alt: itemTitle(item) })),
      wearBlock,
      decisionBlock,
      props,
      photoBlock,
      danger,
    );
  }

  let scrollTop = 0;
  const unsubscribe = subscribe((what) => {
    if (what !== 'items') return;
    // Не перерисовываем, пока человек печатает в поле.
    const a = document.activeElement;
    if (a && sheet.el.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.type !== 'date') return;
    scrollTop = sheet.body.scrollTop;
    render();
    sheet.body.scrollTop = scrollTop;
  });
  render();
}
