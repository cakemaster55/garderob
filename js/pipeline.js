// Обработка фото: уменьшение, вырезание фона, обрезка по вещи, цвет, категория.
import { ml } from './ml.js';
import { CLOTHES_LABELS, IMAGENET_HINTS } from './catalog.js';

const WORK_SIDE = 1024; // рабочий размер фото (его же храним как оригинал)
const FULL_SIDE = 800; // сохранённая вырезанная вещь
const THUMB_SIDE = 320; // миниатюра для сеток

const CLOTHES_ORDER = ['dress', 'hat', 'longsleeve', 'outwear', 'pants', 'shirt', 'shoes', 'shorts', 'skirt', 't-shirt'];

let webpOk = null;
function canEncodeWebp() {
  if (webpOk === null) {
    const c = document.createElement('canvas');
    c.width = c.height = 2;
    webpOk = c.toDataURL('image/webp').startsWith('data:image/webp');
  }
  return webpOk;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
function free(...canvases) {
  for (const c of canvases) if (c) c.width = c.height = 0;
}
function toBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Не удалось сохранить картинку'))), type, quality);
  });
}
const encodeCutout = (canvas) => (canEncodeWebp() ? toBlob(canvas, 'image/webp', 0.9) : toBlob(canvas, 'image/png'));

export async function decodeToCanvas(blob, maxSide = WORK_SIDE) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    try {
      await img.decode();
    } catch {
      await new Promise((resolve, reject) => {
        if (img.complete && img.naturalWidth) return resolve();
        img.onload = resolve;
        img.onerror = () => reject(new Error('Этот файл не открывается как фото'));
      });
    }
    if (!img.naturalWidth) throw new Error('Этот файл не открывается как фото');
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = makeCanvas(img.naturalWidth * k, img.naturalHeight * k);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function scaled(src, w, h) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

// Картинка -> тензор [3, n, n] для модели.
function toTensor(src, n, mode) {
  const c = scaled(src, n, n);
  const d = c.getContext('2d').getImageData(0, 0, n, n).data;
  free(c);
  const out = new Float32Array(3 * n * n);
  const plane = n * n;
  if (mode === 'isnet') {
    for (let i = 0, p = 0; i < plane; i++, p += 4) {
      out[i] = d[p] / 255 - 0.5;
      out[plane + i] = d[p + 1] / 255 - 0.5;
      out[2 * plane + i] = d[p + 2] / 255 - 0.5;
    }
    return out;
  }
  let max = 1;
  if (mode === 'u2net') {
    max = 1e-6;
    for (let p = 0; p < d.length; p += 4) max = Math.max(max, d[p], d[p + 1], d[p + 2]);
  } else {
    max = 255;
  }
  for (let i = 0, p = 0; i < plane; i++, p += 4) {
    out[i] = (d[p] / max - 0.485) / 0.229;
    out[plane + i] = (d[p + 1] / max - 0.456) / 0.224;
    out[2 * plane + i] = (d[p + 2] / max - 0.406) / 0.225;
  }
  return out;
}

// Убираем мелкие случайные пятна: оставляем только крупные связные области маски.
function dropSpecks(mask, n) {
  const total = n * n;
  const label = new Int32Array(total);
  const stack = new Int32Array(total);
  const areas = [0];
  let next = 0;
  for (let i = 0; i < total; i++) {
    if (mask[i] <= 0.5 || label[i]) continue;
    next++;
    let top = 0;
    let area = 0;
    stack[top++] = i;
    label[i] = next;
    while (top) {
      const j = stack[--top];
      area++;
      const x = j % n;
      const y = (j - x) / n;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= n) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= n) continue;
          const k = yy * n + xx;
          if (mask[k] > 0.5 && !label[k]) {
            label[k] = next;
            stack[top++] = k;
          }
        }
      }
    }
    areas.push(area);
  }
  if (next <= 1) return mask;
  const biggest = Math.max(...areas);
  const keepLabel = areas.map((a) => a >= 0.04 * biggest);
  // Область «рядом с оставленным» — чтобы не обрезать мягкие края.
  const r = Math.max(2, Math.round((n / 320) * 3));
  const keep = new Uint8Array(total);
  for (let i = 0; i < total; i++) if (label[i] && keepLabel[label[i]]) keep[i] = 1;
  const tmp = new Uint8Array(total);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let v = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(n - 1, x + r) && !v; k++) v = keep[y * n + k];
      tmp[y * n + x] = v;
    }
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let v = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(n - 1, y + r) && !v; k++) v = tmp[k * n + x];
      if (!v) mask[y * n + x] = 0;
    }
  }
  return mask;
}

function normalizeMask(mask) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo || 1;
  for (let i = 0; i < mask.length; i++) mask[i] = (mask[i] - lo) / span;
  return mask;
}

// Маска модели -> альфа-канал рабочего размера.
function maskToAlpha(mask, n, w, h) {
  const small = makeCanvas(n, n);
  const sctx = small.getContext('2d');
  const id = sctx.createImageData(n, n);
  for (let i = 0, p = 0; i < n * n; i++, p += 4) {
    const v = Math.round(mask[i] * 255);
    id.data[p] = id.data[p + 1] = id.data[p + 2] = v;
    id.data[p + 3] = 255;
  }
  sctx.putImageData(id, 0, 0);
  const big = scaled(small, w, h);
  const d = big.getContext('2d').getImageData(0, 0, w, h).data;
  free(small, big);
  const alpha = new Uint8ClampedArray(w * h);
  // Узкий переход вместо размытого ореола фона по краю.
  const a = 0.3;
  const b = 0.8;
  for (let i = 0, p = 0; i < alpha.length; i++, p += 4) {
    let t = (d[p] / 255 - a) / (b - a);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    alpha[i] = Math.round(t * t * (3 - 2 * t) * 255);
  }
  return alpha;
}

function bbox(alpha, w, h, threshold = 26) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  let count = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (alpha[row + x] > threshold) {
        count++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, count };
}

function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

export function nameColor(r, g, b) {
  const [h, s, v] = rgbToHsv(r, g, b);
  if (v < 0.17 || (v < 0.3 && s < 0.4)) return 'black';
  if (s < 0.09) return v > 0.68 ? 'white' : 'grey';
  if (s < 0.2) {
    // Бледные оттенки: выстиранный голубой, молочный, серо-бежевый.
    if (h >= 185 && h < 260) return v > 0.5 ? 'lightblue' : 'grey';
    if (h >= 20 && h < 75) return v > 0.6 ? (s < 0.13 && v > 0.8 ? 'white' : 'beige') : 'grey';
    return v > 0.75 ? 'white' : 'grey';
  }
  if (h >= 18 && h < 65 && s < 0.38) return v > 0.55 ? 'beige' : 'brown';
  if (h >= 8 && h < 45 && v < 0.62) return 'brown';
  if ((h < 8 || h >= 345) && v < 0.4) return 'brown';
  if (h < 14 || h >= 345) return s < 0.45 && v > 0.7 ? 'pink' : 'red';
  if (h >= 325 && s > 0.55) return 'red'; // малиновый
  if (h < 40) return 'orange';
  if (h < 65) return 'yellow';
  if (h < 105 && s < 0.55 && v < 0.6) return 'khaki';
  if (h < 165) return 'green';
  if (h < 195) return v < 0.45 ? 'green' : 'lightblue';
  if (h < 255) {
    if (v < 0.36) return 'navy';
    if (v > 0.72 && s < 0.5) return 'lightblue';
    return 'blue';
  }
  if (h < 295) return 'purple';
  return v > 0.6 ? 'pink' : 'purple';
}

function dominantColor(data, alpha, w, h) {
  const tally = {};
  const lights = []; // яркость бесцветных точек: по ней отличаем белое от серого
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 20000)));
  let n = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = y * w + x;
      if (alpha[i] < 230) continue;
      const p = i * 4;
      let name = nameColor(data[p], data[p + 1], data[p + 2]);
      if (name === 'white' || name === 'grey') {
        lights.push(Math.max(data[p], data[p + 1], data[p + 2]) / 255);
        name = 'plain';
      }
      tally[name] = (tally[name] || 0) + 1;
      n++;
    }
  }
  if (!n) return null;
  const best = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
  if (best !== 'plain') return best;
  // Белая вещь на фото в тени выглядит серой, но её светлые участки всё равно яркие.
  lights.sort((a, b) => a - b);
  return lights[Math.floor(lights.length * 0.8)] >= 0.74 ? 'white' : 'grey';
}

function softmax(arr) {
  let max = -Infinity;
  for (const v of arr) if (v > max) max = v;
  const e = Array.from(arr, (v) => Math.exp(v - max));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / sum);
}

// Цвет уже вырезанной картинки (для проверки и пересчёта).
export function colorOfImage(img) {
  const k = Math.min(1, 320 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = makeCanvas(img.naturalWidth * k, img.naturalHeight * k);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const alpha = new Uint8ClampedArray(c.width * c.height);
  for (let i = 0, p = 3; i < alpha.length; i++, p += 4) alpha[i] = d[p];
  const name = dominantColor(d, alpha, c.width, c.height);
  free(c);
  return name;
}

function interpret({ clothes, imagenet }) {
  const p = softmax(clothes);
  let best = 0;
  for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
  let [group, type] = CLOTHES_LABELS[CLOTHES_ORDER[best]];
  let conf = p[best];

  const q = softmax(imagenet);
  let hintIdx = -1;
  let hintP = 0;
  for (const key of Object.keys(IMAGENET_HINTS)) {
    const i = Number(key);
    if (q[i] > hintP) {
      hintP = q[i];
      hintIdx = i;
    }
  }
  if (hintIdx >= 0) {
    const hint = IMAGENET_HINTS[hintIdx];
    // Подсказка заменяет категорию, только когда основная модель сама не уверена.
    if (hint.kind === 'new' && hintP > 0.5 && conf < 0.7) {
      group = hint.group;
      type = hint.type;
      conf = hintP;
    } else if (hint.kind === 'refine' && hint.group === group && hintP > 0.3) {
      type = hint.type;
    }
  }
  return { group, type, conf };
}

/**
 * Полная обработка одного фото.
 * options.fine — точная (медленная) модель; options.keepBackground — не вырезать.
 */
export async function processPhoto(blob, options = {}) {
  const stage = options.onStage || (() => {});
  stage('Открываю фото');
  const work = await decodeToCanvas(blob);
  const w = work.width;
  const h = work.height;
  const ctx = work.getContext('2d', { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, w, h);
  const data = image.data;

  let transparent = 0;
  for (let p = 3; p < data.length; p += 16) if (data[p] < 16) transparent++;
  const alreadyCut = transparent / (data.length / 16) > 0.03;

  // Оригинал храним, чтобы можно было переделать вырезание.
  let origBlob = null;
  if (!options.skipOrig) {
    origBlob = alreadyCut ? await toBlob(work, 'image/png') : await toBlob(work, 'image/jpeg', 0.82);
  }

  let alpha;
  let cut = true;
  if (options.keepBackground) {
    alpha = new Uint8ClampedArray(w * h).fill(255);
    cut = false;
  } else if (alreadyCut) {
    alpha = new Uint8ClampedArray(w * h);
    for (let i = 0, p = 3; i < alpha.length; i++, p += 4) alpha[i] = data[p];
  } else {
    stage(options.fine ? 'Вырезаю точнее' : 'Убираю фон');
    const fine = !!options.fine;
    const n = fine ? 1024 : 320;
    const input = toTensor(work, n, fine ? 'isnet' : 'u2net');
    const { mask } = await ml.cutout(input, fine);
    dropSpecks(normalizeMask(mask), n);
    alpha = maskToAlpha(mask, n, w, h);
  }

  let box = bbox(alpha, w, h);
  if (!box || box.count < w * h * 0.004) {
    // Модель ничего не нашла — оставляем фото как есть.
    alpha = new Uint8ClampedArray(w * h).fill(255);
    box = { x: 0, y: 0, w, h, count: w * h };
    cut = false;
  }

  for (let i = 0, p = 3; i < alpha.length; i++, p += 4) data[p] = alpha[i];
  const color = dominantColor(data, alpha, w, h);
  ctx.putImageData(image, 0, 0);

  const pad = cut ? Math.round(Math.max(box.w, box.h) * 0.02) : 0;
  const cx = Math.max(0, box.x - pad);
  const cy = Math.max(0, box.y - pad);
  const cw = Math.min(w, box.x + box.w + pad) - cx;
  const ch = Math.min(h, box.y + box.h + pad) - cy;

  const render = (side) => {
    const k = Math.min(1, side / Math.max(cw, ch));
    const c = makeCanvas(cw * k, ch * k);
    const cctx = c.getContext('2d');
    cctx.imageSmoothingQuality = 'high';
    cctx.drawImage(work, cx, cy, cw, ch, 0, 0, c.width, c.height);
    return c;
  };
  const fullC = render(FULL_SIDE);
  const thumbC = render(THUMB_SIDE);
  const [full, thumb] = await Promise.all([encodeCutout(fullC), encodeCutout(thumbC)]);

  let guess = null;
  if (!options.skipClassify) {
    stage('Определяю категорию');
    try {
      // Вещь на белом фоне в квадрате — так же готовились примеры для обучения.
      const side = Math.round(Math.max(cw, ch) * 1.08);
      const sq = makeCanvas(256, 256);
      const sctx = sq.getContext('2d');
      sctx.fillStyle = '#fff';
      sctx.fillRect(0, 0, 256, 256);
      sctx.imageSmoothingQuality = 'high';
      const k = 256 / side;
      sctx.drawImage(work, cx, cy, cw, ch, ((side - cw) / 2) * k, ((side - ch) / 2) * k, cw * k, ch * k);
      const input = toTensor(sq, 224, 'imagenet');
      free(sq);
      guess = interpret(await ml.classify(input));
    } catch (err) {
      console.warn('classify failed', err);
    }
  }

  const result = { full, thumb, orig: origBlob, color, guess, cut, ratio: cw / ch };
  free(work, fullC, thumbC);
  return result;
}

// Превью образа: рисуем слои на холсте.
export async function renderOutfit(layers, getImage, width = 600, height = 800) {
  const c = makeCanvas(width, height);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  for (const layer of [...layers].sort((a, b) => a.z - b.z)) {
    const img = await getImage(layer.itemId);
    if (!img) continue;
    const lw = layer.w * width;
    const lh = lw / (img.naturalWidth / img.naturalHeight);
    ctx.save();
    ctx.translate(layer.x * width, layer.y * height);
    ctx.rotate(((layer.rot || 0) * Math.PI) / 180);
    ctx.drawImage(img, -lw / 2, -lh / 2, lw, lh);
    ctx.restore();
  }
  const blob = await encodeCutout(c);
  free(c);
  return blob;
}
