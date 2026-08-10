// Rule Horror — 夜班櫃台（night-desk)
//
// 視角翻轉：你不是讀守則的房客，你是被守則約束的夜班櫃台。
// 23:00 上班，06:00 交班。事件依時間窗自己找上門，每個處置的對錯
// 取決於你信哪份文件——官方守則，或交班簿上前任的字。
//
// 設計文件：docs/night-desk-design.md。引擎不動，事件佇列與時限
// 邏輯全部收在這個 scene 的 derive/actions 裡。

import { narrate } from "../engine.js";

const SHIFT_START = 23 * 60;   // 1380 = 23:00
const SHIFT_END = 30 * 60;     // 1800 = 隔天 06:00(formatTime 會 %24 顯示 06:00)
const CHOICE_MINUTES = 3;      // 每個處置花掉的遊戲時間

// ── 守則與交班簿 ──
// 兩份文件開場就全給，整晚躺在左欄。哪條此刻生效，玩家自己判斷——
// 引擎永遠不標。
const RULES = {
  c1: { subject: "櫃台", book: "櫃台守則",
        text: "上班時間 23:00–06:00。不要離開櫃台超過五分鐘。" },
  c2: { subject: "櫃台", book: "櫃台守則",
        text: "客人要入住，先核對登記簿：簿上有名字的，給鑰匙；沒有的，請他明天再來。" },
  c3: { subject: "櫃台", book: "櫃台守則",
        text: "電梯面板沒有 4 樓。有客人問起，回答「本館沒有 4 樓」。不要解釋。" },
  c4: { subject: "櫃台", book: "櫃台守則",
        text: "午夜之後，不要為任何人開大門。穿本館制服的員工除外。" },
  c5: { subject: "櫃台", book: "櫃台守則",
        text: "電話響三聲之內要接。超過三聲還在響，不要接。" },
  c6: { subject: "櫃台", book: "櫃台守則",
        text: "客人投訴房間，回覆「明早為您處理」。不要親自上樓。" },
  c7: { subject: "櫃台", book: "櫃台守則",
        text: "登記簿上 704 那一格，不要寫任何東西。" },

  h1: { subject: "前任", book: "交班簿",
        text: "「守則第 4 條，穿制服的也不能開。相信我。」——旁邊另一種字跡：可以開。他要進來的時候，你攔不住。" },
  h2: { subject: "前任", book: "交班簿",
        text: "「704 那格我已經寫了。你最好不要擦掉。」" },
  h3: { subject: "前任", book: "交班簿",
        text: "「三點到四點之間，監視器如果有人站在大門外，那是正常現象。不要看超過十秒。」" },
};

const RULEBOOKS = {
  "櫃台守則": {},
  "交班簿": {},
};

// ── 事件池 ──
// 每個事件有時間窗 [start, end](分鐘）。進窗就強制找上玩家；
// 超過時限沒處理，timeout 也是一種處置。
const EVENTS = [
  {
    id: "ev-drunk",
    window: [1400, 1435], // 23:20–23:55
    prompt: "玻璃門被撞開。一個醉漢晃進來，說要一間房，什麼房都好。你翻開登記簿——沒有他的名字。",
    choices: [
      { id: "refuse", label: "請他明天再來",
        resolve: (s, c) => { c.narrate("你把登記簿轉給他看：沒有名字，沒有房。他瞪著你，罵了幾句聽不清的，走了。玻璃門晃了很久才停。"); } },
      { id: "admit", label: "讓他入住",
        resolve: (s, c) => {
          s.drunkAdmitted = true;
          c.narrate("你翻開登記簿準備登記——那行字已經在了。他的名字，字跡是你的。你不記得你寫過。他接過鑰匙的時候，手指很冰。");
        } },
    ],
    timeout: (s) => narrate(s, "你猶豫的時候，他趴在櫃台上睡著了。你繞出來想叫醒他——他已經不在那裡。登記簿翻開著，空白的一頁。"),
  },
  {
    id: "ev-4f",
    window: [1430, 1465], // 23:50–00:25
    prompt: "一個背行李的男人靠在櫃台前：「請問……4 樓怎麼走？」",
    choices: [
      { id: "recite", label: "「本館沒有 4 樓」",
        resolve: (s, c) => { c.narrate("你照守則回答，不加一個字。他看了你幾秒，什麼也沒說，走了。你的視線掃過電梯面板——你忽然不敢數它有幾顆鈕。"); } },
      { id: "explain", label: "多解釋兩句",
        resolve: (s, c) => {
          s.explained4F = true;
          c.narrate("你多說了一句。他立刻追問：「但我朋友住 402，他昨晚還打給我。」你閉上嘴，照守則不再解釋。他在原地站了一會兒，轉身上樓了。你始終沒聽見電梯的聲音。");
        } },
    ],
    timeout: (s) => narrate(s, "他等不到回答，自己走了。你低頭，發現你的筆停在登記簿上，畫了一個 4。你把它塗掉，塗得很重。"),
  },
  {
    id: "ev-knock",
    window: [1470, 1505], // 00:30–01:05
    prompt: "大門外站著一個人影，在敲門。玻璃上有霧，你看不清他穿什麼。午夜已經過了。",
    choices: [
      { id: "stay", label: "坐著不動",
        resolve: (s, c) => { c.narrate("你坐在原地，沒有動。他敲了一陣子，停了，走了。你注意到門邊的地毯濕了一塊，從門縫往裡浸。你決定明天再擦。"); } },
      { id: "open", label: "開門",
        resolve: (s, c) => {
          s.openedDoor = true;
          c.narrate("你開了門。他走進來，站在櫃台前，不說話。你低下頭——登記簿上，704 那一格濕了。你再抬頭，他已經不在了。門是關著的。");
        } },
    ],
    timeout: (s) => narrate(s, "敲門聲持續了很久，不急，不慢。你數到第四十下，它停了。門外沒有人。地毯是乾的。太好了，你想——然後你開始懷疑，你為什麼要用「太好了」。"),
  },
  {
    id: "ev-phone",
    window: [1515, 1550], // 01:15–01:50
    prompt: "櫃台電話響。一聲。兩聲。螢幕上沒有號碼。",
    choices: [
      { id: "answer", label: "接起來",
        resolve: (s, c) => { c.narrate("你在第三聲之前接起來。一個女人，聲音很平：「704 的客人睡了嗎？」你照櫃台腔回答，不轉接，不透露。她那頭靜了幾秒：「幫我跟他說，鑰匙不用還。」她掛了。你握著聽筒，想不起來 704 今晚有沒有客人。"); } },
      { id: "hang", label: "不說話，掛斷",
        resolve: (s, c) => {
          s.pendingEvent = { id: "ev-phone2", at: s.time + 5, until: s.time + 35 };
          c.narrate("你沒出聲，輕輕掛斷。大廳很靜。你有種預感，這通電話還沒結束。");
        } },
    ],
    timeout: (s) => narrate(s, "你沒接。電話響過三聲，繼續響。第四聲、第五聲……第七聲之後，它自己安靜了。守則第五條在你腦中亮起來：超過三聲，不要接。你這次算是做對了——大概。"),
  },
  {
    id: "ev-monitor",
    window: [1600, 1640], // 02:40–03:20
    prompt: "你例行掃過監視器。大門外的畫面裡，站著一個人。不動，面對大門。你想起交班簿上那條：正常現象，不要看超過十秒。",
    choices: (s) => s.monitorSeconds === 0
      ? [
          { id: "watch", label: "繼續看", stay: true, timeCost: 0,
            resolve: (s2, c) => {
              s2.monitorSeconds = 7;
              c.narrate("一秒。兩秒。……七秒。他不動。你發現你在數。");
            } },
          { id: "away", label: "移開視線",
            resolve: (s2, c) => { c.narrate("你把畫面切走，低頭翻交班簿。沒事。——但你發現，你剛才數了。"); } },
        ]
      : [
          { id: "watch2", label: "再看一下",
            resolve: (s2, c) => {
              s2.monitorSeconds = 11;
              s2.watchedTooLong = true;
              c.narrate("十一秒。你切回櫃台畫面的時候，那個人影在你背後。你回頭。沒有人。監視器裡，大門外，也沒有人了。");
            } },
          { id: "away2", label: "現在移開",
            resolve: (s2, c) => { c.narrate("你在第十秒之前移開了。沒事。大廳很靜。交班簿那一條，你決定相信。"); } },
        ],
    timeout: (s) => {
      s.watchedTooLong = true;
      narrate(s, "你回過神的時候，不記得自己看了多久。畫面裡沒有人。你數到幾了？你不記得。你只記得你數過。");
    },
  },
  {
    id: "ev-complaint",
    window: [1650, 1690], // 03:30–04:10
    prompt: "電梯門開了——你沒聽見它運轉的聲音。一個男人走到櫃台前，自稱 704 的客人，聲音壓得很低：「隔壁房間在學我說話。」",
    choices: [
      { id: "deflect", label: "「明早為您處理」",
        resolve: (s, c) => { c.narrate("你照守則回答。他點點頭，轉身上樓了。你低頭看登記簿——704 那一格是空的。可是交班簿上，前任明明寫著：那格已經寫了。"); } },
      { id: "upstairs", label: "親自上樓查看",
        resolve: (s, c) => {
          s.wentUpstairs = true;
          c.narrate("你把「不要離開櫃台超過五分鐘」留在了櫃台上。七樓的走廊很長，比你記得的任何走廊都長。704 隔壁的門開著，裡面的人背對你，正在學你說話——用的是你待會兒才要說的句子。");
        } },
    ],
    timeout: (s) => narrate(s, "他站在櫃台前等回答，等著等著，像是自己忘了要問什麼，轉身上樓了。你鬆了口氣——然後你想起來，他上樓的方向，沒有樓梯。"),
  },
  {
    id: "ev-colleague",
    window: [1740, 1790], // 05:00–05:50
    prompt: "大門開了。一個穿本館制服的人走進來，胸口的名牌你沒見過：「辛苦了，我來接班。」守則說 06:00 下班。交班簿說，穿制服的也不能開——可是他已經進來了。",
    choices: [
      { id: "handover", label: "把鑰匙給他",
        resolve: (s, c) => {
          s.gaveKeysEarly = true;
          c.narrate("他接過鑰匙，笑著說：「你可以走了。」你站起來，走向大門。玻璃門外的天是灰的——但不是早上那種灰。");
        } },
      { id: "wait", label: "請他等到六點",
        resolve: (s, c) => { c.narrate("你說，六點才交班。他愣了一下，笑著說：「你做得很好。」然後在大廳沙發坐下，翻一本你沒見過的雜誌。你不敢問他在看什麼。"); } },
    ],
    timeout: (s) => narrate(s, "他就站在那裡，笑著，不說話，一直站到六點。你沒敢看他。你們就這樣，一起等天亮。"),
  },
];

// 連鎖事件：第一晚只有掛斷電話的後續。
const FOLLOWUPS = {
  "ev-phone2": {
    id: "ev-phone2",
    prompt: "電話又響了。一聲。兩聲。三聲。它沒有要停的意思，第四聲、第五聲，一直響。",
    choices: [
      { id: "answer", label: "接起來",
        resolve: (s, c) => {
          s.phoneMarked = true;
          c.narrate("你接了。聽筒裡是收訊不良的呼吸聲，很遠，又很近。然後，一個聲音說：「找到你了。」線斷了。你決定今晚剩下的電話都不接。");
        } },
      { id: "let-ring", label: "讓它響完",
        resolve: (s, c) => { c.narrate("你盯著電話，數到第十一聲，它停了。大廳的燈好像暗了一格。你沒有起來確認。"); } },
    ],
    timeout: (s) => narrate(s, "你沒有接。它響到第十一聲，停了。大廳的燈好像暗了一格。你沒有起來確認。"),
  },
};

function findEventDef(id) {
  return EVENTS.find((e) => e.id === id) || FOLLOWUPS[id] || null;
}

// ── 衍生狀態：事件排程 ──
// 每步呼叫一次：沒有事件時，到點就讓事件上門；有事件時，逾時就套用 timeout。
// ── 環境敘事池 ──
// 到點就播，無論有無事件；錯過超過十分鐘不補播——你沒看見就是沒看見。
// 03:00 那條跟住客篇對時：同一秒，兩個視角。
const AMBIENCE = [
  { t: 1410, text: "冷氣的聲音低了一階。你抬頭看，出風口沒有在動。" },
  { t: 1440, text: "整點。打卡機自己亮了一下，又暗掉。沒有人打卡。" },
  { t: 1510, text: "大廳的沙發皮面響了一聲，像有人剛站起來。沙發是空的。" },
  { t: 1560, text: "電梯的樓層燈從 3 慢慢熄回 1。今晚沒有人按電梯。" },
  { t: 1590, text: "很遠的地方有吸塵器的聲音。這一層，只有你，和櫃台。" },
  { t: 1620, text: "三點整。大廳的燈暗了一秒。同一秒，電梯叮了一聲——樓層燈往上跳，停在一個你沒見過的數字。停了很久。然後燈熄了，電梯安安分分停在 1 樓，門沒有開過。" },
  { t: 1660, text: "玻璃門外起了霧。你記得入夜的時候是晴天。" },
  { t: 1710, text: "地毯的花紋，你數到第七種的時候，決定不要再數了。" },
  { t: 1755, text: "天快亮了。大廳的亮開始像早上的那種亮——但還不是。" },
];

function derive(state) {
  if (state.ended) return;

  // 環境敘事：每步先掃，到點即播，錯過不補。
  const ambHeard = state._ambHeard || (state._ambHeard = {});
  for (const a of AMBIENCE) {
    if (state.time >= a.t && !ambHeard[a.t]) {
      ambHeard[a.t] = true;
      if (state.time - a.t <= 10) narrate(state, a.text);
    }
  }

  if (!state.activeEvent) {
    // 連鎖事件優先
    if (state.pendingEvent && state.time >= state.pendingEvent.at) {
      const p = state.pendingEvent;
      state.pendingEvent = null;
      const def = FOLLOWUPS[p.id];
      if (def) {
        if (state.time >= p.until) {
          state.doneEvents.push(p.id);
          def.timeout(state);
        } else {
          state.activeEvent = p.id;
          state.activeUntil = p.until;
          narrate(state, def.prompt);
        }
      }
      return;
    }
    const ev = EVENTS.find((e) => !state.doneEvents.includes(e.id) && state.time >= e.window[0]);
    if (ev) {
      if (state.time >= ev.window[1]) {
        // 整個窗口被跳過：不等玩家，直接以超時收場
        state.doneEvents.push(ev.id);
        ev.timeout(state);
      } else {
        state.activeEvent = ev.id;
        state.activeUntil = ev.window[1];
        narrate(state, ev.prompt);
      }
    }
    return;
  }

  // 事件進行中：逾時強制收場
  if (state.time >= state.activeUntil) {
    const def = findEventDef(state.activeEvent);
    state.doneEvents.push(state.activeEvent);
    state.activeEvent = null;
    state.activeUntil = null;
    if (def) def.timeout(state);
  }
}

// ── 動作 ──
// 事件進行中：只有處置選項（強制回應；不回應就讓時間替你回應）。
// 待機時：讓時間流逝，或翻登記簿（無害，但 704 那格不無害）。
function actions(state, ctx) {
  if (state.ended) return [];

  if (state.activeEvent) {
    const def = findEventDef(state.activeEvent);
    if (!def) return [];
    const list = typeof def.choices === "function" ? def.choices(state) : def.choices;
    return list.map((choice) => ({
      id: `${def.id}:${choice.id}`,
      label: choice.label,
      onChoose: (s, c) => {
        choice.resolve(s, c);
        if (!choice.stay) {
          s.doneEvents.push(def.id);
          s.activeEvent = null;
          s.activeUntil = null;
        }
        s.time += choice.timeCost ?? CHOICE_MINUTES;
      },
    }));
  }

  return [
    { id: "idle", label: "待機（看著大廳，時間流逝）",
      onChoose: (s) => { s.time += 10; } },
    { id: "read-book", label: "翻開登記簿",
      onChoose: (s, c) => { c.narrate(registerText(s)); s.time += 1; } },
  ];
}

function registerText(s) {
  const lines = ["你翻開登記簿，今晚的格子一格一格安安分分。"];
  lines.push("你的視線停在 704 那一格——那裡有一個名字，字跡跟交班簿裡前任的一樣。「那格已經寫了。」原來是這個意思。");
  if (s.drunkAdmitted) lines.push("那個醉客的名字在，字跡是你的。你還是不記得你寫過。");
  if (s.openedDoor) lines.push("704 那一格暈開了一塊，像被水泡過。那個名字還在，在水漬底下。");
  if (s.time >= 1620) lines.push("你把今晚的格子從頭看了一遍。最下面多了一行，是你的名字。墨還沒乾。——你在值班，不在住宿。");
  return lines.join("");
}

// ── 結局 ──
// 判斷錯誤不是 game over；但有些判斷，當晚就結束。
const ENDINGS = [
  { id: "lost-corridor", label: "回不來的走廊",
    when: (s) => s.wentUpstairs,
    text: "你不記得你怎麼離開那條走廊的。——也許你沒有離開。隔天晚上 23:00，櫃台的打卡機響了一聲，沒有人打卡，但登記簿翻開了。第一晚，沒有交班。" },
  { id: "left-early", label: "提早下班",
    when: (s) => s.gaveKeysEarly,
    text: "你不記得你走到了哪。你記得最後一件事，是那串鑰匙離開你手心的重量。隔天，交班簿上多了一行字，字跡是你的：「提早來接班的那個，笑起來很標準。」第一晚，提前結束了。" },
  { id: "shift-end-dark", label: "交班（有什麼跟著你）",
    when: (s) => s.time >= SHIFT_END && (s.openedDoor || s.watchedTooLong || s.phoneMarked || s.drunkAdmitted),
    text: "06:00。天亮了，但大廳好像比昨天暗了一點。你把鑰匙放進抽屜，發現抽屜裡已經有一串鑰匙。交班簿翻開著，最新一行字跡是你的：「他今晚還會來。」你不記得你寫過。第一晚，算是交班了。" },
  { id: "shift-end", label: "交班",
    when: (s) => s.time >= SHIFT_END,
    text: "06:00。大門外的天是灰的，是早上那種灰。真正的早班推門進來，打哈欠，打卡。你把鑰匙放進抽屜，交班簿翻到今天那頁。你提筆，想寫點什麼給下一個夜班——最後只寫了：「守則在抽屜裡。你自己判斷。」第一晚，交班。" },
];

export const nightDesk = {
  id: "night-desk",
  title: "夜班櫃台",
  blurb: "23:00 上班。守則在抽屜裡。你自己判斷。",
  theme: "nightdesk",
  archive: { no: "RH-023", stamp: "已歸檔" },
  openingNarrative: "23:00。你打卡，坐上櫃台後面的椅子。\n大廳很亮，亮得讓你數得出地毯的花紋。電梯面板在視線的角落，你決定先不要數它有幾顆鈕。\n抽屜裡有一份印好的櫃台守則，和一本寫滿字的交班簿。前任的字很急，最後一頁只有一句：輪到你了。",
  initialTime: SHIFT_START,
  initialUnlockedRuleIds: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "h1", "h2", "h3"],
  rules: RULES,
  rulebooks: RULEBOOKS,
  initialState: {
    activeEvent: null,
    activeUntil: null,
    doneEvents: [],
    pendingEvent: null,
    monitorSeconds: 0,
    drunkAdmitted: false,
    explained4F: false,
    openedDoor: false,
    phoneMarked: false,
    watchedTooLong: false,
    wentUpstairs: false,
    gaveKeysEarly: false,
  },
  derive,
  actions,
  timeModel: "shift",
  isUrgent: (s) => !!s.activeEvent,
  endings: ENDINGS,
  ui: {
    visitLabel: (n) => `第 ${n} 次值班`,
    restart: "重新值班",
  },
};

export default nightDesk;
