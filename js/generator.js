// 關卡產生器：先產生一定有解的答案，再切成方塊、隨機旋轉。
(function (SB) {
  'use strict';

  const MIN = 1;
  const MAX = 9;
  const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];

  // sizeWeights：方塊大小 1、2、3 格的出現比重
  SB.DIFFICULTIES = {
    easy: { label: '簡單', size: 3, seeds: 2, sizeWeights: [2, 5, 3] },
    medium: { label: '中等', size: 4, seeds: 1, sizeWeights: [1, 4, 5] },
    hard: { label: '困難', size: 5, seeds: 1, sizeWeights: [1, 3, 6] },
  };

  // 固定種子的亂數，讓同一關每次都產生同一題
  function mulberry32(a) {
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

  function shuffle(rng, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function weightedIndex(rng, weights) {
    let x = rng() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < weights.length; i++) {
      x -= weights[i];
      if (x < 0) return i;
    }
    return weights.length - 1;
  }

  // 方塊形狀：[{dr, dc, v}]，平移到左上角為 (0, 0)，保持原本順序
  function normalize(cells) {
    const minR = Math.min(...cells.map((c) => c.dr));
    const minC = Math.min(...cells.map((c) => c.dc));
    return cells.map((c) => ({ dr: c.dr - minR, dc: c.dc - minC, v: c.v }));
  }

  // 順時針旋轉 90°
  function rotateCW(cells) {
    return normalize(cells.map((c) => ({ dr: c.dc, dc: -c.dr, v: c.v })));
  }

  // 由左上角逐格填：每格只看左邊和上面。
  // 兩個鄰格一樣 → 可填 ±1；差 2 → 只能填中間。因奇偶性，永遠填得下去。
  function generateSolution(n, rng) {
    for (;;) {
      const g = [];
      let ok = true;
      for (let r = 0; r < n && ok; r++) {
        g.push([]);
        for (let c = 0; c < n; c++) {
          let options;
          if (r === 0 && c === 0) {
            options = [randInt(rng, 3, 7)];
          } else {
            const near = [];
            if (c > 0) near.push(g[r][c - 1]);
            if (r > 0) near.push(g[r - 1][c]);
            options = [near[0] - 1, near[0] + 1].filter(
              (v) => v >= MIN && v <= MAX && near.every((u) => Math.abs(u - v) === 1)
            );
          }
          if (!options.length) {
            ok = false;
            break;
          }
          let v = options[0];
          if (options.length === 2) {
            // 稍微偏向 5，讓數字留在 1～9 之間
            const [a, b] = options;
            const da = Math.abs(a - 5);
            const db = Math.abs(b - 5);
            if (da === db) v = pick(rng, options);
            else v = rng() < 0.65 ? (da < db ? a : b) : da < db ? b : a;
          }
          g[r].push(v);
        }
      }
      if (ok) return g;
    }
  }

  function pickSeeds(n, count, rng) {
    const cells = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) cells.push([r, c]);
    shuffle(rng, cells);
    const seeds = [cells[0]];
    for (const cell of cells.slice(1)) {
      if (seeds.length >= count) break;
      // 種子之間不相鄰，提示才有意義
      if (seeds.every(([r, c]) => Math.abs(r - cell[0]) + Math.abs(c - cell[1]) >= 2)) seeds.push(cell);
    }
    return seeds;
  }

  // 把非種子格切成 1～3 格的方塊
  function cutPieces(n, isSeed, weights, rng) {
    const owner = Array.from({ length: n }, () => Array(n).fill(-1));
    const cells = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) cells.push([r, c]);
    const groups = [];
    for (const [r, c] of shuffle(rng, cells)) {
      if (isSeed[r][c] || owner[r][c] >= 0) continue;
      const id = groups.length;
      const target = weightedIndex(rng, weights) + 1;
      const group = [[r, c]];
      owner[r][c] = id;
      while (group.length < target) {
        const frontier = [];
        for (const [pr, pc] of group) {
          for (const [dr, dc] of DIRS) {
            const nr = pr + dr;
            const nc = pc + dc;
            if (nr >= 0 && nr < n && nc >= 0 && nc < n && !isSeed[nr][nc] && owner[nr][nc] < 0) frontier.push([nr, nc]);
          }
        }
        if (!frontier.length) break;
        const [nr, nc] = pick(rng, frontier);
        owner[nr][nc] = id;
        group.push([nr, nc]);
      }
      // 想長大卻被困住的單格：併入旁邊還沒滿 3 格的方塊
      if (group.length === 1 && target > 1) {
        const hosts = DIRS.map(([dr, dc]) => [r + dr, c + dc])
          .filter(([nr, nc]) => nr >= 0 && nr < n && nc >= 0 && nc < n && owner[nr][nc] >= 0)
          .map(([nr, nc]) => owner[nr][nc])
          .filter((h) => groups[h].length < 3);
        if (hosts.length) {
          const h = pick(rng, hosts);
          owner[r][c] = h;
          groups[h].push([r, c]);
          continue;
        }
      }
      groups.push(group);
    }
    return groups;
  }

  function generatePuzzle(difficulty, level) {
    const cfg = SB.DIFFICULTIES[difficulty];
    const keyIndex = Object.keys(SB.DIFFICULTIES).indexOf(difficulty);
    const rng = mulberry32(level * 7919 + keyIndex * 104729 + 12345);
    const n = cfg.size;

    const solution = generateSolution(n, rng);
    const seedCells = pickSeeds(n, cfg.seeds, rng);
    const isSeed = Array.from({ length: n }, () => Array(n).fill(false));
    for (const [r, c] of seedCells) isSeed[r][c] = true;

    const pieces = cutPieces(n, isSeed, cfg.sizeWeights, rng).map((group, id) => {
      const sol = group.map(([r, c]) => ({ r, c, v: solution[r][c] }));
      let cells = normalize(sol.map((s) => ({ dr: s.r, dc: s.c, v: s.v })));
      for (let k = randInt(rng, 0, 3); k > 0; k--) cells = rotateCW(cells);
      return { id, solution: sol, cells };
    });

    return {
      n,
      solution,
      seeds: seedCells.map(([r, c]) => ({ r, c, v: solution[r][c] })),
      pieces: shuffle(rng, pieces),
    };
  }

  SB.normalize = normalize;
  SB.rotateCW = rotateCW;
  SB.generatePuzzle = generatePuzzle;
})((window.SB = window.SB || {}));
