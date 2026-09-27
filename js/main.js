// 關卡選擇、進度存檔、畫面尺寸。
(function (SB) {
  'use strict';

  const STORE_KEY = 'sequencebox-progress-v1';
  const $ = (id) => document.getElementById(id);

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(progress));
    } catch (e) {
      /* 無法存檔時照常遊玩 */
    }
  }

  const progress = Object.assign({ diff: 'easy', easy: 1, medium: 1, hard: 1 }, load());
  if (!SB.DIFFICULTIES[progress.diff]) progress.diff = 'easy';

  let game = null;

  const MIN_BOARD_CELL = 30;

  function setCell(cell) {
    document.documentElement.style.setProperty('--cell', `${cell}px`);
  }

  // 依棋盤大小與螢幕寬度決定每格大小
  function layout(n) {
    const gap = 6;
    const pad = 10;
    const avail = Math.min(window.innerWidth, 520) - 32 - pad * 2;
    const cell = Math.max(MIN_BOARD_CELL, Math.min(68, Math.floor((avail - gap * (n - 1)) / n)));
    setCell(cell);
    document.documentElement.style.setProperty('--gap', `${gap}px`);
    return cell;
  }

  // 方塊區縮到最小還放不下時，再依畫面高度縮小棋盤
  function fitScreen() {
    let cell = layout(game.n);
    while (!game.fitTray() && cell > MIN_BOARD_CELL) {
      cell = Math.max(MIN_BOARD_CELL, cell - 2);
      setCell(cell);
    }
  }

  function renderTabs() {
    const tabs = $('tabs');
    tabs.replaceChildren();
    for (const [key, cfg] of Object.entries(SB.DIFFICULTIES)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.role = 'tab';
      b.textContent = `${cfg.label} ${cfg.size}×${cfg.size}`;
      b.setAttribute('aria-selected', key === progress.diff);
      b.addEventListener('click', () => {
        if (key === progress.diff) return;
        progress.diff = key;
        save();
        start();
      });
      tabs.append(b);
    }
  }

  function updateStatus(s) {
    $('moves').textContent = s.moves;
    let msg = '';
    if (s.conflicts) msg = `有 ${s.conflicts} 處相鄰數字沒有剛好差 1`;
    else if (s.remaining) msg = `還有 ${s.remaining} 個方塊`;
    $('msg').textContent = msg;
    $('msg').classList.toggle('warn', s.conflicts > 0);
  }

  function showWin(s) {
    progress[progress.diff]++;
    save();
    $('win-text').textContent = s.hints ? `步數 ${s.moves}，用了 ${s.hints} 次提示` : `步數 ${s.moves}，沒有用提示！`;
    $('win').hidden = false;
    $('btn-next').focus();
  }

  function start() {
    const diff = progress.diff;
    const level = progress[diff];
    const puzzle = SB.generatePuzzle(diff, level);
    layout(puzzle.n);
    if (game) game.destroy();
    $('win').hidden = true;
    $('level').textContent = `${SB.DIFFICULTIES[diff].label} · 第 ${level} 關`;
    renderTabs();
    game = new SB.Game({ board: $('board'), tray: $('tray') }, puzzle, { onChange: updateStatus, onWin: showWin });
    fitScreen();
  }

  $('btn-reset').addEventListener('click', start);
  $('btn-hint').addEventListener('click', () => game && game.hint());
  $('btn-next').addEventListener('click', start);
  window.addEventListener('resize', () => game && fitScreen());

  start();

  // PWA：註冊離線快取（用 file:// 直接開啟時略過）
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})((window.SB = window.SB || {}));
