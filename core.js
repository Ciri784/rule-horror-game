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
//     theme?: string,             // 場景視覺主題：外框加上 .theme-<name>，
//                                 // 配色與質感由 style.css 的對應區塊接管
//     archive?: { no?, stamp? },  // 首頁檔案室：檔案編號 / 歸檔章文字
//     omens?: [{ id, at, lead, foretell, happen, when? }],  // 未來時間戳的預言敘事
//   }
//   onChoose may call ctx.narrate(text, kind?) to push a narration entry.

import {
  loadState, saveState, clearState,
  narrate, evaluateTriggers, checkEndings, formatTime, advanceClock,
  freshState, rulesFor, applyAction, migrateState,
} from "./engine.js";
import {
  setSceneSound, setDriftLevel, playCue, audioButtonEl,
} from "./audio.js";

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
function driftLevel(state) {
  const d = typeof state.drift === "number" ? state.drift : 0;
  return d >= 2 ? 2 : d === 1 ? 1 : 0;
}
function driftClass(state) {
  const l = driftLevel(state);
  return l === 2 ? " drift-2" : l === 1 ? " drift-1" : "";
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
  timePassed: (t) => `（時間過去了。時鐘指向 ${t}。）`,
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

// 規則文字突變:事實不變,字變。rule.mutate = { from, to, when(state) },
// 引擎永遠照原文判定,這裡只改顯示。被改掉的那幾個字渗紅色手寫體。
function ruleBodyEl(rule, state) {
  const m = rule.mutate;
  if (m && typeof m.when === "function" && m.when(state) && rule.text.includes(m.from)) {
    const i = rule.text.indexOf(m.from);
    return el("span", { class: "rule-body" }, [
      rule.text.slice(0, i),
      el("span", { class: "rule-mutated" }, m.to),
      rule.text.slice(i + m.from.length),
    ]);
  }
  return el("span", { class: "rule-body" }, rule.text);
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
        // 暴露書名給主題 CSS：例如夜班的「交班簿」要換手寫體
        "data-book": bookName,
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
          ruleBodyEl(rule, state),
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
      ruleBodyEl(rule, state),
    ]));
  });
  return ol;
}

// 手機版頁籤狀態:此刻/守則。模組層級,rerender 重建 DOM 後仍記得。
// seenRuleCounts 記每個場景玩家已看過幾條守則,新解鎖時守則頁籤冒紅點。
let mobileTab = "now";
const seenRuleCounts = {};

export function renderScene(sceneId) {
  // 場所鎖視窗(欄內捲動),離開檔案室的整頁捲動模式。
  document.documentElement.classList.remove("archive-mode");
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
      advanceClock(scene, state, tickMinutes);
      narrate(state, label(scene, "timePassed", formatTime(state.time)), "system");
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

  // 預言音效:預言的事件「真的發生」的那一刻播放對應的 cue(電梯叮、
  // 燈管閃爍)。載入存檔時已發生過的預言不重播——initial 掃描只標記不播音。
  const playedOmenCues = new Set();
  function checkOmenCues(initial) {
    if (!Array.isArray(scene.omens) || !state._omens) return;
    for (const o of scene.omens) {
      const rec = state._omens[o.id];
      if (!rec || !rec.happened || playedOmenCues.has(o.id)) continue;
      playedOmenCues.add(o.id);
      if (!initial && o.cue) playCue(o.cue);
    }
  }
  checkOmenCues(true);

  function rerender() {
    // 結案歸檔：結局達成時寫進檔案室記錄（_filed 保證一局只歸檔一次），
    // 首頁卷宗的調閱章與檔案室的異變程度都靠這份記錄。
    if (state.ended && !state._filed) {
      fileEndingRecord(scene, state);
      state._filed = true;
      saveState(sceneId, state);
    }
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
        receiptEl(scene, state, ending),
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
    grid.dataset.mtab = mobileTab;

    // 手機版頁籤(桌面 CSS 隱藏):此刻 / 守則。守則有新解鎖時冒紅點。
    const ruleCount = rulesFor(scene, state).length;
    if (mobileTab === "rules") seenRuleCounts[sceneId] = ruleCount;
    const hasNewRules = ruleCount > (seenRuleCounts[sceneId] ?? ruleCount);
    let tabsEl = null;
    const setTab = (id, btn) => {
      mobileTab = id;
      grid.dataset.mtab = id;
      tabsEl.querySelectorAll(".mobile-tab").forEach((b) =>
        b.classList.toggle("active", b === btn));
      if (id === "rules") {
        seenRuleCounts[sceneId] = ruleCount;
        const badge = tabsEl.querySelector(".tab-badge");
        if (badge) badge.remove();
      }
    };
    const tabNow = el("button", {
      type: "button", role: "tab",
      class: "mobile-tab" + (mobileTab === "now" ? " active" : ""),
      onclick: (ev) => { ev.preventDefault(); setTab("now", ev.currentTarget); },
    }, label(scene, "nowTitle"));
    const tabRulesKids = [label(scene, "rulesTitle")];
    if (hasNewRules) tabRulesKids.push(el("span", { class: "tab-badge" }));
    const tabRules = el("button", {
      type: "button", role: "tab",
      class: "mobile-tab" + (mobileTab === "rules" ? " active" : ""),
      onclick: (ev) => { ev.preventDefault(); setTab("rules", ev.currentTarget); },
    }, tabRulesKids);
    tabsEl = el("div", { class: "mobile-tabs", role: "tablist" }, [tabNow, tabRules]);
    // Chrome is deliberately minimal: the reader is *inside* the place, not
    // watching it on a monitor — so no surveillance jargon (REC/CH-04/LED).
    // Just the place name and the room clock, quiet like a document header.
    // Drift leaks into this frame and the text itself (see drift-* CSS).
    const themeCls = scene.theme ? ` theme-${scene.theme}` : "";
    const monitor = el("div", { class: "monitor" + themeCls + driftClass(state) }, [
      el("div", { class: "mobile-top" }, [
        el("div", { class: "scene-head" }, [
          el("span", { class: "scene-name" }, scene.title),
          el("span", { class: "live-clock", id: "live-clock" }, formatTime(state.time)),
        ]),
        tabsEl,
      ]),
      grid,
    ]);
    appRoot().appendChild(monitor);
    // 聲音:場景主題決定聲層(首頁檔案室=null),drift 讓 drone 跟著變質。
    setSceneSound(scene.theme || null);
    setDriftLevel(driftLevel(state));
    audioButtonEl();
    renderNarrativeStream(streamEl, state);



    // grid is appended in the narrative-column block above so the
    // narrator can run immediately. Just scroll the stream to the
    // bottom of the newest entry here.
    const stream = document.getElementById("narrative-stream");
    if (stream) {
      // 手機版敘事跟整頁捲,沒有欄內捲軸可推;把最新一則滑進視野就好。
      const mobileNow = window.matchMedia && window.matchMedia("(max-width: 900px)").matches;
      if (mobileNow && stream.lastElementChild && stream.lastElementChild.scrollIntoView) {
        stream.lastElementChild.scrollIntoView({ block: "nearest" });
      } else {
        stream.scrollTop = stream.scrollHeight;
      }
    }
  }

  // --- Live clock tick ---
  // Advances the in-game clock in place; a full rerender() only happens when
  // the tick actually changed something visible (new narration, an ending),
  // so idle ticks don't stomp scroll position or the just-typed animation.
  stopTick();
  if (!state.ended) {
    tickHandle = setInterval(() => {
      if (state.ended) { stopTick(); return; }
      const narrBefore = Array.isArray(state.narrative) ? state.narrative.length : 0;
      advanceClock(scene, state, 1);
      state._lastTickAt = Date.now();
      evaluateTriggers(scene, state);
      checkEndings(scene, state, ctx);
      saveState(sceneId, state);
      const clock = document.getElementById("live-clock");
      if (clock) clock.textContent = formatTime(state.time);
      const mon = document.querySelector(".monitor");
      if (mon) mon.className = "monitor" + themeCls + driftClass(state);
      setDriftLevel(driftLevel(state));
      checkOmenCues(false);
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
// --- 檔案室記錄 ---
// 結局歸檔存在獨立 key（不走場景存檔），首頁據此決定卷宗上的調閱記錄，
// 以及檔案室本身「不對勁」的程度。
function archiveRecords() {
  return loadState("archive:records") || {};
}
function fileEndingRecord(scene, state) {
  const recs = archiveRecords();
  const r = recs[scene.id] || (recs[scene.id] = { filedCount: 0, last: null });
  const e = scene.endings.find((x) => x.id === state.ended);
  r.filedCount += 1;
  r.last = {
    endingId: state.ended,
    label: e ? e.label : String(state.ended),
    clock: formatTime(state.time),
    visit: state.visitCount,
  };
  saveState("archive:records", recs);
}

// 結案單：結局戳章旁的一張收據，印有場所、結局、時間與調閱次數。
function receiptEl(scene, state, ending) {
  return el("div", { class: "receipt" }, [
    el("div", { class: "receipt-head" }, "結　案　單"),
    el("div", { class: "receipt-row" }, `場所：${scene.title}`),
    el("div", { class: "receipt-row" }, `結局：${ending.label}`),
    el("div", { class: "receipt-row" }, `時間：${formatTime(state.time)}`),
    el("div", { class: "receipt-row" }, `調閱：第 ${state.visitCount} 次`),
    el("div", { class: "receipt-bar" }),
    el("div", { class: "receipt-foot" }, "第四十四號檔案室 · 經辦"),
  ]);
}

export function renderIndex() {
  // 檔案室的聲音:最輕的房間底噪,沒有主題聲層。
  setSceneSound(null);
  setDriftLevel(0);
  audioButtonEl();

  stopTick();
  appRoot().innerHTML = "";
  // 檔案室走整頁捲動,放開視窗鎖。
  document.documentElement.classList.add("archive-mode");
  // 首頁是一間檔案室：每個場所是一份被歸檔的卷宗，玩家是來調閱的人。
  // 卷宗編號與歸檔章由 scene.archive 提供，沒給就用順序補一個編號。
  //
  // 但檔案室本身也是一個場所。結案記錄累積後，這裡會慢慢不對勁：
  //   strange 1（結案 ≥1）：限閱註記多一行、第一只卷宗的耳位自己換邊。
  //   strange 2（結案 ≥2）：架上多出一只沒有登記的卷宗，點開只有一張房卡。
//   strange 3（結案 ≥3）：牆上出現一份「管理員守則」——房間正式成為場所之一。
  const recs = archiveRecords();
  const totalFiled = Object.values(recs).reduce((n, r) => n + (r.filedCount || 0), 0);
  const strange = totalFiled >= 3 ? 3 : totalFiled >= 2 ? 2 : totalFiled >= 1 ? 1 : 0;

  const head = [
    el("div", { class: "archive-plate" }, "第四十四號檔案室"),
    el("p", { class: "archive-sub" },
      "這些是從不同場所流出的守則。每一份都自稱能保護您。多數是真的。"),
    el("div", { class: "archive-note" },
      strange >= 1 ? "本室文件限本人調閱 · 閱後請歸檔 · 請勿攜出"
                   : "本室文件限本人調閱 · 閱後請歸檔"),
  ];
  if (strange >= 2) {
    head.push(el("div", { class: "archive-whisper" }, "（架上的卷宗比昨天多了一份。）"));
  }
  if (strange >= 3) {
    head.push(el("div", { class: "archive-whisper" }, "（牆上昨天還沒有那份守則。）"));
  }
  const room = el("div", { class: "archive-room" + (strange ? ` strange-${strange}` : "") },
    [el("header", { class: "archive-head" }, head)]);

  // 管理員守則：貼在卷宗後方牆上的一張紙——上緣被最後一排卷宗遮住,
  // 要往下捲才看得到。不是新貼的海報,是一直都在、只是平常被擋住。
  // 每條都對應玩家實際碰過的異變,但口吻始終是公事公辦的機構語言。
  let keeperRules = null;
  if (strange >= 3) {
    const KEEPER_RULES = [
      "上架前請清點卷宗。數量與登記不符時,以架上數量為準。",
      "卷宗耳位如有變動,屬正常歸檔作業,無需記錄。",
      "本室不發放結案單。如您收到,請自行留存,勿上交。",
      "調閱記錄由本室代填。請勿與本人記憶核對。",
      "本室門牌為第四十四號。如您看見其他編號,請勿進入。",
      "本室沒有管理員。",
    ];
    keeperRules = el("div", { class: "keeper-rules" }, [
      el("div", { class: "keeper-title" }, "管理員守則"),
      el("ol", {}, KEEPER_RULES.map((r) => el("li", {}, r))),
      el("div", { class: "keeper-red" }, "（守則是真的。）"),
    ]);
  }

  const shelf = el("div", { class: "archive-shelf" });
  let i = 0;
  for (const s of listScenes()) {
    i += 1;
    const arc = s.archive || {};
    const no = arc.no || `RH-${String(i).padStart(3, "0")}`;
    const stamp = arc.stamp || "已歸檔";
    const body = [
      el("h2", { class: "name" }, s.title),
      el("p", { class: "blurb" }, s.blurb || ""),
      el("span", { class: "folder-stamp" }, stamp),
    ];
    // 調閱記錄：來過幾次、結案幾次、最近一次的結局。
    const visits = loadState(s.id + ":visits") || 0;
    const rec = recs[s.id];
    if (visits > 0 || rec) {
      const parts = [`調閱 ${visits} 次`];
      if (rec && rec.filedCount) {
        parts.push(`結案 ${rec.filedCount} 次`);
        if (rec.last) parts.push(`最近：${rec.last.label}`);
      }
      body.push(el("p", { class: "folder-record" }, parts.join(" · ")));
    }
    // 歸檔原件:檔案室收著當初存檔的正確版本,只展示玩家實際收集過的條文。
    // 場所裡的字會變,這裡的不會——要對答案,回檔案室。
    const saved = loadState(s.id);
    const unlockedIds = saved && Array.isArray(saved.unlockedRuleIds) ? saved.unlockedRuleIds : [];
    const byBook = [];
    for (const [rid, rule] of Object.entries(s.rules || {})) {
      if (!unlockedIds.includes(rid)) continue;
      const b = rule.book || "其他";
      let g = byBook.find((x) => x[0] === b);
      if (!g) { g = [b, []]; byBook.push(g); }
      g[1].push(rule.text);
    }
    if (byBook.length) {
      const panel = el("div", { class: "folder-original" }, [
        el("div", { class: "original-head" }, `歸檔原件 · ${no}`),
        ...byBook.map(([b, texts]) => el("div", { class: "original-book" }, [
          el("div", { class: "original-book-title" }, `《${b}》`),
          el("ol", {}, texts.map((t) => el("li", {}, t))),
        ])),
      ]);
      panel.style.display = "none";
      body.push(el("button", {
        class: "folder-original-toggle",
        onclick: (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          panel.style.display = panel.style.display === "none" ? "" : "none";
        },
      }, "調閱原件"));
      body.push(panel);
    }
    shelf.appendChild(el("a", {
      class: "folder" + (strange >= 1 && i === 1 ? " tab-flip" : ""),
      href: "#" + s.id,
      onclick: (ev) => { ev.preventDefault(); location.hash = s.id; },
    }, [
      el("div", { class: "folder-tab" }, no),
      el("div", { class: "folder-body" }, body),
    ]));
  }
  if (strange >= 2) {
    let whispered = false;
    const ghost = el("div", { class: "folder ghost", onclick: () => {
      if (whispered) return;
      whispered = true;
      ghost.querySelector(".folder-body").appendChild(
        el("p", { class: "ghost-whisper" }, "（裡面沒有文件。只有一張房卡，卡面寫著 602。）"));
    } }, [
      el("div", { class: "folder-tab" }, "無編號"),
      el("div", { class: "folder-body" }, [
        el("h2", { class: "name" }, "████"),
        el("p", { class: "blurb" }, "這只卷宗沒有登記。它不該在架上。"),
      ]),
    ]);
    shelf.appendChild(ghost);
  }
  room.appendChild(shelf);
  if (keeperRules) room.appendChild(keeperRules);
  room.appendChild(el("div", { class: "meta" }, "Rule Horror · Ciri784"));
  appRoot().appendChild(room);
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
