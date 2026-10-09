// Нейросети работают прямо на телефоне, в отдельном потоке: фото никуда не отправляются.
import * as ort from '../vendor/ort/ort.wasm.min.mjs';

ort.env.wasm.wasmPaths = new URL('../vendor/ort/', import.meta.url).href;
// Один поток и обычная (не общая) память: так стабильнее всего в Safari на iPhone.
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.logLevel = 'error';

const MODELS = {
  cutout: { url: '../models/u2netp.onnx', size: 320 },
  // Большая модель лежит тремя частями, чтобы каждая была меньше 50 МБ.
  cutoutFine: { url: '../models/isnet-fp16.onnx', parts: 3, bytes: 90447799, size: 1024 },
  classify: { url: '../models/clothes.onnx', size: 224 },
};

const sessions = {};
let fineTimer = null;

async function fetchBytes(url, name, base, grandTotal) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не удалось загрузить модель (${res.status})`);
  const total = grandTotal || Number(res.headers.get('content-length')) || 0;
  if (!res.body || !total) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    self.postMessage({ type: 'progress', name, loaded: Math.min(base + loaded, total), total });
  }
  return concat(chunks, loaded);
}

function concat(chunks, size) {
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

async function loadModel(name) {
  const m = MODELS[name];
  const url = new URL(m.url, import.meta.url).href;
  if (!m.parts) return fetchBytes(url, name, 0, 0);
  const pieces = [];
  let size = 0;
  for (let i = 0; i < m.parts; i++) {
    const piece = await fetchBytes(`${url}.part${i}`, name, size, m.bytes);
    pieces.push(piece);
    size += piece.length;
  }
  return concat(pieces, size);
}

function session(name) {
  if (!sessions[name]) {
    sessions[name] = (async () => {
      const bytes = await loadModel(name);
      return ort.InferenceSession.create(bytes, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
    })();
    sessions[name].catch(() => {
      delete sessions[name];
    });
  }
  return sessions[name];
}

async function release(name) {
  const p = sessions[name];
  if (!p) return;
  delete sessions[name];
  try {
    (await p).release();
  } catch {}
}

async function run(name, input) {
  const m = MODELS[name];
  const s = await session(name);
  const tensor = new ort.Tensor('float32', input, [1, 3, m.size, m.size]);
  const out = await s.run({ [s.inputNames[0]]: tensor });
  return { s, out };
}

const ops = {
  async warmup({ names }) {
    for (const n of names) await session(n);
    return {};
  },
  async cutout({ input, fine }) {
    const name = fine ? 'cutoutFine' : 'cutout';
    const { s, out } = await run(name, input);
    const mask = out[s.outputNames[0]].data;
    const copy = new Float32Array(mask);
    // Большую модель не держим в памяти долго: освобождаем, когда пачка фото закончилась.
    if (fine) {
      clearTimeout(fineTimer);
      fineTimer = setTimeout(() => release(name), 20000);
    }
    return { result: { mask: copy, size: MODELS[name].size }, transfer: [copy.buffer] };
  },
  async classify({ input }) {
    const { out } = await run('classify', input);
    const clothes = new Float32Array(out.clothes.data);
    const imagenet = new Float32Array(out.imagenet.data);
    return { result: { clothes, imagenet }, transfer: [clothes.buffer, imagenet.buffer] };
  },
};

self.onmessage = async (e) => {
  const { id, op, payload } = e.data;
  try {
    const r = await ops[op](payload || {});
    self.postMessage({ type: 'done', id, result: r.result || {} }, r.transfer || []);
  } catch (err) {
    self.postMessage({ type: 'done', id, error: String((err && err.message) || err) });
  }
};
