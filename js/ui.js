// Мелкие помощники интерфейса: создание элементов, шторки, подсказки, иконки.
import { imageUrl } from './store.js';

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [prop, val] of Object.entries(v)) {
          if (prop.startsWith('--')) el.style.setProperty(prop, val);
          else el.style[prop] = val;
        }
      }
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in el && k !== 'list' && k !== 'type') {
        try {
          el[k] = v;
        } catch {
          el.setAttribute(k, v);
        }
      } else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
}

const P = {
  hanger:
    'M12 8.2a2.2 2.2 0 1 0-2.2-2.2M12 8.2v2.1M12 10.3 3.6 15.8c-1 .7-.5 2.2.7 2.2h15.4c1.2 0 1.7-1.5.7-2.2L12 10.3Z',
  looks: 'M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z',
  chart: 'M4 20V10M10 20V4M16 20v-7M21 20H3',
  more: 'M5 7h14M5 12h14M5 17h14',
  plus: 'M12 5v14M5 12h14',
  camera: 'M4 8h3l1.5-2h7L17 8h3v11H4zM12 16.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z',
  photos: 'M4 5h16v14H4zM4 16l4.5-4.5 3.5 3.5 3-3 5 5M9 9.5a1 1 0 1 0 0-.1',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6 6 18',
  back: 'M14.5 5.5 8 12l6.5 6.5',
  trash: 'M5 7h14M10 7V4.5h4V7M7 7l.8 12.5h8.4L17 7M10 10.5v6M14 10.5v6',
  up: 'M12 19V6M6.5 11.5 12 6l5.5 5.5',
  down: 'M12 5v13M6.5 12.5 12 18l5.5-5.5',
  rotate: 'M19 12a7 7 0 1 1-2.3-5.2M19 4.5V8h-3.5',
  share: 'M12 15V4M8 7.5 12 4l4 3.5M6 12v7h12v-7',
  sparkle: 'M12 4l1.8 4.9L18.5 10l-4.7 1.6L12 16.5l-1.8-4.9L5.5 10l4.7-1.1zM18 16l.7 1.8 1.8.7-1.8.7L18 21l-.7-1.8-1.8-.7 1.8-.7z',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  edit: 'M5 19l1-4L16.5 4.5l3 3L9 18l-4 1ZM14.5 6.5l3 3',
  minus: 'M5 12h14',
  toFront: 'M9 9h11v11H9zM4 15V4h11',
  toBack: 'M4 4h11v11H4zM20 9v11H9',
  shuffle: 'M3 7h3.2c1.9 0 3.2.9 4.3 2.6l2.9 4.8c1.1 1.7 2.4 2.6 4.3 2.6H21M18.2 14.2 21 17l-2.8 2.8M3 17h3.2c1.2 0 2.2-.4 3-1.1M21 7h-3.3c-1.2 0-2.2.4-3 1.1M18.2 4.2 21 7l-2.8 2.8',
  sort: 'M7 5v14M3.5 15.5 7 19l3.5-3.5M17 19V5M13.5 8.5 17 5l3.5 3.5',
  chevron: 'M9.5 5.5 16 12l-6.5 6.5',
  wand: 'M5 19 15 9M13 7l4 4M17.5 3.5v3M16 5h3M20 10v2M19 11h2M9 4v2M8 5h2',
};
export function icon(name, size = 24) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', P[name] || '');
  svg.append(path);
  return svg;
}

// <img>, который сам подтягивает картинку из базы.
const resolved = new Map();
export function picture(store, id, props = {}) {
  const key = `${store}:${id}:${props.rev || 0}`;
  const img = h('img', { alt: props.alt || '', class: props.class || '', draggable: false, decoding: 'async' });
  if (resolved.has(key)) {
    img.src = resolved.get(key);
  } else {
    imageUrl(store, id).then((url) => {
      if (!url) return;
      resolved.set(key, url);
      img.src = url;
    });
  }
  return img;
}
export function forgetPicture(store, id) {
  for (const key of [...resolved.keys()]) if (key.startsWith(`${store}:${id}:`)) resolved.delete(key);
}

// ---------- шторки ----------
const sheetStack = [];

export function openSheet({ title, body, footer, full = false, onClose, className = '', left, right, done = 'Готово', guard }) {
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const titleEl = h('h2', { class: 'sheet-title' }, title || '');
  const doneBtn = done ? h('button', { class: 'text-btn text-btn-strong', onClick: () => api.close() }, done) : null;
  const head = h(
    'header',
    { class: 'sheet-head' },
    h('div', { class: 'sheet-side sheet-left' }, left || null),
    titleEl,
    h('div', { class: 'sheet-side sheet-right' }, right || null, doneBtn),
  );
  const bodyEl = h('div', { class: 'sheet-body' }, body || null);
  const footEl = footer ? h('footer', { class: 'sheet-foot' }, footer) : null;
  const sheet = h(
    'section',
    { class: `sheet ${full ? 'sheet-full' : ''} ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Окно' },
    h('i', { class: 'grabber' }),
    head,
    bodyEl,
    footEl,
  );
  let closed = false;
  const api = {
    el: sheet,
    body: bodyEl,
    setTitle(t) {
      titleEl.textContent = t;
    },
    setBody(...nodes) {
      bodyEl.replaceChildren(...nodes.flat().filter(Boolean));
    },
    setFooter(...nodes) {
      if (footEl) footEl.replaceChildren(...nodes.flat().filter(Boolean));
    },
    async close(result) {
      if (closed) return;
      if (guard && !(await guard())) return;
      if (closed) return;
      closed = true;
      const i = sheetStack.indexOf(api);
      if (i >= 0) sheetStack.splice(i, 1);
      document.documentElement.classList.toggle('has-sheet', sheetStack.length > 0);
      sheet.classList.remove('is-open');
      backdrop.classList.remove('is-open');
      const done = () => {
        sheet.remove();
        backdrop.remove();
      };
      setTimeout(done, 240);
      if (onClose) onClose(result);
    },
  };
  backdrop.addEventListener('click', () => api.close());
  // Каждая следующая шторка ложится поверх предыдущей.
  backdrop.style.zIndex = 40 + sheetStack.length * 2;
  sheet.style.zIndex = 41 + sheetStack.length * 2;
  document.body.append(backdrop, sheet);
  sheetStack.push(api);
  document.documentElement.classList.add('has-sheet');
  // Двойной кадр, чтобы сработала анимация появления.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      sheet.classList.add('is-open');
      backdrop.classList.add('is-open');
    }),
  );
  return api;
}

export function closeAllSheets() {
  for (const s of [...sheetStack]) s.close();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetStack.length) sheetStack[sheetStack.length - 1].close();
});

export function confirmSheet({ title, text, confirm = 'Да', cancel = 'Отмена', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const sheet = openSheet({
      className: 'sheet-confirm',
      done: null,
      body: [
        h(
          'div',
          { class: 'action-group' },
          h('div', { class: 'action-title' }, h('b', null, title), text ? h('span', null, text) : null),
          h(
            'button',
            {
              class: `action ${danger ? 'action-danger' : ''}`,
              onClick: () => {
                answered = true;
                sheet.close();
              },
            },
            confirm,
          ),
        ),
        h('div', { class: 'action-group' }, h('button', { class: 'action action-cancel', onClick: () => sheet.close() }, cancel)),
      ],
      onClose: () => resolve(answered),
    });
  });
}

// ---------- короткие сообщения ----------
let toastTimer = null;
export function toast(text, action) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = h('div', { class: 'toast', role: 'status' });
    document.body.append(el);
  }
  el.replaceChildren(h('span', null, text));
  if (action) el.append(h('button', { class: 'toast-action', onClick: () => (action.run(), el.classList.remove('is-open')) }, action.label));
  requestAnimationFrame(() => el.classList.add('is-open'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-open'), action ? 5000 : 2600);
}

// Чипы выбора одного значения.
export function chips(options, value, onChange, { className = '', allowNone = false } = {}) {
  const wrap = h('div', { class: `chips ${className}`, role: 'group' });
  const render = (current) => {
    wrap.replaceChildren(
      ...options.map((o) =>
        h(
          'button',
          {
            class: `chip ${o.id === current ? 'is-on' : ''}`,
            type: 'button',
            'aria-pressed': o.id === current ? 'true' : 'false',
            'aria-label': o.hideName ? o.name : null,
            title: o.hideName ? o.name : null,
            dataset: { id: o.id },
            onClick: () => {
              const next = allowNone && o.id === current ? null : o.id;
              render(next);
              onChange(next);
            },
          },
          o.swatch ? h('i', { class: 'swatch', style: { background: o.swatch } }) : null,
          o.swatch && o.hideName ? null : o.name,
          o.count !== undefined ? h('span', { class: 'chip-count' }, o.count) : null,
        ),
      ),
    );
  };
  render(value);
  // В прокручиваемом ряду выбранный чип должен быть виден сразу.
  if (className.includes('chips-scroll')) {
    requestAnimationFrame(() => {
      const on = wrap.querySelector('.chip.is-on');
      if (on && wrap.scrollWidth > wrap.clientWidth) wrap.scrollLeft = Math.max(0, on.offsetLeft - (wrap.clientWidth - on.offsetWidth) / 2);
    });
  }
  return wrap;
}

export function money(n) {
  if (n === null || n === undefined || n === '') return '';
  return Math.round(n).toLocaleString('ru-RU');
}
