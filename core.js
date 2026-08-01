// Rule Horror — core (browser layer): DOM rendering, routing, storage.
// The generic state machine lives in engine.js; scenes drive behaviour.
//
// Scene contract (full spec + minimal skeleton: docs/scene-contract.md):
//   {
//     id, title, blurb, openingNarrative,
//     initialItems?, initialLocation?, initialIdentity?, initialTime?,
//     initialUnlockedRuleIds?, initialState?,      // scene-private fields
//     rules, rulebooks, judges?, derive?,
//     actions(state, ctx) -> [{ id, label, onChoose(state, ctx) }, ...],
//     endings: [{ id, label, when(state, ctx) -> bool, text }],
//     ui?: { visitLabel?(n), restart?, rulesTitle?, nowTitle?, actionsTitle?,
//            reset?, home?, emptyRules? },
//   }
//   onChoose may call ctx.narrate(text, kind?) to push a narration entry.

import {
  loadState, saveState, clearState,
  narrate, evaluateTriggers, checkEndings, formatTime,
  freshState, rulesFor, applyAction, migrateState,
} from "./engine.js";

const scenes = {};

// Live clock tick: one setInterval per scene view (5 real seconds = 1 in-game
// minute, same rate as the idle catch-up in renderScene). Module-level so
// route changes and restarts can stop it.
let tickHandle = null;
function stopTick() {
  if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
}

// Scenes keep private fields on state; `drift` is the horror-leak level the
// monitor chrome reacts to (0 = none, 1 = flicker, 2+ = glitch).
function driftClass(state) {
  const d = typeof state.drift === "number" ? state.drift : 0;
  return d >= 2 ? " drift-2" : d === 1 ? " drift-1" : "";
}

// $app is only meaningful in a browser. Resolve lazily so this module is
// importable under Node (e.g. by tests) without a real document.
let $app = null;
function appRoot() {
  if ($app) return $app;
  $app = document.getElementById("app");
  return $app;
}
export function registerScene(scene) { scenes[scene.id] = scene; }
export function getScene(id) { return scenes[id]; }
export function listScenes() { return Object.values(scenes); }

// Generic UI labels. A scene may override any of these via `scene.ui`;
// place-specific wording (a hotel's 入住/退房) lives there, not here.
const UI_DEFAULTS = {
  rulesTitle: "已知規則",
  nowTitle: "此刻",
  actionsTitle: "您可以",
  urgentTitle: "處置",
  reset: "重置本關",
  home: "回到首頁",
  restart: "重新開始",
  emptyRules: "您目前還沒有拿到任何守則。",
  visitLabel: (n) => `第 ${n} 次`,
};
function label(scene, key, ...args) {
  const v = (scene.ui && scene.ui[key] != null) ? scene.ui[key] : UI_DEFAULTS[key];
  return typeof v === "function" ? v(...args) : v;
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v != null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

function renderRules(scene, state, openBooks) {
  // Each rulebook is a <details> dropdown. The player collects rulebooks by
  // holding the matching items; each is collapsed until opened. Multiple
  // rulebooks coexist so the player can compare contradictory rules.
  //
  // `openBooks` is a Set (owned by renderScene) of book names the player has
  // expanded. rerender() rebuilds the DOM from scratch on every action, so
  // without this the <details> would snap shut each turn — we reapply the
  // open state here and keep the Set in sync via the toggle event.
  const list = rulesFor(scene, state);

  if (scene.rulebooks) {
    // 把 rule 依 book 分群
    const groups = {};
    for (const bookName of Object.keys(scene.rulebooks)) {
      groups[bookName] = list.filter((r) => r.book === bookName);
    }
    // 沒有 book 欄位的 rule (legacy) 歸到 "其他"
    const orphans = list.filter((r) => !r.book);
    if (orphans.length) groups["其他"] = orphans;

    const wrap = el("div", { class: "rulebooks" });
    for (const [bookName, rules] of Object.entries(groups)) {
      if (!rules || rules.length === 0) continue;
      // 計算這份守則單有幾條條件還沒過的 (顯示為「待解鎖」)
      const lockedHint = rules.length === 0 ? "" : `（${rules.length} 條）`;
      const props = {
        class: "rulebook",
        ontoggle: (ev) => {
          if (ev.target.open) openBooks.add(bookName);
          else openBooks.delete(bookName);
        },
      };
      if (openBooks && openBooks.has(bookName)) props.open = "";
      const details = el("details", props);
      const summary = el("summary", { class: "rulebook-summary" }, [
        el("span", { class: "rulebook-title" }, bookName),
        el("span", { class: "rulebook-count" }, lockedHint),
      ]);
      details.appendChild(summary);
      const ol = el("ol", { class: "rules" });
      rules.forEach((rule, i) => {
        ol.appendChild(el("li", { class: "rule" }, [
          el("span", { class: "rule-num" }, `第 ${i + 1} 條`),
          el("span", { class: "rule-body" }, rule.text),
        ]));
      });
      details.appendChild(ol);
      wrap.appendChild(details);
    }
    if (!wrap.children.length) {
      wrap.appendChild(el("p", { class: "rules-empty" }, label(scene, "emptyRules")));
    }
    return wrap;
  }

  // Scene without rulebooks: render its unlocked rules as one flat list.
  const ol = el("ol", { class: "rules" });
  list.forEach((rule, i) => {
    ol.appendChild(el("li", { class: "rule" }, [
      el("span", { class: "rule-num" }, `第 ${i + 1} 條`),
      el("span", { class: "rule-body" }, rule.text),
    ]));
  });
  return ol;
}

export function renderScene(sceneId) {
  const scene = scenes[sceneId];
  if (!scene) {
    appRoot().innerHTML = "";
    appRoot().appendChild(el("div", { class: "scene-card" }, [
      el("h1", {}, "找不到這個場所。"),
      el("p", {}, "請從首頁重新選擇。"),
    ]));
    return;
  }

  // Saves are versioned (see STORAGE_PREFIX); a load either returns a
  // current-shape state or null. migrateState fills any initialState keys
  // missing from an older save of the same version so newly-added
  // scene-private fields never start as undefined.
  let state = loadState(sceneId);
  const fresh = !state;
  if (fresh) {
    const visitCount = (loadState(sceneId + ":visits") || 0) + 1;
    state = freshState(scene);
    state.visitCount = visitCount;
    saveState(sceneId + ":visits", visitCount);
    saveState(sceneId, state);
  } else {
    migrateState(scene, state);
  }

  const ctx = { scene, visitCount: state.visitCount, fresh, narrate: (text, kind) => narrate(state, text, kind) };

  // Which rulebooks the player has expanded. Lives here (view state, not game
  // state) so it survives every rerender() but resets on a fresh scene load.
  const openBooks = new Set();
  // 規則是玩法的核心對照物，進場景時預設全部攤開；玩家手動收合後，
  // openBooks 會在這個 scene view 的生命期內記住收合狀態。
  if (scene.rulebooks) for (const name of Object.keys(scene.rulebooks)) openBooks.add(name);

  // --- Idle time catch-up ---
  // Time also advances with real time between renders (5 real seconds = 1
  // in-game minute), so returning to the scene fast-forwards the clock. Only
  // while the run is live: once it has ended, the clock stops — no more ticks,
  // no more narration, no re-save (fixes: time kept counting after an ending).
  if (state.startedAt && !state.ended) {
    const now = Date.now();
    const lastTick = state._lastTickAt || state.startedAt;
    const elapsedMs = now - lastTick;
    if (elapsedMs >= 5000) {
      const tickMinutes = Math.floor(elapsedMs / 5000);
      const before = state.time;
      const DAY = 24 * 60;
      state.time = (state.time + tickMinutes) % DAY;
      if (state.time < before) state.crossedMidnight = true;
      narrate(state, `（時間過去了。房間的時鐘指向 ${formatTime(state.time)}。）`, "system");
      state._lastTickAt = now;
      // A catch-up can cross midnight or reach dawn, so re-run derived state
      // and endings here too — otherwise a time-based ending (e.g. 天亮退房)
      // would wait for the next click, and overshooting its window would lose
      // it entirely.
      evaluateTriggers(scene, state);
      checkEndings(scene, state, ctx);
      saveState(sceneId, state);
    }
  }

  function rerender() {
    appRoot().innerHTML = "";

    // 規則欄 (left on desktop, top on mobile)
    const rulesCol = el("aside", { class: "col col-rules" });
    rulesCol.appendChild(el("h2", { class: "col-title" }, label(scene, "rulesTitle")));
    if (state.visitCount > 1) {
      rulesCol.appendChild(el("p", { class: "col-sub" },
        label(scene, "visitLabel", state.visitCount)));
    }
    rulesCol.appendChild(renderRules(scene, state, openBooks));

    // 敘事欄 (center)
    const narrCol = el("section", { class: "col col-narrative" });
    narrCol.appendChild(el("h2", { class: "col-title" }, label(scene, "nowTitle")));
    const streamEl = el("div", { class: "narrative-stream", id: "narrative-stream" });
    narrCol.appendChild(streamEl);
    // 行動欄 (right on desktop, bottom on mobile)
    // 場景自報限時狀態（例如夜班的事件上門）：行動欄換標題、換皮，
    // 讓玩家一眼知道「現在不回應，時間會替你回應」。
    const urgent = scene.isUrgent ? !!scene.isUrgent(state) : false;
    const actCol = el("aside", { class: "col col-actions" + (urgent ? " urgent" : "") });
    actCol.appendChild(el("h2", { class: "col-title" + (urgent ? " urgent" : "") },
      label(scene, urgent ? "urgentTitle" : "actionsTitle")));
    const ending = state.ended ? scene.endings.find((e) => e.id === state.ended) : null;
    if (ending) {
      actCol.appendChild(el("div", { class: "scene-end" }, [
        el("div", { class: "stamp" }, ending.label),
        el("a", { href: "#", onclick: (ev) => { ev.preventDefault(); restart(); } },
          el("button", { class: "restart" }, label(scene, "restart"))),
      ]));
    } else {
      const actions = scene.actions(state, ctx);
      if (actions && actions.length) {
        const wrap = el("div", { class: "actions" });
        for (const a of actions) {
          wrap.appendChild(el("button", {
            type: "button",
            class: "action-btn",
            "data-action": a.id,
            onclick: (ev) => {
              ev.preventDefault();
              if (state.ended) return;
              try {
                applyAction(scene, state, a.id, ctx);
                saveState(sceneId, state);
              } catch (err) {
                console.error("[rule-horror] action failed", a.id, err);
                renderError(err, a.id);
                return;
              }
              rerender();
              // type out the newest narrative line
              const stream = document.getElementById("narrative-stream");
              if (stream) stream.lastElementChild && stream.lastElementChild.classList.add("just-typed");
            },
          }, a.label));
        }
        actCol.appendChild(wrap);
      }
    }
    // Reset button — wipes this scene's localStorage and re-renders fresh.
    // Always visible so the player can bail out of a bad run, not just on
    // the ending stamp.
    actCol.appendChild(el("div", { class: "reset-block" }, [
      el("button", {
        type: "button",
        class: "home-btn",
        title: "回到場所選單，本關進度會保留",
        onclick: (ev) => {
          ev.preventDefault();
          location.hash = "";
        },
      }, label(scene, "home")),
      el("button", {
        type: "button",
        class: "reset-btn",
        title: "清除本關進度，從頭開始",
        onclick: (ev) => {
          ev.preventDefault();
          if (confirm("確定要重置本關嗎？目前的進度會全部消失。")) {
            clearState(sceneId);
            location.hash = "";
            location.reload();
          }
        },
      }, label(scene, "reset")),
    ]));

    // Append the grid BEFORE calling renderNarrativeStream so the
    // narrator can find the stream element via document.getElementById
    // (used by action-button onclick to add the .just-typed class).
    // Bug: previously we called renderNarrativeStream while the grid was
    // still detached, so getElementById returned null and the stream
    // stayed empty.
    const grid = el("div", { class: "scene-grid" }, [rulesCol, narrCol, actCol]);
    // Chrome is deliberately minimal: the reader is *inside* the place, not
    // watching it on a monitor — so no surveillance jargon (REC/CH-04/LED).
    // Just the place name and the room clock, quiet like a document header.
    // Drift leaks into this frame and the text itself (see drift-* CSS).
    const monitor = el("div", { class: "monitor" + driftClass(state) }, [
      el("div", { class: "scene-head" }, [
        el("span", { class: "scene-name" }, scene.title),
        el("span", { class: "live-clock", id: "live-clock" }, formatTime(state.time)),
      ]),
      grid,
    ]);
    appRoot().appendChild(monitor);
    renderNarrativeStream(streamEl, state);



    // grid is appended in the narrative-column block above so the
    // narrator can run immediately. Just scroll the stream to the
    // bottom of the newest entry here.
    const stream = document.getElementById("narrative-stream");
    if (stream) stream.scrollTop = stream.scrollHeight;
  }

  // --- Live clock tick ---
  // Advances the in-game clock in place; a full rerender() only happens when
  // the tick actually changed something visible (new narration, an ending),
  // so idle ticks don't stomp scroll position or the just-typed animation.
  stopTick();
  if (!state.ended) {
    const DAY = 24 * 60;
    tickHandle = setInterval(() => {
      if (state.ended) { stopTick(); return; }
      const narrBefore = Array.isArray(state.narrative) ? state.narrative.length : 0;
      const before = state.time;
      state.time = (state.time + 1) % DAY;
      if (state.time < before) state.crossedMidnight = true;
      state._lastTickAt = Date.now();
      evaluateTriggers(scene, state);
      checkEndings(scene, state, ctx);
      saveState(sceneId, state);
      const clock = document.getElementById("live-clock");
      if (clock) clock.textContent = formatTime(state.time);
      const mon = document.querySelector(".monitor");
      if (mon) mon.className = "monitor" + driftClass(state);
      const narrAfter = Array.isArray(state.narrative) ? state.narrative.length : 0;
      if (state.ended || narrAfter !== narrBefore) rerender();
    }, 5000);
  }

  function restart() { clearState(sceneId); renderScene(sceneId); }
  rerender();
}

function renderError(err, actionId) {
  appRoot().innerHTML = "";
  const card = el("div", { class: "scene-card" });
  card.appendChild(el("h1", {}, "守則出差錯了"));
  card.appendChild(el("p", { class: "scene-intro" },
    actionId ? `剛才的動作「${actionId}」把守則弄亂了。請回到首頁重來。`
             : "守則還沒準備好。請回到首頁重來。"));
  const pre = el("pre", {},
    String(err && err.stack || err));
  pre.style.cssText = "white-space:pre-wrap;font-size:12px;color:var(--accent);padding:12px;border:1px dashed var(--accent-soft);background:rgba(110,31,31,0.05);";
  card.appendChild(pre);
  card.appendChild(el("button", {
    class: "restart",
    onclick: (ev) => { ev.preventDefault(); location.hash = ""; location.reload(); },
  }, "返回首頁"));
  appRoot().appendChild(card);
}

function renderNarrativeStream(stream, state) {
  if (!stream) return;
  stream.innerHTML = "";
  if (!Array.isArray(state.narrative)) state.narrative = [];
  for (const entry of state.narrative) {
    const row = el("div", { class: `narr-row kind-${entry.kind}` }, [
      el("span", { class: "narr-time" }, formatTime(entry.time)),
      el("span", { class: "narr-text" }, entry.text),
    ]);
    stream.appendChild(row);
  }
}
export function renderIndex() {
  stopTick();
  appRoot().innerHTML = "";
  const card = el("div", { class: "scene-card" });
  card.appendChild(el("h1", {}, "規則怪談集"));
  card.appendChild(el("p", { class: "scene-intro" },
    "這些是從不同場所流出的守則。每一份都自稱能保護您。多數是真的。"));
  const pick = el("div", { class: "scene-pick" });
  for (const s of listScenes()) {
    pick.appendChild(el("a", { href: "#" + s.id, onclick: (ev) => {
      ev.preventDefault(); location.hash = s.id;
    } }, [
      el("h2", { class: "name" }, s.title),
      el("p", { class: "blurb" }, s.blurb || ""),
    ]));
  }
  card.appendChild(pick);
  card.appendChild(el("div", { class: "meta" }, "Rule Horror · Ciri784"));
  appRoot().appendChild(card);
}

export function start() {
  function route() {
    const id = (location.hash || "").replace(/^#/, "");
    if (id && scenes[id]) renderScene(id);
    else renderIndex();
  }
  window.addEventListener("hashchange", route);
  route();
}
