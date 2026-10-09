// Запуск приложения и переключение разделов.
import { load, subscribe, state } from './store.js';
import { h } from './ui.js';
import { renderWardrobe } from './views/wardrobe.js';
import { renderOutfits } from './views/outfits.js';
import { renderInsights } from './views/insights.js';
import { renderSettings } from './views/settings.js';
import { openAdd } from './views/add.js';

const root = document.getElementById('view');
const TABS = {
  wardrobe: { render: renderWardrobe, on: ['items', 'settings'] },
  outfits: { render: renderOutfits, on: ['items', 'outfits'] },
  insights: { render: renderInsights, on: ['items'] },
  more: { render: renderSettings, on: ['items', 'outfits'] },
};
let current = null;

function currentTab() {
  const id = location.hash.replace('#', '');
  return TABS[id] ? id : 'wardrobe';
}

function show(resetScroll) {
  const id = currentTab();
  const changed = id !== current;
  current = id;
  for (const a of document.querySelectorAll('.tab')) {
    const on = a.dataset.tab === id;
    a.classList.toggle('is-on', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const y = window.scrollY;
  TABS[id].render(root);
  window.scrollTo(0, changed || resetScroll ? 0 : y);
}

async function boot() {
  try {
    await load();
  } catch (err) {
    console.error(err);
    root.replaceChildren(
      h('div', { class: 'screen' }, h('div', { class: 'empty' }, h('h2', null, 'Не открывается хранилище'), h('p', null, 'Похоже, браузер запретил хранить данные (например, в приватном режиме). Открой страницу в обычной вкладке Safari.'))),
    );
    return;
  }
  window.addEventListener('hashchange', () => show(true));
  document.getElementById('add-button').addEventListener('click', openAdd);

  let queued = false;
  subscribe((what) => {
    if (!TABS[current].on.includes(what) || queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      show(false);
    });
  });
  show(true);

  if (navigator.storage?.persist && state.items.length) navigator.storage.persist().catch(() => {});
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('sw', err));
  });
}

// Запрещаем масштабирование страницы жестами: оно мешает перетаскиванию.
document.addEventListener('gesturestart', (e) => e.preventDefault());

boot();
