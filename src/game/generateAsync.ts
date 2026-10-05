import type { Puzzle } from '../engine';
import { buildPuzzle, type LevelSpec } from './levels';

let worker: Worker | null = null;
let seq = 0;

function ensureWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./generator.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * 异步生成关卡：优先放到 Worker（不阻塞界面），
 * Worker 不可用（极老浏览器/测试环境）时退回主线程同步生成。
 */
export function generateAsync(spec: LevelSpec): Promise<Puzzle> {
  const w = ensureWorker();
  if (!w) {
    return new Promise((resolve) => {
      setTimeout(() => resolve(buildPuzzle(spec)), 16);
    });
  }
  const id = ++seq;
  return new Promise<Puzzle>((resolve, reject) => {
    const onMessage = (e: MessageEvent<{ id: number; ok: boolean; puzzle?: Puzzle; error?: string }>) => {
      if (e.data.id !== id) return;
      w.removeEventListener('message', onMessage);
      if (e.data.ok && e.data.puzzle) resolve(e.data.puzzle);
      else reject(new Error(e.data.error ?? '生成失败'));
    };
    w.addEventListener('message', onMessage);
    w.postMessage({ id, spec });
  }).catch(() => buildPuzzle(spec));
}
