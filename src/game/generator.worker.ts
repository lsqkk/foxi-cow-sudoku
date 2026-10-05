/// <reference lib="webworker" />
import { buildPuzzle, type LevelSpec } from './levels';

/** 在 Worker 里生成关卡，避免最难关卡卡住界面 */
self.onmessage = (e: MessageEvent<{ id: number; spec: LevelSpec }>) => {
  const { id, spec } = e.data;
  try {
    const puzzle = buildPuzzle(spec);
    self.postMessage({ id, ok: true, puzzle });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err) });
  }
};
