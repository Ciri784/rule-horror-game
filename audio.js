// Rule Horror — audio: everything is synthesized live with Web Audio.
// 沒有任何音檔:低頻 drone、日光燈電流聲、遠處的聲響全是現場合成。
// 玩家第一次撥動開關才建立 AudioContext(那個點擊同時滿足瀏覽器的
// autoplay 手勢要求);開關狀態存在 localStorage。
//
// core.js 只用到:setSceneSound / setDriftLevel / playCue / audioButtonEl。
// 模組在 Node 下可安全 import(所有瀏覽器 API 都藏在函式裡)。

const LS_KEY = "rule-horror:audio";

let ctx = null;              // AudioContext
let master = null;           // master GainNode
let layers = null;           // 常駐聲層:drone / room noise / fluorescent hum / shimmer
let ambientTimer = null;     // 隨機環境音排程
let currentTheme = undefined; // undefined = 尚未設定;null = 檔案室
let driftLvl = 0;
let on = false;
let btnEl = null;
let gestureArmed = false;
let flickerBuf = null;

try { on = localStorage.getItem(LS_KEY) === "on"; } catch {}

export function audioIsOn() { return on; }

// --- graph ---

function ensureGraph() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  // 低頻 drone:兩個微微失諧的正弦,拍頻讓人說不上哪裡不對。
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = 220;
  droneGain.connect(lp); lp.connect(master);
  const osc1 = ctx.createOscillator(); osc1.type = "sine"; osc1.frequency.value = 46;
  const osc2 = ctx.createOscillator(); osc2.type = "sine"; osc2.frequency.value = 46.6;
  osc1.connect(droneGain); osc2.connect(droneGain);
  osc1.start(); osc2.start();

  // 房間底噪:brown noise 過低通,像老建築的空調或遠處機房。
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf; noise.loop = true;
  const noiseLp = ctx.createBiquadFilter();
  noiseLp.type = "lowpass"; noiseLp.frequency.value = 380;
  const noiseGain = ctx.createGain(); noiseGain.gain.value = 0;
  noise.connect(noiseLp); noiseLp.connect(noiseGain); noiseGain.connect(master);
  noise.start();

  // 日光燈電流聲:市電 60Hz 的二次與四次諧波,夜班專屬。
  const humGain = ctx.createGain(); humGain.gain.value = 0;
  const h1 = ctx.createOscillator(); h1.type = "sine"; h1.frequency.value = 120;
  const h2 = ctx.createOscillator(); h2.type = "sine"; h2.frequency.value = 240;
  h1.connect(humGain); h2.connect(humGain);
  humGain.connect(master);
  h1.start(); h2.start();

  // drift-2 的高頻耳鳴感:幾乎聽不見,但頭皮會麻。
  const shimGain = ctx.createGain(); shimGain.gain.value = 0;
  const shim = ctx.createOscillator(); shim.type = "sine"; shim.frequency.value = 2360;
  shim.connect(shimGain); shimGain.connect(master);
  shim.start();

  layers = { droneGain, osc2, noiseGain, humGain, shimGain };
}

// 主題基底音量 x drift 倍率,用 setTargetAtTime 滑過去,不會爆音。
function applyLayers() {
  if (!layers) return;
  const base = {
    hotel:     { drone: 0.050, noise: 0.014, hum: 0 },
    nightdesk: { drone: 0.040, noise: 0.010, hum: 0.011 },
  }[currentTheme] || { drone: 0.028, noise: 0.009, hum: 0 }; // 檔案室
  const mult = [1, 1.35, 1.7][driftLvl] || 1;
  const t = ctx.currentTime;
  layers.droneGain.gain.setTargetAtTime(on ? base.drone * mult : 0, t, 0.8);
  layers.noiseGain.gain.setTargetAtTime(on ? base.noise : 0, t, 0.8);
  layers.humGain.gain.setTargetAtTime(on ? base.hum : 0, t, 0.8);
  layers.shimGain.gain.setTargetAtTime(on && driftLvl >= 2 ? 0.0032 : 0, t, 1.5);
  // drift 越高,drone 的失諧越開,拍頻越明顯。
  layers.osc2.frequency.setTargetAtTime([46.6, 47.4, 48.3][driftLvl] || 46.6, t, 1.2);
}

// --- 隨機環境音:很久才一聲,才會嚇人 ---

function scheduleAmbient() {
  clearTimeout(ambientTimer);
  if (!on || !currentTheme) return;
  const wait = 45000 + Math.random() * 85000; // 45-130 秒
  ambientTimer = setTimeout(() => {
    if (on) {
      if (currentTheme === "hotel" && Math.random() < 0.8) playCue("thump");
      else if (currentTheme === "nightdesk" && Math.random() < 0.8) playCue("flicker");
    }
    scheduleAmbient();
  }, wait);
}

// --- public API ---

export function toggleAudio() {
  ensureGraph();
  on = !on;
  try { localStorage.setItem(LS_KEY, on ? "on" : "off"); } catch {}
  if (on) { ctx.resume(); applyLayers(); scheduleAmbient(); }
  else { applyLayers(); clearTimeout(ambientTimer); }
  return on;
}

export function setSceneSound(theme) {
  if (theme === currentTheme) return;
  currentTheme = theme;
  if (ctx) { applyLayers(); scheduleAmbient(); }
}

export function setDriftLevel(n) {
  if (n === driftLvl) return;
  driftLvl = n;
  if (ctx) applyLayers();
}

// 一次性音效。audio 沒開就靜靜略過。
export function playCue(name) {
  if (!ctx || !on) return;
  const t = ctx.currentTime;
  if (name === "ding") {
    // 電梯叮:C6 + G6 泛音,長衰減。
    for (const [freq, amp] of [[1046.5, 0.10], [1568, 0.05]]) {
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 2);
    }
  } else if (name === "thump") {
    // 樓上或牆後的悶響:音高往下掉的低頻一擊。
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(58, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.4);
  } else if (name === "flicker") {
    // 日光燈閃爍的電流雜訊:很短,兩下。
    for (const off of [0, 0.09]) {
      const src = ctx.createBufferSource();
      src.buffer = getFlickerBuffer();
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = 2800; bp.Q.value = 7;
      const g = ctx.createGain(); g.gain.value = 0.055;
      src.connect(bp); bp.connect(g); g.connect(master);
      src.start(t + off); src.stop(t + off + 0.05);
    }
  }
}

function getFlickerBuffer() {
  if (flickerBuf) return flickerBuf;
  flickerBuf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
  const d = flickerBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return flickerBuf;
}

// 聲音開關:固定在視窗右下角的單例按鈕。appRoot 每次 render 都會清空,
// 所以按鈕直接掛 body,跨場景存活;掛 body 也順便避開主題外框的
// filter 讓 position:fixed 失效的問題。
export function audioButtonEl() {
  if (!btnEl) {
    btnEl = document.createElement("button");
    btnEl.className = "audio-toggle";
    btnEl.addEventListener("click", () => {
      toggleAudio();
      btnEl.textContent = audioIsOn() ? "🔊 聲音" : "🔇 靜音";
    });
  }
  btnEl.textContent = audioIsOn() ? "🔊 聲音" : "🔇 靜音";
  if (!btnEl.isConnected) document.body.appendChild(btnEl);
  // 上次 session 開著聲音:瀏覽器要求本頁的第一個手勢才能解鎖
  // AudioContext,所以在第一個點擊/按鍵時才真正開聲。
  if (on && !ctx && !gestureArmed) {
    gestureArmed = true;
    const boot = () => {
      ensureGraph();
      ctx.resume();
      applyLayers();
      scheduleAmbient();
    };
    window.addEventListener("pointerdown", boot, { once: true });
    window.addEventListener("keydown", boot, { once: true });
  }
  return btnEl;
}
