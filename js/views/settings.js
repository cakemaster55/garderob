// Экран «Ещё»: установка, резервная копия, вид, архив, данные.
import { h, icon, picture, toast, confirmSheet, openSheet } from '../ui.js';
import { state, saveSettings, updateItem, deleteItem, load, emit, getWishlist } from '../store.js';
import { db, IMAGE_STORES } from '../db.js';
import { GONE, pluralItems } from '../catalog.js';
import { itemTitle } from './wardrobe.js';

const MAGIC = 'GARDEROB1\n';
export const APP_VERSION = '1.0.0';

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function fmtSize(bytes) {
  if (!bytes) return '0 МБ';
  const mb = bytes / 1048576;
  return mb < 10 ? `${mb.toFixed(1).replace('.', ',')} МБ` : `${Math.round(mb)} МБ`;
}

// Копия — один файл: заголовок с данными и подряд все картинки.
export async function buildBackup() {
  const images = [];
  const parts = [];
  for (const store of IMAGE_STORES) {
    for (const rec of await db.all(store)) {
      images.push({ store, id: rec.id, type: rec.type, size: rec.buf.byteLength });
      parts.push(rec.buf);
    }
  }
  const header = JSON.stringify({
    app: 'garderob',
    version: 1,
    savedAt: new Date().toISOString(),
    items: state.items,
    outfits: state.outfits,
    wishlist: await getWishlist(),
    settings: state.settings,
    images,
  });
  const headerBytes = new TextEncoder().encode(header);
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, headerBytes.length, true);
  return new Blob([MAGIC, len, headerBytes, ...parts], { type: 'application/octet-stream' });
}

export async function restoreBackup(file) {
  const magicLen = new TextEncoder().encode(MAGIC).length;
  const headBuf = await file.slice(0, magicLen + 4).arrayBuffer();
  if (new TextDecoder().decode(headBuf.slice(0, magicLen)) !== MAGIC) throw new Error('Это не файл копии гардероба');
  const headerLen = new DataView(headBuf).getUint32(magicLen, true);
  const headerStart = magicLen + 4;
  const header = JSON.parse(new TextDecoder().decode(await file.slice(headerStart, headerStart + headerLen).arrayBuffer()));
  if (header.app !== 'garderob' || !Array.isArray(header.items)) throw new Error('Файл копии повреждён');
  const expected = headerStart + headerLen + header.images.reduce((s, i) => s + i.size, 0);
  if (file.size < expected) throw new Error('Файл копии обрезан');

  await db.clearAll();
  let offset = headerStart + headerLen;
  let batch = [];
  for (const im of header.images) {
    const buf = await file.slice(offset, offset + im.size).arrayBuffer();
    offset += im.size;
    if (!IMAGE_STORES.includes(im.store)) continue;
    batch.push([im.store, 'put', { id: im.id, type: im.type, buf }]);
    if (batch.length >= 20) {
      await db.batch(batch);
      batch = [];
    }
  }
  if (batch.length) await db.batch(batch);
  const ops = [];
  for (const it of header.items) ops.push(['items', 'put', it]);
  for (const o of header.outfits || []) ops.push(['outfits', 'put', o]);
  if (ops.length) await db.batch(ops);
  await db.kvSet('wishlist', header.wishlist || []);
  await db.kvSet('settings', header.settings || {});
  return { items: header.items.length, outfits: (header.outfits || []).length };
}

async function exportBackup(btn) {
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'Собираю копию…';
  try {
    const blob = await buildBackup();
    const name = `garderob-${new Date().toISOString().slice(0, 10)}.garderob`;
    const file = new File([blob], name, { type: 'application/octet-stream' });
    let shared = false;
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Копия гардероба' });
        shared = true;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    if (!shared) {
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    await db.kvSet('lastBackup', Date.now());
    toast(`Копия готова: ${fmtSize(blob.size)}`);
  } catch (err) {
    console.error(err);
    toast(`Не получилось сделать копию: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

function openArchive() {
  const sheet = openSheet({ title: 'Ушедшие вещи', full: true });
  const draw = () => {
    const gone = state.items.filter((i) => i.goneAt).sort((a, b) => b.goneAt - a.goneAt);
    if (!gone.length) return sheet.close();
    sheet.setBody(
      h('p', { class: 'hint' }, 'Эти вещи убраны из гардероба, но остаются в истории.'),
      gone.map((i) =>
        h(
          'div',
          { class: 'row' },
          h('div', { class: 'row-main' }, h('span', { class: 'row-thumb' }, picture('thumbs', i.id, { rev: i.rev })), h('span', { class: 'row-text' }, h('b', null, itemTitle(i)), h('span', null, `${GONE[i.decision]} ${new Date(i.goneAt).toLocaleDateString('ru-RU')}`))),
          h(
            'div',
            { class: 'row-actions' },
            h(
              'button',
              {
                class: 'mini',
                onClick: async () => {
                  await updateItem(i.id, { goneAt: null, decision: 'keep' });
                  draw();
                },
              },
              'Вернуть',
            ),
            h(
              'button',
              {
                class: 'mini mini-quiet',
                onClick: async () => {
                  await deleteItem(i.id);
                  draw();
                },
              },
              'Удалить совсем',
            ),
          ),
        ),
      ),
    );
  };
  draw();
}

export function renderSettings(root) {
  const goneCount = state.items.filter((i) => i.goneAt).length;
  const storageLine = h('p', { class: 'hint' }, 'Считаю место…');
  const backupLine = h('p', { class: 'hint' });

  (async () => {
    let text = `${pluralItems(state.items.length)}, образов: ${state.outfits.length}.`;
    try {
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        text += ` Занято на устройстве около ${fmtSize(est.usage)}.`;
      }
      if (navigator.storage?.persisted && !(await navigator.storage.persisted()) && navigator.storage.persist) {
        await navigator.storage.persist();
      }
    } catch {}
    storageLine.textContent = text;
    const last = await db.kvGet('lastBackup');
    backupLine.textContent = last ? `Последняя копия: ${new Date(last).toLocaleDateString('ru-RU')}.` : 'Копий ещё не было.';
  })();

  const restoreInput = h('input', {
    type: 'file',
    class: 'visually-hidden',
    onChange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const ok = await confirmSheet({
        title: 'Восстановить из копии?',
        text: 'Всё, что сейчас есть в приложении, заменится содержимым файла.',
        confirm: 'Восстановить',
        danger: state.items.length > 0,
      });
      if (!ok) return;
      try {
        const r = await restoreBackup(file);
        toast(`Восстановлено: ${pluralItems(r.items)}`);
        setTimeout(() => location.reload(), 900);
      } catch (err) {
        console.error(err);
        toast(`Не получилось восстановить: ${err.message}`);
        await load();
        emit('items');
      }
    },
  });

  const toggle = (label, hint, key) =>
    h(
      'label',
      { class: 'switch-row' },
      h('span', null, h('b', null, label), h('span', { class: 'hint' }, hint)),
      h('input', { type: 'checkbox', class: 'switch', checked: !!state.settings[key], onChange: (e) => saveSettings({ [key]: e.target.checked }) }),
    );

  const exportBtn = h('button', { class: 'btn btn-primary', onClick: (e) => exportBackup(e.currentTarget) }, 'Сохранить копию');

  root.replaceChildren(
    h(
      'div',
      { class: 'screen screen-settings' },
      h('header', { class: 'screen-head' }, h('div', null, h('h1', null, 'Ещё'))),
      !isStandalone()
        ? h(
            'section',
            { class: 'block callout' },
            h('h2', null, 'Поставь на экран «Домой»'),
            isIos()
              ? h('ol', { class: 'steps' }, h('li', null, 'Открой эту страницу в Safari.'), h('li', null, 'Нажми «Поделиться» внизу экрана.'), h('li', null, 'Выбери «На экран „Домой“».'))
              : h('p', null, 'В меню браузера выбери «Установить приложение» или «Добавить на главный экран».'),
            h('p', { class: 'hint' }, 'Сделай это до того, как добавлять вещи: у значка на экране «Домой» своя память, отдельная от Safari. Приложение с экрана работает без интернета.'),
          )
        : null,
      h(
        'section',
        { class: 'block' },
        h('h2', null, 'Резервная копия'),
        h('p', null, 'Вещи и фото хранятся только на этом телефоне. Копия — один файл, который можно положить в «Файлы» или iCloud и восстановить на новом телефоне.'),
        backupLine,
        h('div', { class: 'btn-col' }, exportBtn, h('label', { class: 'btn btn-outline' }, 'Восстановить из копии', restoreInput)),
      ),
      h(
        'section',
        { class: 'block' },
        h('h2', null, 'Вид и обработка'),
        toggle('Вещи без дела бледнеют', 'Чем дольше не надевал, тем бледнее вещь в сетке.', 'fade'),
        toggle('Сразу вырезать точно', 'Аккуратнее на пёстром фоне, но в разы медленнее и требует больше памяти. Если приложение вылетает, выключи.', 'fineCutout'),
      ),
      goneCount
        ? h('section', { class: 'block' }, h('h2', null, 'Ушедшие вещи'), h('p', { class: 'hint' }, `Продано, отдано и выкинуто: ${goneCount}.`), h('button', { class: 'btn btn-outline', onClick: openArchive }, 'Открыть список'))
        : null,
      h(
        'section',
        { class: 'block' },
        h('h2', null, 'Данные'),
        storageLine,
        h(
          'button',
          {
            class: 'btn btn-danger-ghost',
            onClick: async () => {
              const ok = await confirmSheet({
                title: 'Стереть весь гардероб?',
                text: 'Удалятся все вещи, фото, образы и отметки. Вернуть получится только из резервной копии.',
                confirm: 'Стереть всё',
                danger: true,
              });
              if (!ok) return;
              await db.clearAll();
              location.reload();
            },
          },
          icon('trash', 18),
          'Стереть все данные',
        ),
      ),
      h('p', { class: 'hint pad about' }, `Гардероб ${APP_VERSION}. Фото обрабатываются на телефоне и никуда не отправляются.`),
    ),
  );
}
