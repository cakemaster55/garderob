// Экран «Ещё»: установка, резервная копия, вид, архив, данные.
import { h, icon, picture, toast, confirmSheet, openSheet } from '../ui.js';
import { state, saveSettings, updateItem, load, emit, getWishlist } from '../store.js';
import { db, IMAGE_STORES } from '../db.js';
import { GONE, pluralItems } from '../catalog.js';
import { itemTitle } from './wardrobe.js';

const MAGIC = 'GARDEROB1\n';
export const APP_VERSION = '1.1';

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
    toast(`Копия сохранена, ${fmtSize(blob.size)}`);
  } catch (err) {
    console.error(err);
    toast(`Не получилось: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
}

function openArchive() {
  const sheet = openSheet({ title: 'Ушедшие вещи', full: true });
  const draw = () => {
    const gone = state.items.filter((i) => i.goneAt).sort((a, b) => b.goneAt - a.goneAt);
    if (!gone.length) return sheet.close();
    sheet.setBody(
      h(
        'div',
        { class: 'group' },
        gone.map((i) =>
          h(
            'div',
            { class: 'cell cell-item' },
            h('div', { class: 'cell-main' }, h('span', { class: 'cell-thumb' }, picture('thumbs', i.id, { rev: i.rev })), h('span', { class: 'cell-text' }, h('b', null, itemTitle(i)), h('span', null, `${GONE[i.decision]} ${new Date(i.goneAt).toLocaleDateString('ru-RU')}`))),
            h(
              'button',
              {
                class: 'text-btn',
                onClick: async () => {
                  await updateItem(i.id, { goneAt: null, decision: 'keep' });
                  draw();
                },
              },
              'Вернуть',
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
  const storageLine = h('p', { class: 'caption center' }, `Гардероб ${APP_VERSION}`);
  const backupLine = h('p', { class: 'caption' });

  (async () => {
    try {
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        storageLine.textContent = `${pluralItems(state.items.length)}, ${fmtSize(est.usage)}. Версия ${APP_VERSION}`;
      }
      if (navigator.storage?.persisted && !(await navigator.storage.persisted()) && navigator.storage.persist) await navigator.storage.persist();
    } catch {}
    const last = await db.kvGet('lastBackup');
    if (last) backupLine.textContent = `Последняя копия: ${new Date(last).toLocaleDateString('ru-RU')}`;
    else backupLine.remove();
  })();

  const restoreInput = h('input', {
    type: 'file',
    class: 'visually-hidden',
    onChange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const ok = await confirmSheet({ title: 'Восстановить из копии?', text: 'Текущие данные заменятся содержимым файла.', confirm: 'Восстановить', danger: state.items.length > 0 });
      if (!ok) return;
      try {
        await restoreBackup(file);
        location.reload();
      } catch (err) {
        console.error(err);
        toast(`Не получилось: ${err.message}`);
        await load();
        emit('items');
      }
    },
  });

  const toggle = (label, key) => h('label', { class: 'cell' }, h('span', null, label), h('input', { type: 'checkbox', class: 'switch', checked: !!state.settings[key], onChange: (e) => saveSettings({ [key]: e.target.checked }) }));

  root.replaceChildren(
    h(
      'div',
      { class: 'screen screen-list' },
      h('header', { class: 'nav' }, h('h1', { class: 'large-title' }, 'Ещё')),
      !isStandalone() && isIos()
        ? h('section', { class: 'section' }, h('div', { class: 'group' }, h('div', { class: 'cell cell-note' }, 'Чтобы установить: в Safari «Поделиться», затем «На экран „Домой“».')))
        : null,
      h(
        'section',
        { class: 'section' },
        h('h2', { class: 'section-title' }, 'Резервная копия'),
        h('div', { class: 'group' }, h('button', { class: 'cell cell-action', onClick: (e) => exportBackup(e.currentTarget) }, 'Сохранить копию'), h('label', { class: 'cell cell-action' }, 'Восстановить из копии', restoreInput)),
        backupLine,
      ),
      h('section', { class: 'section' }, h('h2', { class: 'section-title' }, 'Вид'), h('div', { class: 'group' }, toggle('Приглушать неношеное', 'fade'), toggle('Точное вырезание', 'fineCutout'))),
      goneCount
        ? h('section', { class: 'section' }, h('div', { class: 'group' }, h('button', { class: 'cell cell-nav', onClick: openArchive }, h('span', null, 'Ушедшие вещи'), h('span', { class: 'cell-value' }, String(goneCount), icon('chevron', 16)))))
        : null,
      h(
        'section',
        { class: 'section' },
        h(
          'div',
          { class: 'group' },
          h(
            'button',
            {
              class: 'cell cell-action cell-danger',
              onClick: async () => {
                if (!(await confirmSheet({ title: 'Стереть все данные?', text: 'Вещи, фото, образы и отметки удалятся.', confirm: 'Стереть', danger: true }))) return;
                await db.clearAll();
                location.reload();
              },
            },
            'Стереть все данные',
          ),
        ),
      ),
      storageLine,
    ),
  );
}
