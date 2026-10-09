// Связь с потоком, где работают нейросети.

let worker = null;
let seq = 0;
const pending = new Map();
const progressListeners = new Set();

function ensure() {
  if (worker) return worker;
  worker = new Worker(new URL('./ml-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'progress') {
      for (const fn of progressListeners) fn(m);
      return;
    }
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error));
    else p.resolve(m.result);
  };
  worker.onerror = (e) => {
    const err = new Error(e.message || 'Сбой при обработке фото');
    for (const p of pending.values()) p.reject(err);
    pending.clear();
    worker.terminate();
    worker = null;
  };
  return worker;
}

function call(op, payload, transfer = []) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ensure().postMessage({ id, op, payload }, transfer);
  });
}

export const ml = {
  warmup: (names = ['cutout', 'classify']) => call('warmup', { names }),
  cutout: (input, fine = false) => call('cutout', { input, fine }, [input.buffer]),
  classify: (input) => call('classify', { input }, [input.buffer]),
  onProgress(fn) {
    progressListeners.add(fn);
    return () => progressListeners.delete(fn);
  },
};
