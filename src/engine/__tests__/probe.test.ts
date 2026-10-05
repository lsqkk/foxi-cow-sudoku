import { describe, it } from 'vitest';
import { growRegions, isRegionConnected, randomSolution, validateColorAssignment } from '../board';
import { mulberry32 } from '../rng';
import { __debug, analyzePuzzle, applyDeductionInState, hasContradiction, runLadder } from '../solver';
import { repairToUnique } from '../generator';
import { extractFeatures, scorePuzzle } from '../difficulty';
import type { ShapeStyle } from '../types';
import { createState, propagateBasic } from '../solver';

const SHOW = process.env.SHOW_DIST === '1';

function gridString(colors: number[][]): string {
  return colors.map((row) => row.map((k) => (k < 0 ? '?' : k.toString(36))).join(' ')).join('\n');
}

describe('生成探针', () => {
  it('打印唯一性修复的过程', () => {
    for (const [n, style] of [
      [6, { small: 0.6, giant: 0.5, segments: 0.5, crosses: 0.25, compactness: 0.9 }],
      [8, { small: 0.6, giant: 0.5, segments: 0.42, crosses: 0.18, compactness: 0.8 }],
      [10, { small: 0.6, giant: 0.5, segments: 0.32, crosses: 0.15, compactness: 0.65 }],
    ] as [number, ShapeStyle][]) {
      for (let seed = 1; seed <= 6; seed++) {
        const rng = mulberry32(seed * 7919 + n * 31);
        const sol = randomSolution(n, rng);
        const raw = growRegions(n, sol, style, rng);
        if (!validateColorAssignment(n, raw, sol)) continue;
        const rep = repairToUnique(n, sol, raw, rng, { nodeLimit: 40_000, maxRepairs: 24 });
        console.log(`\nn=${n} seed=${seed} 修好=${rep.unique} 步数=${rep.repairs}\n  ${rep.trace.join('\n  ')}`);
      }
    }
  });

  it('打印一关的推理过程，看看卡在哪里', () => {
    const n = 6;
    const style: ShapeStyle = { small: 0.6, giant: 0.5, segments: 0.5, crosses: 0.25, compactness: 0.9 };
    const rng = mulberry32(20250101);
    const sol = randomSolution(n, rng);
    const colors = growRegions(n, sol, style, rng);
    console.log(`\n真解 ${sol.join(',')} 合法=${validateColorAssignment(n, colors, sol)}\n${gridString(colors)}`);
    const ladder = runLadder({ n, colors }, { collectDeductions: true, maxSteps: 100 });
    console.log(
      `解出=${ladder.solved} 步数=${ladder.steps} 完成度=${(ladder.state.placed / n).toFixed(2)} 技术=${JSON.stringify(
        ladder.techniqueCounts,
      )}`,
    );
    for (const d of ladder.deductions) console.log(`  [${d.tier}] ${d.technique} ${d.text}`);
    // 手工重放，逐步检查是否出现矛盾（用于定位不可靠的推理）
    const s = createState(n, colors);
    propagateBasic(s);
    for (let step = 1; step <= 40; step++) {
      if (hasContradiction(s)) {
        const badRows = Array.from(s.rowCount).flatMap((v, i) => (v === 0 && !s.rowCells[i].some((c) => s.cow[c]) ? [i] : []));
        const badCols = Array.from(s.colCount).flatMap((v, i) => (v === 0 && !s.colCells[i].some((c) => s.cow[c]) ? [i] : []));
        const badColors = Array.from(s.colorCount).flatMap((v, i) => (v === 0 && !s.colorCells[i].some((c) => s.cow[c]) ? [i] : []));
        console.log(`第 ${step} 步前出现矛盾：行 ${badRows} 列 ${badCols} 颜色 ${badColors}`);
        break;
      }
      const d = __debug.techniques.nextLadderStep(s);
      if (!d) {
        console.log(`第 ${step} 步没有任何技术可用（真卡住）`);
        break;
      }
      console.log(`  第${step}步 [${d.tier}] ${d.technique} ${d.text}`);
      applyDeductionInState(s, d);
    }
  });

  it('找出颜色划分的失败案例', () => {
    const styles: ShapeStyle[] = [
      { small: 0.6, giant: 0.5, segments: 0.5, crosses: 0.25, compactness: 0.9 },
      { small: 0.6, giant: 0.5, segments: 0.32, crosses: 0.15, compactness: 0.65 },
      { small: 0.6, giant: 0.5, segments: 0.15, crosses: 0.08, compactness: 0.35 },
      { small: 0.6, giant: 0.5, segments: 0, crosses: 0, compactness: 0.2 },
    ];
    let failures = 0;
    for (let n = 5; n <= 11 && failures < 3; n++) {
      for (const style of styles) {
        for (let seed = 1; seed <= 6; seed++) {
          const rng = mulberry32(seed * 104729 + n * 31 + Math.round(style.compactness * 100));
          const sol = randomSolution(n, rng);
          const colors = growRegions(n, sol, style, rng);
          if (validateColorAssignment(n, colors, sol)) continue;
          failures++;
          const sizes = new Array(n).fill(0);
          for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (colors[r][c] >= 0) sizes[colors[r][c]]++;
          console.log(
            `\nn=${n} style=${JSON.stringify(style)} seed=${seed} 解=${sol.join(',')}\n` +
              gridString(colors) +
              `\n区域大小 ${sizes.join(',')} 连通性 ${sizes.map((_, k) => (isRegionConnected(n, colors, k) ? 1 : 0)).join('')}`,
          );
          if (failures >= 3) break;
        }
      }
    }
    if (SHOW) console.log(`\n失败样本 ${failures}`);
  });

  it('唯一率与逻辑推进统计', () => {
    const styles: [string, ShapeStyle][] = [
      ['入门型', { small: 0.6, giant: 0.5, segments: 0.5, crosses: 0.25, compactness: 0.9 }],
      ['简单型', { small: 0.6, giant: 0.5, segments: 0.42, crosses: 0.18, compactness: 0.8 }],
      ['中等型', { small: 0.6, giant: 0.5, segments: 0.32, crosses: 0.15, compactness: 0.65 }],
      ['困难型', { small: 0.6, giant: 0.5, segments: 0.21, crosses: 0.1, compactness: 0.47 }],
      ['大师型', { small: 0.6, giant: 0.5, segments: 0.08, crosses: 0.045, compactness: 0.22 }],
    ];
    for (const n of [6, 8, 10, 12]) {
      const parts: string[] = [];
      for (const [name, style] of styles) {
        let unique = 0;
        let logicSolved = 0;
        let progressSum = 0;
        let stepsSum = 0;
        let repairedToUnique = 0;
        let scoreSum = 0;
        let msSum = 0;
        const total = 24;
        for (let seed = 1; seed <= total; seed++) {
          const rng = mulberry32(seed * 7919 + n * 31 + Math.round(style.compactness * 100));
          const sol = randomSolution(n, rng);
          const colors = growRegions(n, sol, style, rng);
          if (!validateColorAssignment(n, colors, sol)) continue;
          const t0 = Date.now();
          const repaired = repairToUnique(n, sol, colors, rng, { nodeLimit: 40_000, maxRepairs: 24 });
          msSum += Date.now() - t0;
          if (!repaired.unique) continue;
          repairedToUnique++;
          const metrics = analyzePuzzle({ n, colors: repaired.colors, solution: sol }, { nodeLimit: 40_000 });
          if (!metrics.unique) continue;
          unique++;
          scoreSum += scorePuzzle(extractFeatures(n, repaired.colors, metrics), metrics);
          const ladder = runLadder({ n, colors: repaired.colors });
          if (ladder.solved) logicSolved++;
          progressSum += ladder.state.placed / n;
          stepsSum += ladder.steps;
        }
        parts.push(
          `${name} 修好${((repairedToUnique / total) * 100).toFixed(0)}% 逻辑解出${(
            (logicSolved / Math.max(1, unique)) *
            100
          ).toFixed(0)}% 推进${(progressSum / Math.max(1, unique)).toFixed(2)} 分${(scoreSum / Math.max(1, unique)).toFixed(
            1,
          )} ${(msSum / total).toFixed(0)}ms`,
        );
      }
      console.log(`\nn=${n}: ${parts.join(' | ')}`);
    }
  });
});
