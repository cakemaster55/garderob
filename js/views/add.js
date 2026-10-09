// Добавление вещей: системное меню (камера или галерея), очередь обработки, правка категорий.
import { h, icon, picture, chips, openSheet } from '../ui.js';
import { addItem, updateItem, deleteItem, itemById, state } from '../store.js';
import { GROUPS, GROUP } from '../catalog.js';
import { processPhoto } from '../pipeline.js';
import { ml } from '../ml.js';

// Кнопка-обёртка над выбором файлов: на айфоне открывает меню «Медиатека / Снять фото / Файлы».
export function addControl(content, className) {
  return h(
    'label',
    {
      class: className,
      'aria-label': 'Добавить вещи',
      title: 'Добавить вещи',
      // Модели начинают загружаться, пока человек выбирает фото.
      onPointerdown: () => ml.warmup().catch(() => {}),
    },
    content,
    h('input', {
      type: 'file',
      accept: 'image/*',
      multiple: true,
      class: 'visually-hidden',
      onChange: (e) => {
        const files = [...e.target.files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
        e.target.value = '';
        if (files.length) startImport(files);
      },
    }),
  );
}

function startImport(files) {
  // Превью исходников не показываем: сто больших фото разом телефон не потянет.
  const jobs = files.map((file, i) => ({ file, index: i, status: 'wait', itemId: null, error: null }));
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
    title: '',
    full: true,
    className: 'sheet-import',
    done: 'Стоп',
    onClose: () => {
      cancelled = true;
      offProgress();
      releaseWake();
    },
  });
  const doneBtn = sheet.el.querySelector('.sheet-right .text-btn');

  const headEl = h('div', { class: 'import-head' });
  const listEl = h('div', { class: 'import-list' });
  sheet.setBody(headEl, listEl);

  function renderHead() {
    const done = jobs.filter((j) => j.status !== 'wait' && j.status !== 'work').length;
    const total = jobs.length;
    sheet.setTitle(finished ? 'Новые вещи' : `${Math.min(done + 1, total)} из ${total}`);
    doneBtn.textContent = finished ? 'Готово' : 'Стоп';
    headEl.replaceChildren(
      ...(finished
        ? []
        : [
            h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': done }, h('i', { style: { width: `${(done / total) * 100}%` } })),
            download ? h('p', { class: 'caption' }, `Загрузка модели ${Math.round((download.loaded / download.total) * 100)}%`) : null,
          ].filter(Boolean)),
    );
  }

  function card(job) {
    const el = h('article', { class: `import-card is-${job.status}`, dataset: { index: job.index } });
    const item = job.itemId ? itemById(job.itemId) : null;
    if (job.status === 'done' && item) {
      const typeOptions = GROUP[item.group].types.map((t) => ({ id: t, name: t }));
      el.append(
        h('div', { class: 'import-thumb' }, picture('thumbs', item.id, { rev: item.rev })),
        h(
          'div',
          { class: 'import-info' },
          chips(
            GROUPS.map((g) => ({ id: g.id, name: g.name })),
            item.group,
            async (v) => {
              await updateItem(item.id, { group: v, type: '' });
              refresh(job);
            },
            { className: 'chips-small chips-scroll chips-inline' },
          ),
          chips(typeOptions, item.type, (v) => updateItem(item.id, { type: v || '' }), { allowNone: true, className: 'chips-small chips-scroll chips-inline' }),
        ),
        h(
          'button',
          {
            class: 'icon-btn icon-btn-quiet',
            'aria-label': 'Не добавлять',
            onClick: async () => {
              await deleteItem(item.id);
              job.status = 'removed';
              refresh(job);
            },
          },
          icon('trash', 20),
        ),
      );
    } else if (job.status === 'error') {
      el.append(h('p', { class: 'import-error' }, `${job.file.name}: ${job.error}`));
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
    if (finished && !listEl.children.length) sheet.close();
  }

  renderHead();

  (async () => {
    for (const job of jobs) {
      if (cancelled) break;
      job.status = 'work';
      renderHead();
      try {
        const r = await processPhoto(job.file, { fine: state.settings.fineCutout });
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
