// 遊戲本體：拖放、旋轉、判定、衝突標紅、提示。
(function (SB) {
  'use strict';

  const DRAG_THRESHOLD = 6;

  const hueOf = (v) => ((v - 1) * 38 + 200) % 360;
  const key = (r, c) => `${r},${c}`;
  const sfx = (name) => SB.sound && SB.sound.play(name);

  // 格位邊長 = 方塊最長的一邊，旋轉後不變
  const slotSize = (p) =>
    Math.max(Math.max(...p.cells.map((c) => c.dc)), Math.max(...p.cells.map((c) => c.dr))) + 1;

  class Game {
    constructor(els, puzzle, hooks) {
      this.boardEl = els.board;
      this.trayEl = els.tray;
      this.hooks = hooks;
      this.n = puzzle.n;
      this.seeds = puzzle.seeds;
      this.pieces = puzzle.pieces.map((p) => ({
        id: p.id,
        solution: p.solution,
        cells: p.cells.map((c) => ({ ...c })),
        at: null, // 放在棋盤上時為 {r, c}（方塊左上角位置）
      }));
      this.moves = 0;
      this.hints = 0;
      this.won = false;
      this.drag = null;
      this.flash = null;

      this._onDown = (e) => this.onDown(e);
      this._onMove = (e) => this.onMove(e);
      this._onUp = (e) => this.onUp(e);
      this.boardEl.addEventListener('pointerdown', this._onDown);
      this.trayEl.addEventListener('pointerdown', this._onDown);
      this.render();
    }

    destroy() {
      this.boardEl.removeEventListener('pointerdown', this._onDown);
      this.trayEl.removeEventListener('pointerdown', this._onDown);
      this.stopListening();
      if (this.drag && this.drag.ghost) this.drag.ghost.remove();
      this.drag = null;
    }

    byId(id) {
      return this.pieces.find((p) => p.id === id);
    }

    // ---------- 盤面狀態 ----------

    grid(except) {
      const g = Array.from({ length: this.n }, () => Array(this.n).fill(null));
      for (const s of this.seeds) g[s.r][s.c] = { v: s.v, seed: true };
      for (const p of this.pieces) {
        if (!p.at || p === except) continue;
        for (const c of p.cells) g[p.at.r + c.dr][p.at.c + c.dc] = { v: c.v, piece: p.id };
      }
      return g;
    }

    fits(piece, cells, at) {
      const g = this.grid(piece);
      return cells.every((c) => {
        const r = at.r + c.dr;
        const col = at.c + c.dc;
        return r >= 0 && r < this.n && col >= 0 && col < this.n && !g[r][col];
      });
    }

    // 相鄰兩格都有數字、但不是剛好差 1
    conflicts(g) {
      const cells = new Set();
      let pairs = 0;
      for (let r = 0; r < this.n; r++) {
        for (let c = 0; c < this.n; c++) {
          if (!g[r][c]) continue;
          for (const [nr, nc] of [[r, c + 1], [r + 1, c]]) {
            if (nr >= this.n || nc >= this.n || !g[nr][nc]) continue;
            if (Math.abs(g[r][c].v - g[nr][nc].v) !== 1) {
              pairs++;
              cells.add(key(r, c));
              cells.add(key(nr, nc));
            }
          }
        }
      }
      return { cells, pairs };
    }

    atSolution(p) {
      return (
        !!p.at &&
        p.cells.every((c) =>
          p.solution.some((s) => s.r === p.at.r + c.dr && s.c === p.at.c + c.dc && s.v === c.v)
        )
      );
    }

    // ---------- 畫面 ----------

    fillCell(el, v) {
      el.classList.add('filled');
      el.textContent = v;
      el.style.setProperty('--h', hueOf(v));
    }

    pieceEl(p) {
      const el = document.createElement('div');
      el.className = 'piece';
      el.dataset.piece = p.id;
      const w = Math.max(...p.cells.map((c) => c.dc)) + 1;
      const h = Math.max(...p.cells.map((c) => c.dr)) + 1;
      el.style.gridTemplateColumns = `repeat(${w}, var(--pc, var(--cell)))`;
      el.style.gridTemplateRows = `repeat(${h}, var(--pc, var(--cell)))`;
      const has = new Set(p.cells.map((c) => key(c.dr, c.dc)));
      for (const c of p.cells) {
        const cell = document.createElement('div');
        cell.className = 'cell movable';
        cell.dataset.dr = c.dr;
        cell.dataset.dc = c.dc;
        cell.style.gridRow = c.dr + 1;
        cell.style.gridColumn = c.dc + 1;
        this.fillCell(cell, c.v);
        if (has.has(key(c.dr, c.dc + 1))) cell.classList.add('jr');
        if (has.has(key(c.dr + 1, c.dc))) cell.classList.add('jb');
        el.append(cell);
      }
      return el;
    }

    render() {
      const n = this.n;
      const g = this.grid();
      const bad = this.conflicts(g);

      this.boardEl.style.gridTemplateColumns = `repeat(${n}, var(--cell))`;
      this.boardEl.replaceChildren();
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const el = document.createElement('div');
          el.className = 'cell';
          el.dataset.r = r;
          el.dataset.c = c;
          const x = g[r][c];
          if (x) {
            this.fillCell(el, x.v);
            if (x.seed) {
              el.classList.add('seed');
              el.title = '種子（固定）';
            } else {
              el.classList.add('movable');
              el.dataset.piece = x.piece;
              if (c + 1 < n && g[r][c + 1] && g[r][c + 1].piece === x.piece) el.classList.add('jr');
              if (r + 1 < n && g[r + 1][c] && g[r + 1][c].piece === x.piece) el.classList.add('jb');
              if (this.flash === x.piece) el.classList.add('flash');
            }
            if (bad.cells.has(key(r, c))) el.classList.add('bad');
          }
          this.boardEl.append(el);
        }
      }
      this.flash = null;

      // 每個方塊有固定的正方形格位；放上棋盤後格位留空，旋轉也不會移動
      this.trayEl.replaceChildren(
        ...this.pieces.map((p) => {
          const slot = document.createElement('div');
          slot.className = 'slot';
          slot.style.setProperty('--k', slotSize(p));
          if (p.at) slot.classList.add('empty');
          else slot.append(this.pieceEl(p));
          return slot;
        })
      );

      this.hooks.onChange({
        moves: this.moves,
        hints: this.hints,
        conflicts: bad.pairs,
        remaining: this.pieces.filter((p) => !p.at).length,
      });
    }

    // 依格位數量縮小方塊區的格子，讓全部方塊不用捲動就看得到；回傳是否放得下。
    // 格位整局固定，所以只在開局和畫面大小改變時計算
    fitTray() {
      const tray = this.trayEl;
      const { cell, gap } = this.metrics();
      const cs = getComputedStyle(tray);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) * 2;
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) * 2;
      const availW = tray.clientWidth - (padX - parseFloat(cs.borderLeftWidth) * 2) - 1;
      const top = tray.getBoundingClientRect().top + window.scrollY;
      const availH = window.innerHeight - top - padY - 12;
      const dims = this.pieces.map((p) => ({ w: slotSize(p), h: slotSize(p) }));

      const sizing = (s) => {
        const g = Math.max(3, Math.round((gap * s) / cell));
        return { s, g, space: Math.max(8, Math.round(s * 0.3)) };
      };
      // 模擬 flex-wrap 排版，算出總高度
      const heightAt = ({ s, g, space }) => {
        let rowW = 0;
        let rowH = 0;
        let total = 0;
        for (const d of dims) {
          const w = d.w * s + (d.w - 1) * g;
          const h = d.h * s + (d.h - 1) * g;
          if (rowW > 0 && rowW + space + w > availW) {
            total += rowH + space;
            rowW = 0;
            rowH = 0;
          }
          rowW += (rowW > 0 ? space : 0) + w;
          rowH = Math.max(rowH, h);
        }
        return total + rowH;
      };

      const MIN = 28;
      let best = sizing(MIN);
      let fits = false;
      for (let s = Math.floor(cell); s >= MIN; s--) {
        const z = sizing(s);
        if (heightAt(z) <= availH) {
          best = z;
          fits = true;
          break;
        }
      }
      tray.style.setProperty('--tcell', `${best.s}px`);
      tray.style.setProperty('--tgap', `${best.g}px`);
      tray.style.setProperty('--tspace', `${best.space}px`);
      return fits;
    }

    // ---------- 操作 ----------

    onDown(e) {
      if (this.won || this.drag || e.button > 0) return;
      const cellEl = e.target.closest('.cell.movable');
      if (!cellEl) return;
      let piece;
      let grab;
      const wrap = cellEl.closest('.piece');
      if (wrap) {
        piece = this.byId(+wrap.dataset.piece);
        grab = { dr: +cellEl.dataset.dr, dc: +cellEl.dataset.dc };
      } else {
        piece = this.byId(+cellEl.dataset.piece);
        grab = { dr: +cellEl.dataset.r - piece.at.r, dc: +cellEl.dataset.c - piece.at.c };
      }
      e.preventDefault();
      this.drag = { piece, grab, x0: e.clientX, y0: e.clientY, id: e.pointerId, active: false, ghost: null };
      window.addEventListener('pointermove', this._onMove);
      window.addEventListener('pointerup', this._onUp);
      window.addEventListener('pointercancel', this._onUp);
    }

    stopListening() {
      window.removeEventListener('pointermove', this._onMove);
      window.removeEventListener('pointerup', this._onUp);
      window.removeEventListener('pointercancel', this._onUp);
    }

    metrics() {
      const cell = this.boardEl.firstElementChild.getBoundingClientRect().width;
      const gap = parseFloat(getComputedStyle(this.boardEl).columnGap) || 0;
      return { cell, gap };
    }

    setLifted(id, on) {
      for (const el of this.boardEl.querySelectorAll(`[data-piece="${id}"]`)) el.classList.toggle('lifted', on);
      for (const el of this.trayEl.querySelectorAll(`[data-piece="${id}"]`)) el.classList.toggle('lifted', on);
    }

    // 指標下方的棋盤格 → 方塊左上角應放的位置
    dropTarget(e) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cellEl = el && el.closest('.cell[data-r]');
      if (!cellEl || !this.boardEl.contains(cellEl)) return { onBoard: false };
      const g = this.drag.grab;
      return { onBoard: true, at: { r: +cellEl.dataset.r - g.dr, c: +cellEl.dataset.c - g.dc } };
    }

    showPreview(target) {
      for (const el of this.boardEl.querySelectorAll('.preview')) el.classList.remove('preview');
      const p = this.drag.piece;
      if (!target.onBoard || !this.fits(p, p.cells, target.at)) return;
      for (const c of p.cells) {
        const el = this.boardEl.querySelector(`[data-r="${target.at.r + c.dr}"][data-c="${target.at.c + c.dc}"]`);
        if (el) el.classList.add('preview');
      }
    }

    onMove(e) {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      if (!d.active) {
        if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG_THRESHOLD) return;
        d.active = true;
        sfx('pick');
        this.acted();
        d.ghost = this.pieceEl(d.piece);
        d.ghost.classList.add('ghost');
        document.body.append(d.ghost);
        this.setLifted(d.piece.id, true);
      }
      const { cell, gap } = this.metrics();
      const x = e.clientX - d.grab.dc * (cell + gap) - cell / 2;
      const y = e.clientY - d.grab.dr * (cell + gap) - cell / 2;
      d.ghost.style.transform = `translate(${x}px, ${y}px)`;
      this.showPreview(this.dropTarget(e));
    }

    onUp(e) {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      this.stopListening();
      const released = e.type === 'pointerup';
      if (!d.active) {
        this.drag = null;
        if (released) this.rotate(d.piece, d.grab);
        return;
      }
      d.ghost.remove();
      const target = released ? this.dropTarget(e) : null;
      this.drag = null;
      const p = d.piece;
      let sound = 'thud';
      if (target && target.onBoard) {
        const same = p.at && p.at.r === target.at.r && p.at.c === target.at.c;
        if (same) {
          sound = 'place';
        } else if (this.fits(p, p.cells, target.at)) {
          const before = this.conflicts(this.grid()).pairs;
          p.at = target.at;
          this.moves++;
          sound = this.conflicts(this.grid()).pairs > before ? 'bad' : 'place';
        }
      } else if (target && p.at) {
        p.at = null; // 拖出棋盤 → 放回方塊區
      }
      this.render();
      if (!this.checkWin()) sfx(sound);
    }

    // 點一下旋轉 90°；在棋盤上時以點到的那一格為中心
    rotate(piece, grab) {
      const i = piece.cells.findIndex((c) => c.dr === grab.dr && c.dc === grab.dc);
      const cells = SB.rotateCW(piece.cells);
      if (piece.at) {
        const pivot = { r: piece.at.r + grab.dr - cells[i].dr, c: piece.at.c + grab.dc - cells[i].dc };
        if (this.fits(piece, cells, pivot)) piece.at = pivot;
        else if (!this.fits(piece, cells, piece.at)) piece.at = null;
      }
      piece.cells = cells;
      this.moves++;
      this.acted();
      this.render();
      if (!this.checkWin()) sfx('rotate');
    }

    hint() {
      if (this.won) return;
      const p = this.pieces.find((q) => !q.at) || this.pieces.find((q) => !this.atSolution(q));
      if (!p) return;
      const target = new Set(p.solution.map((s) => key(s.r, s.c)));
      for (const q of this.pieces) {
        if (q !== p && q.at && q.cells.some((c) => target.has(key(q.at.r + c.dr, q.at.c + c.dc)))) q.at = null;
      }
      const minR = Math.min(...p.solution.map((s) => s.r));
      const minC = Math.min(...p.solution.map((s) => s.c));
      p.cells = p.solution.map((s) => ({ dr: s.r - minR, dc: s.c - minC, v: s.v }));
      p.at = { r: minR, c: minC };
      this.hints++;
      this.acted();
      this.flash = p.id;
      this.render();
      if (!this.checkWin()) sfx('hint');
    }

    // 通知外部玩家有動作（第一次動作時開始計時）
    acted() {
      if (this.hooks.onAction) this.hooks.onAction();
    }

    checkWin() {
      const g = this.grid();
      const full = g.every((row) => row.every(Boolean));
      if (full && this.conflicts(g).pairs === 0) {
        this.won = true;
        sfx('win');
        this.hooks.onWin({ moves: this.moves, hints: this.hints });
      }
      return this.won;
    }
  }

  SB.Game = Game;
})((window.SB = window.SB || {}));
