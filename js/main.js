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

  const progress = Object.assign({ diff: 'easy', easy: 1, medium: 1, hard: 1, best: {} }, load());
  if (!SB.DIFFICULTIES[progress.diff]) progress.diff = 'easy';

  let game = null;

  const MIN_BOARD_CELL = 24;
  const COMPACT_BELOW = 40; // 棋盤格子小於這個大小時，間距和留白也一起縮小

  function setCell(cell) {
    document.documentElement.style.setProperty('--cell', `${cell}px`);
  }

  function setSpacing(gap, pad) {
    document.documentElement.style.setProperty('--gap', `${gap}px`);
    document.documentElement.style.setProperty('--bpad', `${pad}px`);
  }

  // 依棋盤大小與螢幕寬度決定每格大小
  function layout(n) {
    const gap = 6;
    const pad = 10;
    const avail = Math.min(window.innerWidth, 520) - 32 - pad * 2;
    const cell = Math.max(MIN_BOARD_CELL, Math.min(68, Math.floor((avail - gap * (n - 1)) / n)));
    setCell(cell);
    setSpacing(gap, pad);
    return cell;
  }

  // 方塊區縮到最小還放不下時，再依畫面高度縮小棋盤
  function fitScreen() {
    let cell = layout(game.n);
    while (!game.fitTray() && cell > MIN_BOARD_CELL) {
      cell = Math.max(MIN_BOARD_CELL, cell - 2);
      setCell(cell);
      if (cell < COMPACT_BELOW) setSpacing(4, 6);
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

  // ---------- 計時：第一次動作開始，離開 App 時暫停，過關時停止 ----------

  const timer = { elapsed: 0, since: null, started: false, done: false, tick: null };

  function now() {
    return timer.elapsed + (timer.since === null ? 0 : performance.now() - timer.since);
  }

  function fmt(ms) {
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const h = Math.floor(m / 60);
    const ss = String(sec % 60).padStart(2, '0');
    return h ? `${h}:${String(m % 60).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  }

  function showTime() {
    $('time').textContent = fmt(now());
  }

  function run() {
    if (timer.since !== null) return;
    timer.since = performance.now();
    timer.tick = setInterval(showTime, 250);
  }

  function pause() {
    if (timer.since === null) return;
    timer.elapsed = now();
    timer.since = null;
    clearInterval(timer.tick);
    showTime();
  }

  function resetTimer() {
    pause();
    Object.assign(timer, { elapsed: 0, started: false, done: false });
    showTime();
  }

  function onAction() {
    if (timer.started || timer.done) return;
    timer.started = true;
    run();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else if (timer.started && !timer.done) run();
  });

  function showWin(s) {
    pause();
    timer.done = true;
    const time = timer.elapsed;
    const diff = progress.diff;
    progress[diff]++;

    // 最佳紀錄：每個難度一筆，用了提示不列入
    const prev = progress.best[diff];
    let best = '';
    if (s.hints) {
      best = prev ? `最佳 ${fmt(prev)}（用了提示，不列入紀錄）` : '用了提示，不列入紀錄';
    } else if (!prev || time < prev) {
      progress.best[diff] = Math.round(time);
      best = prev ? `🏆 新紀錄！（原本 ${fmt(prev)}）` : '🏆 新紀錄！';
    } else {
      best = `最佳 ${fmt(prev)}`;
    }
    save();

    $('win-text').textContent = s.hints
      ? `用時 ${fmt(time)} · 步數 ${s.moves} · 提示 ${s.hints} 次`
      : `用時 ${fmt(time)} · 步數 ${s.moves} · 沒有用提示！`;
    $('win-best').textContent = best;
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
    resetTimer();
    game = new SB.Game({ board: $('board'), tray: $('tray') }, puzzle, { onChange: updateStatus, onWin: showWin, onAction });
    fitScreen();
  }

  function renderSound() {
    const on = SB.sound.enabled;
    $('btn-sound').textContent = on ? '🔊' : '🔇';
    $('btn-sound').setAttribute('aria-label', on ? '音效：開（點一下關閉）' : '音效：關（點一下開啟）');
  }

  $('btn-sound').addEventListener('click', () => {
    SB.sound.setEnabled(!SB.sound.enabled);
    renderSound();
    SB.sound.play('place');
  });
  renderSound();

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
