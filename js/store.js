// Состояние приложения: вещи, образы, картинки, отметки «надел».
import { db, blobToRecord, recordToBlob, uid } from './db.js';

export const state = {
  items: [],
  outfits: [],
  settings: { fade: true, fineCutout: false },
  ready: false,
};

const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function emit(what = 'all') {
  for (const fn of listeners) fn(what);
}

// ---------- даты ----------
export function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function daysBetween(fromKey, toKey = dayKey()) {
  const a = new Date(fromKey + 'T12:00:00');
  const b = new Date(toKey + 'T12:00:00');
  return Math.round((b - a) / 86400000);
}
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export function humanDay(key) {
  const n = daysBetween(key);
  if (n === 0) return 'сегодня';
  if (n === 1) return 'вчера';
  const d = new Date(key + 'T12:00:00');
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${sameYear ? '' : ' ' + d.getFullYear()}`;
}

// ---------- загрузка ----------
export async function load() {
  const [items, outfits, settings] = await Promise.all([db.all('items'), db.all('outfits'), db.kvGet('settings')]);
  state.items = items.sort((a, b) => b.createdAt - a.createdAt);
  state.outfits = outfits.sort((a, b) => b.createdAt - a.createdAt);
  if (settings) Object.assign(state.settings, settings);
  state.ready = true;
}

export async function saveSettings(patch) {
  Object.assign(state.settings, patch);
  await db.kvSet('settings', state.settings);
  emit('settings');
}

// ---------- картинки ----------
const urlCache = { thumbs: new Map(), fulls: new Map(), origs: new Map(), previews: new Map() };

export async function imageUrl(store, id) {
  const cache = urlCache[store];
  if (cache.has(id)) return cache.get(id);
  const p = db.get(store, id).then((rec) => (rec ? URL.createObjectURL(recordToBlob(rec)) : null));
  cache.set(id, p);
  return p;
}
export function dropUrl(store, id) {
  const cache = urlCache[store];
  const p = cache.get(id);
  if (!p) return;
  cache.delete(id);
  Promise.resolve(p).then((u) => u && URL.revokeObjectURL(u));
}
export async function imageBlob(store, id) {
  const rec = await db.get(store, id);
  return rec ? recordToBlob(rec) : null;
}

const imgCache = new Map();
// Загруженная <img> с полной картинкой вещи — для холста образа.
export function loadFullImage(itemId) {
  if (imgCache.has(itemId)) return imgCache.get(itemId);
  const p = imageUrl('fulls', itemId).then(
    (url) =>
      new Promise((resolve) => {
        if (!url) return resolve(null);
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      }),
  );
  imgCache.set(itemId, p);
  return p;
}

// ---------- вещи ----------
export const activeItems = () => state.items.filter((i) => !i.goneAt);
export const itemById = (id) => state.items.find((i) => i.id === id);

export async function addItem(fields, images) {
  const item = {
    id: uid(),
    createdAt: Date.now(),
    group: 'other',
    type: '',
    name: '',
    color: null,
    season: 'all',
    brand: '',
    price: null,
    note: '',
    decision: 'keep',
    wears: [],
    goneAt: null,
    cut: true,
    ratio: 1,
    ...fields,
  };
  const ops = [['items', 'put', item]];
  ops.push(['thumbs', 'put', await blobToRecord(item.id, images.thumb)]);
  ops.push(['fulls', 'put', await blobToRecord(item.id, images.full)]);
  if (images.orig) ops.push(['origs', 'put', await blobToRecord(item.id, images.orig)]);
  await db.batch(ops);
  state.items.unshift(item);
  emit('items');
  return item;
}

export async function updateItem(id, patch) {
  const item = itemById(id);
  if (!item) return null;
  Object.assign(item, patch);
  await db.put('items', item);
  emit('items');
  return item;
}

export async function replaceItemImages(id, images, patch = {}) {
  const ops = [
    ['thumbs', 'put', await blobToRecord(id, images.thumb)],
    ['fulls', 'put', await blobToRecord(id, images.full)],
  ];
  await db.batch(ops);
  dropUrl('thumbs', id);
  dropUrl('fulls', id);
  imgCache.delete(id);
  const item = itemById(id);
  Object.assign(item, patch, { rev: (item.rev || 0) + 1 });
  await db.put('items', item);
  emit('items');
}

export async function deleteItem(id) {
  const ops = [
    ['items', 'delete', id],
    ['thumbs', 'delete', id],
    ['fulls', 'delete', id],
    ['origs', 'delete', id],
  ];
  // Убираем вещь из образов.
  for (const o of state.outfits) {
    if (o.layers.some((l) => l.itemId === id)) {
      o.layers = o.layers.filter((l) => l.itemId !== id);
      o.stale = true;
      ops.push(['outfits', 'put', o]);
    }
  }
  await db.batch(ops);
  state.items = state.items.filter((i) => i.id !== id);
  for (const s of ['thumbs', 'fulls', 'origs']) dropUrl(s, id);
  imgCache.delete(id);
  emit('items');
}

// ---------- носка ----------
export const wearCount = (item) => item.wears.length;
export const lastWorn = (item) => (item.wears.length ? item.wears[item.wears.length - 1] : null);
export const wornOn = (item, key = dayKey()) => item.wears.includes(key);

function setWorn(item, key, on) {
  const has = item.wears.includes(key);
  if (on && !has) {
    item.wears.push(key);
    item.wears.sort();
  } else if (!on && has) {
    item.wears = item.wears.filter((k) => k !== key);
  }
}

export async function toggleWear(id, key = dayKey(), on) {
  const item = itemById(id);
  if (!item) return false;
  const next = on === undefined ? !item.wears.includes(key) : on;
  setWorn(item, key, next);
  await db.put('items', item);
  emit('items');
  return next;
}

export async function markWorn(ids, key = dayKey()) {
  const ops = [];
  for (const id of ids) {
    const item = itemById(id);
    if (!item) continue;
    setWorn(item, key, true);
    ops.push(['items', 'put', item]);
  }
  if (ops.length) await db.batch(ops);
  emit('items');
}

// Сколько дней вещь лежит без дела (с последней носки или с добавления).
export function idleDays(item) {
  const last = lastWorn(item);
  return daysBetween(last || dayKey(new Date(item.createdAt)));
}

// ---------- образы ----------
export const outfitById = (id) => state.outfits.find((o) => o.id === id);

export async function saveOutfit(outfit, previewBlob) {
  const existing = outfit.id && outfitById(outfit.id);
  const record = existing || { id: uid(), createdAt: Date.now(), wears: [], name: '' };
  Object.assign(record, outfit, { id: record.id, stale: false, rev: (record.rev || 0) + 1 });
  const ops = [['outfits', 'put', record]];
  if (previewBlob) ops.push(['previews', 'put', await blobToRecord(record.id, previewBlob)]);
  await db.batch(ops);
  dropUrl('previews', record.id);
  if (!existing) state.outfits.unshift(record);
  emit('outfits');
  return record;
}

export async function deleteOutfit(id) {
  await db.batch([
    ['outfits', 'delete', id],
    ['previews', 'delete', id],
  ]);
  state.outfits = state.outfits.filter((o) => o.id !== id);
  dropUrl('previews', id);
  emit('outfits');
}

export async function wearOutfit(id, key = dayKey()) {
  const o = outfitById(id);
  if (!o) return;
  if (!o.wears.includes(key)) {
    o.wears.push(key);
    o.wears.sort();
  }
  await db.put('outfits', o);
  await markWorn(
    o.layers.map((l) => l.itemId),
    key,
  );
  emit('outfits');
}

// ---------- список покупок ----------
export async function getWishlist() {
  return (await db.kvGet('wishlist')) || [];
}
export async function setWishlist(list) {
  await db.kvSet('wishlist', list);
  emit('wishlist');
}
