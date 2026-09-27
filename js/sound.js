// 音效：用 Web Audio 即時合成柔和的木琴／泡泡聲，不需要音效檔，離線也能用。
(function (SB) {
  'use strict';

  const STORE_KEY = 'sequencebox-sound';
  let ctx = null;
  let enabled = true;
  try {
    enabled = localStorage.getItem(STORE_KEY) !== '0';
  } catch (e) {
    /* 無法讀取設定時預設開啟 */
  }

  // 手機瀏覽器要在使用者點擊時才能啟動聲音
  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
  }
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);

  // 木琴音色：基音加上一個很快消失的高泛音
  function mallet(freq, at, dur, vol) {
    const t = ctx.currentTime + at;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(ctx.destination);
    for (const [mult, level, decay] of [[1, 1, 1], [4, 0.25, 0.25]]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * mult, t);
      g.gain.setValueAtTime(level, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur * decay);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
  }

  // 泡泡／滑音：頻率從 f1 滑到 f2
  function glide(f1, f2, dur, vol, type) {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(f1, t);
    osc.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  const SOUNDS = {
    pick: () => glide(520, 760, 0.07, 0.12), // 拿起：輕輕的「嗒」
    rotate: () => glide(600, 980, 0.09, 0.1), // 旋轉：短促的「咻」
    place: () => mallet(880, 0, 0.18, 0.28), // 放上：清脆的「咔」
    bad: () => glide(220, 150, 0.22, 0.2, 'triangle'), // 出現紅框：低沉的「嘟」
    thud: () => glide(170, 110, 0.1, 0.18), // 放不下、彈回：輕輕的悶響
    hint: () => {
      mallet(1319, 0, 0.35, 0.18);
      mallet(1760, 0.08, 0.4, 0.14);
    }, // 提示：叮
    win: () => {
      [523, 659, 784].forEach((f, i) => mallet(f, i * 0.13, 0.3, 0.28));
      mallet(1047, 0.39, 0.7, 0.3);
    }, // 過關：Do Mi Sol Do
  };

  SB.sound = {
    play(name) {
      if (!enabled || !ctx || ctx.state !== 'running' || !SOUNDS[name]) return;
      try {
        SOUNDS[name]();
      } catch (e) {
        /* 音效失敗不影響遊戲 */
      }
    },
    get enabled() {
      return enabled;
    },
    setEnabled(on) {
      enabled = on;
      try {
        localStorage.setItem(STORE_KEY, on ? '1' : '0');
      } catch (e) {
        /* 無法存檔時只在這次有效 */
      }
    },
  };
})((window.SB = window.SB || {}));
