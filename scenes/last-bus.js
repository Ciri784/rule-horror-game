// Rule Horror — 末班公車
//
// 車站沒有班表。最危險的不是搭錯車，而是讓班表知道你在等哪一班。

import { narrate } from "../engine.js";

const START = 23 * 60 + 37;
const END = 24 * 60 + 48;
const DAY = 24 * 60;

const RULES = {
  b1: { book: "候車亭公告", text: "末班車到站前，請站在黃線後。車門開了，先看車頭的路線牌，再決定要不要上車。" },
  b2: { book: "候車亭公告", text: "路線牌上沒有站名時，不要問司機。等下一班。" },
  b3: { book: "候車亭公告", text: "有人在車上叫出你的名字，不代表他認得你。不要回頭找聲音。" },
  b4: { book: "候車亭公告", text: "今晚只有一班車會停在這裡。它的車頭是 17。" },
  n1: { book: "座椅下的便條", text: "「17 不是路線，是座位數。看到 17 就跑。」" },
  n2: { book: "座椅下的便條", text: "「班表被撕掉不是有人惡作劇。不要把碎紙拼回去。」" },
  n3: { book: "座椅下的便條", text: "「上車前數車內的人。少一個才是對的。」" },
};

const RULEBOOKS = { "候車亭公告": {}, "座椅下的便條": {} };

function effectiveTime(s) { return s.time + (s.crossedMidnight ? DAY : 0); }
function advance(s, minutes) {
  s.time += minutes;
  if (s.time >= DAY) { s.time %= DAY; s.crossedMidnight = true; }
}

const EVENTS = [
  {
    id: "bus-blank",
    at: 23 * 60 + 48,
    prompt: "遠處有車燈靠近。車停得很準，車門開了。路線牌是黑的，連終點站都沒有。司機隔著擋風玻璃看著你，沒有催。",
    choices: [
      { id: "wait", label: "留在黃線後，等下一班", resolve: (s, c) => c.narrate("你沒有動。車門等了十秒，自己關上。車開走時，車內所有乘客同時轉頭看你。你沒有數。") },
      { id: "ask", label: "問司機這班到哪", resolve: (s, c) => { s.askedDriver = true; c.narrate("你問出口，司機抬起一根手指，指向候車亭的玻璃。玻璃上倒映著車內——每一個座位都坐著你。車門還開著。") } },
    ],
    timeout: (s) => narrate(s, "車門關上。你忽然確定剛才那班車沒有輪胎，只有車燈在地上慢慢退遠。"),
  },
  {
    id: "paper",
    at: DAY + 3,
    prompt: "風從路口吹過來，把被撕掉的班表碎片推到你腳邊。碎紙剛好拼得出一行：00:17。背面還有你的名字。",
    choices: [
      { id: "leave", label: "把碎紙踩回陰影裡", resolve: (s, c) => c.narrate("你沒有撿。風停了，碎紙卻還在往陰影裡滑，像終於知道該回哪裡。") },
      { id: "piece", label: "把碎紙拼起來", resolve: (s, c) => { s.piecedTimetable = true; c.narrate("你拼出完整的時間：00:17。下一行是『上車者：』，後面空著。筆在你口袋裡動了一下，像有人從裡面握住它。") } },
    ],
    timeout: (s) => narrate(s, "碎紙被風翻了一面。你看到背後不是你的名字，是你的筆跡。你決定不要研究差別。"),
  },
  {
    id: "bus-17",
    at: DAY + 17,
    prompt: "00:17。真正有聲音的公車從路口轉過來，煞車、打方向燈、車門氣壓洩掉——每一樣都很正常。路線牌亮著：17。車裡坐著十六個人，全都低著頭。司機沒有看你。",
    choices: [
      { id: "board", label: "上車", resolve: (s, c) => { s.boarded = true; c.narrate("你踏上第一階。車內的第十七張座位是空的，正對著你。所有人仍然低著頭。投幣箱亮起來，顯示的不是金額，是你的名字。") } },
      { id: "count", label: "站在黃線後數人", resolve: (s, c) => { s.countedRiders = true; c.narrate("你數到十六。再數一次，還是十六。最後一排有個人抬起頭，嘴型像在說：少一個。你沒有上車。") } },
      { id: "run", label: "離開候車亭", resolve: (s, c) => { s.leftStop = true; c.narrate("你往反方向走，走了很久才發現自己一直沿著同一塊破掉的人行道繞圈。回到候車亭時，17 還停在原地，車門還開著。") } },
    ],
    timeout: (s) => narrate(s, "你沒動。17 號車等了一分鐘，車門關上，開走。最後一排那個人一直看著你，直到車燈轉過街角。"),
  },
];

function findEvent(id) { return EVENTS.find((e) => e.id === id); }

function derive(s) {
  if (s.ended) return;
  const now = effectiveTime(s);
  if (!s.activeEvent) {
    // 一次跨過多個窗口時，過期事件直接套 timeout，直到找到仍可處置的那件。
    // 不然從背景切回頁面會讓昨天的公車一班一班補播，時鐘又要造反。
    while (true) {
      const event = EVENTS.find((e) => !s.doneEvents.includes(e.id) && now >= e.at);
      if (!event) break;
      if (now >= event.at + 24) {
        s.doneEvents.push(event.id);
        event.timeout(s);
      } else {
        s.activeEvent = event.id;
        s.activeUntil = event.at + 24;
        narrate(s, event.prompt);
        break;
      }
    }
    return;
  }
  if (now >= s.activeUntil) {
    const event = findEvent(s.activeEvent);
    s.doneEvents.push(s.activeEvent);
    s.activeEvent = null;
    s.activeUntil = null;
    if (event) event.timeout(s);
  }
}

function actions(s, ctx) {
  if (s.ended) return [];
  if (s.activeEvent) {
    const event = findEvent(s.activeEvent);
    return event.choices.map((choice) => ({
      id: `${event.id}:${choice.id}`,
      label: choice.label,
      onChoose: (state, c) => {
        choice.resolve(state, c);
        state.doneEvents.push(event.id);
        state.activeEvent = null;
        state.activeUntil = null;
        advance(state, 3);
      },
    }));
  }
  return [
    { id: "wait", label: "留在候車亭等", onChoose: (state, c) => { c.narrate("候車亭的燈閃了一下，又亮回來。路上沒有車，沒有風，遠處的紅綠燈還在按自己的節奏換色。", "narration"); advance(state, 5); } },
    { id: "notice", label: "看候車亭玻璃", onChoose: (state, c) => { c.narrate(sawGlass(state)); advance(state, 2); } },
    ...(!s.foundNote ? [{ id: "note", label: "撿起座椅下的便條", onChoose: (state, c) => { state.foundNote = true; state.unlockedRuleIds.push("n1", "n2", "n3"); c.narrate("你從座椅下抽出一張摺過很多次的便條。紙很薄，像被人反覆攤開又摺回去。上面寫著三條不太像公告的話。", "item"); advance(state, 1); } }] : []),
  ];
}

function sawGlass(s) {
  const lines = ["玻璃上映著馬路、黃線和你。倒影的你站在黃線內側。你沒有。"];
  if (s.piecedTimetable) lines.push("你口袋裡的班表碎紙透出一點白。玻璃裡的你正把筆交給某個看不見的人。");
  if (s.countedRiders) lines.push("你想起那十六個低著頭的人。玻璃裡多了一個，第十七個站在你背後。你沒有回頭。");
  return lines.join("");
}

const ENDINGS = [
  { id: "on-the-list", label: "第十七位乘客", when: (s) => effectiveTime(s) >= END && s.boarded, at: END,
    text: "車開得很穩。你坐在第十七張座位，身旁的人終於抬起頭。每一張臉都認得你，只是年紀不一樣。司機報站：『下一站，候車亭。』你看向窗外，自己還站在黃線後，等最後一班車。" },
  { id: "missed", label: "錯過末班", when: (s) => effectiveTime(s) >= END && (s.askedDriver || s.piecedTimetable || s.leftStop), at: END,
    text: "00:48。路上恢復安靜。你以為自己錯過末班車，直到候車亭玻璃亮起一行新的班表：下一班 00:17，請提前十分鐘候車。日期是明天。你不知道明天是不是已經開始了。" },
  { id: "walked-home", label: "走回去", when: (s) => effectiveTime(s) >= END, at: END,
    text: "00:48。你離開候車亭，沿著還有路燈的方向走。走出兩個街口後，你回頭看了一眼：站牌還在，玻璃還亮著，黃線後站著一個人。那個人沒有抬頭。你繼續走，沒有數自己走了幾步。" },
];

export const lastBus = {
  id: "last-bus",
  title: "末班公車",
  blurb: "班表被撕掉了，但有人還在等那一班車。",
  theme: "bus",
  archive: { no: "RH-025", stamp: "夜間留置" },
  openingNarrative: "你站在一個不熟的公車站。候車亭玻璃上有幾行被指甲刮出來的字，班表被人整張撕掉。\n\n路的另一頭，一對車燈正往這裡來。",
  initialTime: START,
  initialUnlockedRuleIds: ["b1", "b2", "b3", "b4"],
  rules: RULES,
  rulebooks: RULEBOOKS,
  initialState: { activeEvent: null, activeUntil: null, doneEvents: [], foundNote: false, askedDriver: false, piecedTimetable: false, boarded: false, countedRiders: false, leftStop: false },
  derive,
  actions,
  endings: ENDINGS,
  ui: { visitLabel: (n) => `第 ${n} 次候車`, restart: "回到候車亭" },
};

export default lastBus;
