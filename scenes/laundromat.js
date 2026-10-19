// Rule Horror — 地下洗衣店
// 投進去的衣服會回來；問題是，有時候回來的不是你的那一件。

import { narrate } from "../engine.js";

const START = 10; // 00:10
const END = 110;  // 01:50

const RULES = {
  l1: { book: "洗衣須知", text: "請在洗衣機停止後再開門。聽見筒內有人敲門時，請等到聲音停下。" },
  l2: { book: "洗衣須知", text: "失物籃內的衣物一律視為他人所有。不要試穿，不要聞。" },
  l3: { book: "洗衣須知", text: "最後一台洗衣機只收硬幣，不收代幣。投入後請留在店內。" },
  l4: { book: "洗衣須知", text: "凌晨兩點前請取走自己的衣物。沒有取走的，會由本店代為分類。" },
  p1: { book: "烘衣機上的便利貼", text: "「如果衣服口袋裡有你不記得的東西，先不要拿出來。」" },
  p2: { book: "烘衣機上的便利貼", text: "「第七台壞了。它顯示剩三分鐘的時候，才是真的開始洗。」" },
  p3: { book: "烘衣機上的便利貼", text: "「失物籃最底下那件外套不是失物。它在等主人。」" },
};
const RULEBOOKS = { "洗衣須知": {}, "烘衣機上的便利貼": {} };

const EVENTS = [
  { id: "knock", at: 28, prompt: "你選的第七台洗衣機停了。裡面傳來三下很輕的敲門聲。面板顯示 03:00，卻沒有在倒數。",
    choices: [
      { id: "wait", label: "等敲門聲停下", resolve: (s, c) => c.narrate("你站著等。敲門聲停了，面板從 03:00 跳到 02:59，洗衣機開始轉。你沒有看玻璃窗裡的倒影。") },
      { id: "open", label: "打開洗衣機門", resolve: (s, c) => { s.openedEarly = true; c.narrate("門一開，水沒有流出來。筒裡乾得像從沒洗過，只有你的衣服整整齊齊摺好，最上面放著一枚不屬於你的硬幣。") } },
    ], timeout: (s) => narrate(s, "你沒有動。三分鐘後，敲門聲變成洗衣機正常的轉動聲。你分不清是哪一刻開始正常的。") },
  { id: "coat", at: 55, prompt: "失物籃最底下露出一截深色外套袖子。口袋裡有東西在震動，像手機，但聲音不是鈴聲，是你家門鎖轉動的聲音。",
    choices: [
      { id: "leave", label: "把外套壓回失物籃", resolve: (s, c) => c.narrate("你把它壓回去。震動停了。失物籃底下那隻手也一起縮回去——你沒有真的看見，只是手指感覺到籃子忽然變輕。") },
      { id: "pocket", label: "摸外套口袋", resolve: (s, c) => { s.touchedCoat = true; c.narrate("你摸到一串鑰匙，其中一把是你家的。你把手抽回來時，口袋已經空了。店門外有人按了門鈴；地下室沒有門鈴。") } },
    ], timeout: (s) => narrate(s, "你轉開臉。外套口袋的震動持續了一會，然後像有人接起電話那樣斷掉。") },
  { id: "return", at: 82, prompt: "第七台終於停了。筒裡的衣服洗好了，但多了一件白襯衫。領口繡著你的名字，字體是你小時候學校制服的字體。",
    choices: [
      { id: "take-own", label: "只拿自己的衣服", resolve: (s, c) => { s.leftShirt = true; c.narrate("你把自己的衣服抱走，白襯衫留在筒裡。洗衣機門自己闔上，又開始轉。這一次面板顯示 00:10。") } },
      { id: "take-shirt", label: "把白襯衫也帶走", resolve: (s, c) => { s.tookShirt = true; c.narrate("你把它折進衣堆。口袋裡有一張繳費單，地址是這間洗衣店，收件人是你。繳費期限印著今天凌晨兩點。") } },
    ], timeout: (s) => narrate(s, "你沒有碰。白襯衫慢慢沉到筒底，像被看不見的水浸濕。下一秒，洗衣機又開始轉。") },
];
function find(id) { return EVENTS.find((x) => x.id === id); }
function derive(s) {
  if (s.ended) return;
  if (!s.activeEvent) {
    while (true) { const e = EVENTS.find((x) => !s.doneEvents.includes(x.id) && s.time >= x.at); if (!e) break;
      if (s.time >= e.at + 18) { s.doneEvents.push(e.id); e.timeout(s); } else { s.activeEvent = e.id; s.activeUntil = e.at + 18; narrate(s, e.prompt); break; } }
  } else if (s.time >= s.activeUntil) { const e = find(s.activeEvent); s.doneEvents.push(s.activeEvent); s.activeEvent = null; s.activeUntil = null; e?.timeout(s); }
}
function actions(s) {
  if (s.ended) return [];
  if (s.activeEvent) { const e = find(s.activeEvent); return e.choices.map((x) => ({ id: `${e.id}:${x.id}`, label: x.label, onChoose: (state, ctx) => { x.resolve(state, ctx); state.doneEvents.push(e.id); state.activeEvent = null; state.activeUntil = null; state.time += 3; } })); }
  const out = [
    { id: "sit", label: "坐在塑膠椅上等", onChoose: (state, ctx) => { ctx.narrate("烘衣機一台一台轉。沒有人的那幾台也在轉，節奏剛好跟你呼吸錯開半拍。", "narration"); state.time += 7; } },
    { id: "machine", label: "看第七台洗衣機", onChoose: (state, ctx) => { ctx.narrate(s.seenMachine ? "面板還是 03:00。你決定不要算自己看了幾次。" : "第七台的玻璃窗內只映著店裡的燈。你的衣服在轉，倒影卻沒有。", "narration"); state.seenMachine = true; state.time += 1; } },
  ];
  if (!s.foundNote) out.push({ id: "note", label: "讀烘衣機上的便利貼", onChoose: (state, ctx) => { state.foundNote = true; state.unlockedRuleIds.push("p1", "p2", "p3"); ctx.narrate("便利貼被熱氣烤得捲起來，背面還有前一個人留下的指印。上面的字已經被看過很多次。", "item"); state.time += 1; } });
  return out;
}
const ENDINGS = [
  { id: "sorted", label: "代為分類", when: (s) => s.time >= END && (s.openedEarly || s.touchedCoat || s.tookShirt), text: "01:50。店內廣播第一次響起：『逾時衣物，本店將代為分類。』你抱著衣服站在原地，才發現懷裡那疊裡有幾件不是你的。也有幾件，你已經想不起來原本是不是你的。第七台開始下一輪。" },
  { id: "clean", label: "洗淨離開", when: (s) => s.time >= END, text: "01:50。你把衣服帶走，沒有回頭看失物籃。走上樓梯時，口袋裡多了一枚硬幣，冷得不自然。你沒有把它丟掉；你只是一路握著，直到回到有門鎖聲的地方。" },
];
export const laundromat = {
  id: "laundromat", title: "地下洗衣店", blurb: "第七台顯示剩三分鐘時，才是真的開始洗。",
  archive: { no: "RH-017", stamp: "分類中" },
  openingNarrative: "00:10。地下洗衣店只開了一半的燈。你把衣服放進第七台，投了硬幣。\n\n機器開始轉之前，面板先顯示：03:00。你記得這台洗衣機沒有三分鐘的行程。",
  initialTime: START, initialUnlockedRuleIds: ["l1", "l2", "l3", "l4"], rules: RULES, rulebooks: RULEBOOKS,
  initialState: { activeEvent: null, activeUntil: null, doneEvents: [], foundNote: false, seenMachine: false, openedEarly: false, touchedCoat: false, leftShirt: false, tookShirt: false },
  derive, actions, endings: ENDINGS, ui: { visitLabel: (n) => `第 ${n} 次洗衣`, restart: "重新洗衣" },
};
export default laundromat;
