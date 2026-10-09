// Добавление вещей: камера или пачка фото из галереи, очередь обработки, быстрая правка категорий.
import { h, icon, picture, chips, openSheet, toast } from '../ui.js';
import { addItem, updateItem, deleteItem, itemById, state } from '../store.js';
import { GROUPS, GROUP, plural } from '../catalog.js';
import { processPhoto } from '../pipeline.js';
import { ml } from '../ml.js';

const MODEL_NAMES = { cutout: 'модель вырезания фона', classify: 'модель категорий', cutoutFine: 'точную модель вырезания' };

export function openAdd() {
  // Заранее подтягиваем модели, чтобы первое фото не ждало загрузки.
  ml.warmup().catch(() => {});
  const pick = (files) => {
    const list = [...files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
    if (!list.length) return;
    sheet.close();
    startImport(list);
  };
  const input = (attrs) =>
    h('input', {
      type: 'file',
      accept: 'image/*',
      class: 'visually-hidden',
      ...attrs,
      onChange: (e) => pick(e.target.files),
    });

  const sheet = openSheet({
    title: 'Добавить вещи',
    body: [
      h(
        'div',
        { class: 'add-options' },
        h('label', { class: 'add-option' }, icon('camera', 28), h('b', null, 'Сфотографировать'), h('span', null, 'Одна вещь'), input({ capture: 'environment' })),
        h('label', { class: 'add-option' }, icon('photos', 28), h('b', null, 'Из галереи'), h('span', null, 'Можно сразу много'), input({ multiple: true })),
      ),
      h(
        'ul',
        { class: 'tips' },
        h('li', null, 'Одна вещь на фото, целиком в кадре.'),
        h('li', null, 'Ровный фон, который отличается от вещи по цвету: светлый пол для тёмного, тёмный плед для светлого.'),
        h('li', null, 'Снимай сверху, без своих ног и теней в кадре.'),
      ),
      h('p', { class: 'hint' }, 'Фото обрабатываются на телефоне и никуда не отправляются.'),
    ],
  });
}

function startImport(files) {
  // Превью исходников не показываем: сто больших фото разом телефон не потянет.
  const jobs = files.map((file, i) => ({ file, index: i, status: 'wait', stage: '', itemId: null, error: null }));
  let cancelled = false;
  let finished = false;
  let download = null;
  let wakeLock = null;

  // Не даём экрану погаснуть, пока идёт разбор.
  navigator.wakeLock?.request('screen').then(
    (lock) => {
      wakeLock = lock;
      if (finished || cancelled) lock.release().catch(() => {});
    },
    () => {},
  );
  const releaseWake = () => wakeLock?.release().catch(() => {});

  const offProgress = ml.onProgress((m) => {
    download = m.loaded < m.total ? m : null;
    renderHead();
  });

  const sheet = openSheet({
    title: 'Разбираю фото',
    full: true,
    className: 'sheet-import',
    footer: h('button', { class: 'btn btn-primary btn-wide' }, 'Готово'),
    onClose: () => {
      cancelled = true;
      offProgress();
      releaseWake();
      const saved = jobs.filter((j) => j.itemId && itemById(j.itemId)).length;
      if (saved) toast(`В гардеробе +${saved} ${plural(saved, 'вещь', 'вещи', 'вещей')}`);
    },
  });

  const headEl = h('div', { class: 'import-head' });
  const listEl = h('div', { class: 'import-list' });
  const currentEl = h('div', { class: 'import-current' });
  sheet.setBody(headEl, currentEl, listEl);

  function renderHead() {
    const done = jobs.filter((j) => j.status !== 'wait' && j.status !== 'work').length;
    const total = jobs.length;
    const failed = jobs.filter((j) => j.status === 'error').length;
    sheet.setTitle(finished ? 'Проверь категории' : `Разбираю ${Math.min(done + 1, total)} из ${total}`);
    headEl.replaceChildren(
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': done }, h('i', { style: { width: `${(done / total) * 100}%` } })),
      download
        ? h('p', { class: 'hint' }, `Скачиваю ${MODEL_NAMES[download.name] || 'модель'}: ${Math.round((download.loaded / download.total) * 100)}%. Это нужно один раз.`)
        : finished
          ? h('p', { class: 'hint' }, failed === total ? 'Ни одно фото обработать не получилось.' : 'Категории угаданы автоматически. Поправь, где ошибся, и закрывай.')
          : h('p', { class: 'hint' }, 'Вещи сохраняются по одной. Не закрывай приложение, пока идёт разбор.'),
    );
    const job = jobs.find((j) => j.status === 'work');
    currentEl.replaceChildren(
      ...(job && !finished
        ? [h('p', { class: 'import-stage' }, h('span', { class: 'spinner' }), `${job.stage || 'Обрабатываю'}…`)]
        : []),
    );
    sheet.setFooter(
      h(
        'button',
        { class: `btn btn-wide ${finished ? 'btn-primary' : 'btn-outline'}`, onClick: () => sheet.close() },
        finished ? 'Готово' : 'Остановить и закрыть',
      ),
    );
  }

  function card(job) {
    const el = h('article', { class: `import-card is-${job.status}`, dataset: { index: job.index } });
    const item = job.itemId ? itemById(job.itemId) : null;
    if (job.status === 'done' && item) {
      const group = GROUP[item.group];
      const typeOptions = group.types.map((t) => ({ id: t, name: t }));
      el.append(
        h('div', { class: 'import-thumb' }, picture('thumbs', item.id, { rev: item.rev })),
        h(
          'div',
          { class: 'import-info' },
          !item.cut ? h('p', { class: 'import-warn' }, 'Вещь на фото не нашлась, оставил снимок целиком.') : null,
          chips(
            GROUPS.map((g) => ({ id: g.id, name: g.name })),
            item.group,
            async (v) => {
              await updateItem(item.id, { group: v, type: '' });
              refresh(job);
            },
            { className: 'chips-tight chips-scroll chips-inline' },
          ),
          chips(typeOptions, item.type, (v) => updateItem(item.id, { type: v || '' }), { allowNone: true, className: 'chips-tight chips-sub chips-scroll chips-inline' }),
        ),
        h(
          'button',
          {
            class: 'icon-btn import-remove',
            'aria-label': 'Не добавлять эту вещь',
            onClick: async () => {
              await deleteItem(item.id);
              job.status = 'removed';
              refresh(job);
            },
          },
          icon('trash', 18),
        ),
      );
    } else if (job.status === 'error') {
      el.append(h('div', { class: 'import-info import-wide' }, h('p', { class: 'import-warn' }, `Фото ${job.index + 1} (${job.file.name}) не обработалось: ${job.error}`)));
    }
    return el;
  }

  // В списке только готовые вещи, новые сверху.
  function refresh(job) {
    const old = listEl.querySelector(`[data-index="${job.index}"]`);
    if (job.status === 'removed') {
      if (old) old.remove();
    } else if (job.status === 'done' || job.status === 'error') {
      const fresh = card(job);
      if (old) old.replaceWith(fresh);
      else listEl.prepend(fresh);
    }
    renderHead();
  }

  renderHead();

  (async () => {
    for (const job of jobs) {
      if (cancelled) break;
      job.status = 'work';
      renderHead();
      try {
        const r = await processPhoto(job.file, {
          fine: state.settings.fineCutout,
          onStage: (s) => {
            job.stage = s;
            renderHead();
          },
        });
        if (cancelled) break;
        // Если вещь на фото не нашлась, верим категории только при высокой уверенности.
        const guess = r.guess && (r.cut || r.guess.conf >= 0.8) ? r.guess : { group: 'other', type: '' };
        const item = await addItem(
          { group: guess.group, type: guess.type, color: r.color, cut: r.cut, ratio: r.ratio, guessConf: guess.conf ?? null },
          { full: r.full, thumb: r.thumb, orig: r.orig },
        );
        job.itemId = item.id;
        job.status = 'done';
      } catch (err) {
        console.error(err);
        job.status = 'error';
        job.error = err.message || String(err);
      }
      job.file = { name: job.file.name };
      refresh(job);
      // Даём интерфейсу вздохнуть между фото.
      await new Promise((r) => setTimeout(r, 30));
    }
    finished = true;
    releaseWake();
    if (!cancelled) renderHead();
  })();
}
