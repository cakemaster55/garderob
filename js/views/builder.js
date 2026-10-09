// Конструктор образов: лента инвентаря внизу, полотно сверху, вещи перетаскиваются пальцем.
import { h, icon, picture, chips, openSheet, confirmSheet, toast } from '../ui.js';
import { state, activeItems, itemById, outfitById, saveOutfit, deleteOutfit, loadFullImage } from '../store.js';
import { GROUPS } from '../catalog.js';
import { renderOutfit } from '../pipeline.js';
import { itemTitle } from './wardrobe.js';

// Куда вещь встаёт по нажатию: центр (доли полотна) и ширина.
const SLOTS = {
  top: { x: 0.5, y: 0.27, w: 0.5 },
  bottom: { x: 0.5, y: 0.63, w: 0.4 },
  dress: { x: 0.5, y: 0.45, w: 0.5 },
  outer: { x: 0.27, y: 0.32, w: 0.46 },
  shoes: { x: 0.5, y: 0.9, w: 0.28 },
  acc: { x: 0.82, y: 0.16, w: 0.24 },
  other: { x: 0.18, y: 0.82, w: 0.26 },
};
const MIN_W = 0.08;
const MAX_W = 1.3;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function openBuilder(outfitId) {
  const existing = outfitId ? outfitById(outfitId) : null;
  let layers = existing ? existing.layers.filter((l) => itemById(l.itemId)).map((l) => ({ ...l })) : [];
  let selected = null; // itemId выбранного слоя
  let group = 'all';
  let dirty = false;
  let saving = false;

  const nameInput = h('input', {
    class: 'input builder-name',
    type: 'text',
    value: existing?.name || '',
    placeholder: `Образ ${state.outfits.length + (existing ? 0 : 1)}`,
    'aria-label': 'Название образа',
    enterKeyHint: 'done',
    onInput: () => (dirty = true),
  });
  const saveBtn = h('button', { class: 'btn btn-primary btn-small', onClick: save }, 'Сохранить');
  const deleteBtn = existing
    ? h(
        'button',
        {
          class: 'icon-btn',
          'aria-label': 'Удалить образ',
          onClick: async () => {
            if (!(await confirmSheet({ title: 'Удалить образ?', text: 'Вещи останутся в гардеробе.', confirm: 'Удалить', danger: true }))) return;
            await deleteOutfit(existing.id);
            dirty = false;
            sheet.close();
            toast('Образ удалён');
          },
        },
        icon('trash', 20),
      )
    : null;

  const board = h('div', { class: 'board', 'aria-label': 'Полотно образа' });
  const boardWrap = h('div', { class: 'board-wrap' }, board);
  const tools = h('div', { class: 'layer-tools' });
  const trayRow = h('div', { class: 'tray-row' });
  const trayChips = h('div', { class: 'tray-chips' });
  const tray = h('div', { class: 'tray' }, trayChips, trayRow);

  const sheet = openSheet({
    title: '',
    full: true,
    className: 'sheet-builder',
    actions: [deleteBtn, saveBtn],
    guard: async () => {
      if (!dirty || saving) return true;
      return confirmSheet({ title: 'Закрыть без сохранения?', text: 'Изменения в образе пропадут.', confirm: 'Закрыть', cancel: 'Остаться' });
    },
    onClose: () => {
      ro.disconnect();
    },
  });
  sheet.el.querySelector('.sheet-title').replaceWith(nameInput);
  sheet.setBody(boardWrap, tools, tray);

  // Полотно 3:4, вписанное в свободное место.
  const ro = new ResizeObserver((entries) => {
    const r = entries[0].contentRect;
    const w = Math.max(120, Math.floor(Math.min(r.width, (r.height * 3) / 4)));
    board.style.width = `${w}px`;
    board.style.height = `${(w * 4) / 3}px`;
  });
  ro.observe(boardWrap);

  const layerOf = (itemId) => layers.find((l) => l.itemId === itemId);

  function placeLayerEl(el, layer) {
    el.style.left = `${layer.x * 100}%`;
    el.style.top = `${layer.y * 100}%`;
    el.style.width = `${layer.w * 100}%`;
  }

  function renderBoard() {
    const nodes = layers.map((layer, i) => {
      const item = itemById(layer.itemId);
      const el = h(
        'div',
        { class: `layer ${layer.itemId === selected ? 'is-selected' : ''}`, dataset: { id: layer.itemId }, style: { zIndex: i + 1 } },
        picture('fulls', layer.itemId, { rev: item?.rev, alt: item ? itemTitle(item) : '' }),
      );
      placeLayerEl(el, layer);
      return el;
    });
    if (!layers.length) {
      nodes.push(h('div', { class: 'board-hint' }, icon('up', 28), h('p', null, 'Тяни вещи из ленты сюда'), h('span', null, 'или просто нажимай на них')));
    }
    board.replaceChildren(...nodes);
    renderTools();
  }

  function renderTools() {
    const layer = selected && layerOf(selected);
    if (!layer) {
      tools.replaceChildren(h('span', { class: 'tools-hint' }, layers.length ? 'Нажми на вещь, чтобы изменить размер или слой' : ''));
      return;
    }
    const idx = layers.indexOf(layer);
    const tool = (label, ic, fn, disabled = false) => h('button', { class: 'tool', disabled, 'aria-label': label, title: label, onClick: fn }, icon(ic, 20), h('span', null, label));
    tools.replaceChildren(
      tool('Меньше', 'minus', () => resize(layer, 1 / 1.12)),
      tool('Больше', 'plus', () => resize(layer, 1.12)),
      tool('Назад', 'toBack', () => reorder(idx, -1), idx === 0),
      tool('Вперёд', 'toFront', () => reorder(idx, 1), idx === layers.length - 1),
      tool('Убрать', 'trash', () => removeLayer(layer.itemId)),
    );
  }

  function resize(layer, k) {
    layer.w = clamp(layer.w * k, MIN_W, MAX_W);
    dirty = true;
    const el = board.querySelector(`.layer[data-id="${layer.itemId}"]`);
    if (el) placeLayerEl(el, layer);
  }
  function reorder(idx, dir) {
    const j = idx + dir;
    if (j < 0 || j >= layers.length) return;
    [layers[idx], layers[j]] = [layers[j], layers[idx]];
    dirty = true;
    renderBoard();
  }
  function removeLayer(itemId) {
    layers = layers.filter((l) => l.itemId !== itemId);
    if (selected === itemId) selected = null;
    dirty = true;
    renderBoard();
    renderTray();
  }
  function addLayer(item, x, y) {
    const slot = SLOTS[item.group] || SLOTS.other;
    // Высокие вещи делаем уже, чтобы помещались в полотно.
    const ratio = item.ratio || 1;
    let w = slot.w;
    const hFrac = (w / ratio) * (3 / 4);
    if (hFrac > 0.62) w *= 0.62 / hFrac;
    const existingLayer = layerOf(item.id);
    if (existingLayer) {
      if (x !== undefined) {
        existingLayer.x = x;
        existingLayer.y = y;
      }
      selected = item.id;
    } else {
      layers.push({ itemId: item.id, x: x ?? slot.x, y: y ?? slot.y, w });
      selected = item.id;
    }
    dirty = true;
    renderBoard();
    renderTray();
  }

  // ---------- лента инвентаря ----------
  function renderTray() {
    const all = activeItems();
    const counts = {};
    for (const it of all) counts[it.group] = (counts[it.group] || 0) + 1;
    const options = [{ id: 'all', name: 'Все' }].concat(GROUPS.filter((g) => counts[g.id]).map((g) => ({ id: g.id, name: g.name })));
    trayChips.replaceChildren(
      chips(
        options,
        group,
        (id) => {
          group = id;
          renderTray();
          trayRow.scrollLeft = 0;
        },
        { className: 'chips-scroll chips-tight' },
      ),
    );
    const list = group === 'all' ? all : all.filter((i) => i.group === group);
    const keepScroll = trayRow.scrollLeft;
    trayRow.replaceChildren(
      ...list.map((item) =>
        h(
          'button',
          {
            class: `tray-item ${layerOf(item.id) ? 'is-used' : ''}`,
            type: 'button',
            dataset: { id: item.id },
            'aria-label': `${itemTitle(item)}: добавить на полотно`,
          },
          picture('thumbs', item.id, { rev: item.rev }),
          layerOf(item.id) ? h('i', { class: 'tray-check' }, icon('check', 12)) : null,
        ),
      ),
    );
    trayRow.scrollLeft = keepScroll;
  }

  // Перетаскивание из ленты: движение вверх поднимает вещь, движение вбок листает ленту.
  let pull = null;
  trayRow.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.tray-item');
    if (!btn || pull) return;
    pull = { id: btn.dataset.id, btn, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, ghost: null, mouse: e.pointerType === 'mouse' };
    try {
      btn.setPointerCapture(e.pointerId);
    } catch {}
  });
  trayRow.addEventListener('pointermove', (e) => {
    if (!pull || e.pointerId !== pull.pointerId) return;
    const dx = e.clientX - pull.x0;
    const dy = e.clientY - pull.y0;
    if (!pull.ghost) {
      const lift = pull.mouse ? Math.hypot(dx, dy) > 6 : dy < -10 && Math.abs(dy) > Math.abs(dx);
      if (!lift) return;
      const item = itemById(pull.id);
      const ghost = picture('thumbs', pull.id, { rev: item?.rev, class: 'drag-ghost' });
      const size = board.getBoundingClientRect().width * 0.36;
      ghost.style.width = `${size}px`;
      document.body.append(ghost);
      pull.ghost = ghost;
      pull.btn.classList.add('is-lifting');
    }
    e.preventDefault();
    pull.ghost.style.left = `${e.clientX}px`;
    pull.ghost.style.top = `${e.clientY}px`;
    const r = board.getBoundingClientRect();
    const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    board.classList.toggle('is-target', over);
  });
  const endPull = (e, cancelled) => {
    if (!pull || e.pointerId !== pull.pointerId) return;
    const p = pull;
    pull = null;
    p.btn.classList.remove('is-lifting');
    board.classList.remove('is-target');
    const item = itemById(p.id);
    if (p.ghost) {
      p.ghost.remove();
      if (cancelled || !item) return;
      const r = board.getBoundingClientRect();
      const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (over) addLayer(item, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      return;
    }
    if (cancelled || !item) return;
    // Простое нажатие: вещь встаёт на своё место, повторное — выделяет её.
    if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 8) addLayer(item);
  };
  trayRow.addEventListener('pointerup', (e) => endPull(e, false));
  trayRow.addEventListener('pointercancel', (e) => endPull(e, true));
  trayRow.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- движение по полотну ----------
  const pointers = new Map();
  let gesture = null;

  function startGesture() {
    const layer = selected && layerOf(selected);
    if (!layer) return (gesture = null);
    const pts = [...pointers.values()];
    const r = board.getBoundingClientRect();
    if (pts.length === 1) {
      gesture = { kind: 'move', layer, r, px: pts[0].x, py: pts[0].y, x: layer.x, y: layer.y };
    } else if (pts.length >= 2) {
      gesture = { kind: 'pinch', layer, r, d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1, w: layer.w };
    }
  }

  board.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.layer');
    if (pointers.size === 0) {
      const next = el ? el.dataset.id : null;
      if (next !== selected) {
        selected = next;
        for (const n of board.querySelectorAll('.layer')) n.classList.toggle('is-selected', n.dataset.id === selected);
        renderTools();
      }
    }
    if (!selected) return;
    e.preventDefault();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      board.setPointerCapture(e.pointerId);
    } catch {}
    startGesture();
  });
  board.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId) || !gesture) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const { layer, r } = gesture;
    const el = board.querySelector(`.layer[data-id="${layer.itemId}"]`);
    if (gesture.kind === 'move') {
      layer.x = clamp(gesture.x + (e.clientX - gesture.px) / r.width, -0.15, 1.15);
      layer.y = clamp(gesture.y + (e.clientY - gesture.py) / r.height, -0.15, 1.4);
      const out = e.clientY > r.bottom + 24;
      tray.classList.toggle('is-bin', out);
      if (el) el.classList.toggle('is-leaving', out);
    } else {
      const pts = [...pointers.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      layer.w = clamp((gesture.w * d) / gesture.d, MIN_W, MAX_W);
    }
    dirty = true;
    if (el) placeLayerEl(el, layer);
  });
  const endPointer = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    const g = gesture;
    tray.classList.remove('is-bin');
    if (g && g.kind === 'move' && e.type === 'pointerup' && e.clientY > g.r.bottom + 24) {
      gesture = null;
      removeLayer(g.layer.itemId);
      return;
    }
    if (g && g.kind === 'move') g.layer.y = clamp(g.layer.y, -0.15, 1.15);
    if (pointers.size) startGesture();
    else {
      gesture = null;
      if (g) {
        const el = board.querySelector(`.layer[data-id="${g.layer.itemId}"]`);
        if (el) {
          el.classList.remove('is-leaving');
          placeLayerEl(el, g.layer);
        }
      }
    }
  };
  board.addEventListener('pointerup', endPointer);
  board.addEventListener('pointercancel', endPointer);
  board.addEventListener('contextmenu', (e) => e.preventDefault());

  async function save() {
    if (saving) return;
    if (!layers.length) {
      toast('Положи на полотно хотя бы одну вещь');
      return;
    }
    saving = true;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Сохраняю…';
    try {
      const preview = await renderOutfit(
        layers.map((l, i) => ({ ...l, z: i })),
        loadFullImage,
      );
      await saveOutfit(
        {
          id: existing?.id,
          name: nameInput.value.trim() || nameInput.placeholder,
          layers: layers.map((l, i) => ({ itemId: l.itemId, x: l.x, y: l.y, w: l.w, z: i })),
        },
        preview,
      );
      dirty = false;
      sheet.close();
      toast('Образ сохранён');
    } catch (err) {
      console.error(err);
      toast(`Не получилось сохранить: ${err.message}`);
      saving = false;
      saveBtn.disabled = false;
      saveBtn.textContent = 'Сохранить';
    }
  }

  renderBoard();
  renderTray();
}
