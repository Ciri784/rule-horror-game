// Rule Horror — 停業診所
// 最後一位病人不是在等醫生；他在等自己的號碼被叫到。

import { narrate } from "../engine.js";

const START = 21 * 60 + 40;
const END = 23 * 60 + 55;

const RULES = {
  c1: { book: "候診須知", text: "本診所 22:00 停止掛號。叫到號碼後，請在三分鐘內進入診間。" },
  c2: { book: "候診須知", text: "螢幕顯示的號碼只供當事人確認。不要替別人回答。" },
  c3: { book: "候診須知", text: "醫師離開診間時，請留在原位。不要跟去問診間裡還有誰。" },
  c4: { book: "候診須知", text: "最後一號叫完後，請把號碼牌放回抽取機。不要帶走。" },
  m1: { book: "藥袋背面", text: "「今晚沒有醫師排班。聽見叫號也不要進去。」" },
  m2: { book: "藥袋背面", text: "「螢幕跳號的時候，輪到的不是下一位。」" },
  m3: { book: "藥袋背面", text: "「如果你的號碼最後才出現，別急著高興。你只是終於被找到。」" },
};
const RULEBOOKS = { "候診須知": {}, "藥袋背面": {} };

const EVENTS = [
  { id: "skip", at: 22 * 60 + 5,
    prompt: "叫號螢幕從 031 跳到 033。候診室裡唯一的老人抬起頭，手上的牌是 032。他看著你，像在等你替他決定。",
    choices: [
      { id: "tell", label: "告訴他螢幕跳號了", resolve: (s, c) => { s.correctedScreen = true; c.narrate("你說出口後，螢幕閃了一下，改成 032。老人沒有進去，只把號碼牌翻過來——背面印著你的姓名和出生年月日。") } },
      { id: "silent", label: "假裝沒看見", resolve: (s, c) => c.narrate("你沒有說話。老人等了一會，自己走進診間。門關上的時候，叫號螢幕改成 031，像什麼都沒有發生。") },
    ], timeout: (s) => narrate(s, "老人站起來，又坐下。螢幕一直顯示 033，候診室裡沒有人動。") },
  { id: "doctor", at: 22 * 60 + 42,
    prompt: "診間門開了。一個穿白袍的人背對你走出來，手上拿著一疊病歷。最上面那本封面寫著你的名字。那人往後門走，沒有回頭。",
    choices: [
      { id: "stay", label: "留在原位", resolve: (s, c) => c.narrate("你照須知坐著。白袍消失在後門後，診間裡傳來翻病歷的聲音。叫號螢幕暗了三秒，再亮起時顯示：請下一位。") },
      { id: "follow", label: "跟去看病歷", resolve: (s, c) => { s.followedDoctor = true; c.narrate("後門外沒有走廊，只有另一間候診室。椅子上坐滿人，每個人都拿著和你一樣的號碼牌。最前面那個人抬頭，是你。") } },
    ], timeout: (s) => narrate(s, "你沒動。後門闔上後，病歷從門縫底下滑回來一張。上面診斷欄空著，只蓋了『已候診』。") },
  { id: "last", at: 23 * 60 + 20,
    prompt: "23:20。叫號螢幕終於顯示最後一號：044。抽取機裡吐出一張新號碼牌，正好落在你鞋邊。上面也是 044。診間裡有人說：『下一位。』",
    choices: [
      { id: "return", label: "把號碼牌放回抽取機", resolve: (s, c) => { s.returnedTicket = true; c.narrate("你把 044 推回機器。它吞進去後，又吐出一張空白號碼牌。診間裡安靜了一下，接著有人很輕地說：『那就不是你。』") } },
      { id: "enter", label: "拿著 044 走進診間", resolve: (s, c) => { s.enteredClinic = true; c.narrate("診間裡沒有醫師。桌上放著一本病歷，已經翻到最後一頁。病人姓名那欄是你的，初診日期是明天。你坐下，聽見門外有人抽了一張新的號碼牌。") } },
    ], timeout: (s) => narrate(s, "你沒有撿。號碼牌自己滑回抽取機底下，螢幕仍顯示 044。診間裡的人沒有再叫第二次。") },
];

function find(id) { return EVENTS.find((e) => e.id === id); }
function derive(s) {
  if (s.ended) return;
  if (!s.activeEvent) {
    while (true) {
      const e = EVENTS.find((x) => !s.doneEvents.includes(x.id) && s.time >= x.at);
      if (!e) break;
      if (s.time >= e.at + 20) { s.doneEvents.push(e.id); e.timeout(s); }
      else { s.activeEvent = e.id; s.activeUntil = e.at + 20; narrate(s, e.prompt); break; }
    }
  } else if (s.time >= s.activeUntil) {
    const e = find(s.activeEvent); s.doneEvents.push(s.activeEvent); s.activeEvent = null; s.activeUntil = null; e?.timeout(s);
  }
}
function actions(s) {
  if (s.ended) return [];
  if (s.activeEvent) {
    const e = find(s.activeEvent);
    return e.choices.map((x) => ({ id: `${e.id}:${x.id}`, label: x.label, onChoose: (state, ctx) => { x.resolve(state, ctx); state.doneEvents.push(e.id); state.activeEvent = null; state.activeUntil = null; state.time += 3; } }));
  }
  const list = [
    { id: "wait", label: "坐在候診椅上等", onChoose: (state, ctx) => { ctx.narrate("候診室的時鐘走得很慢。牆上的衛教海報褪色到只剩『請耐心等候』五個字。", "narration"); state.time += 8; } },
    { id: "screen", label: "看叫號螢幕", onChoose: (state, ctx) => { ctx.narrate(s.seenScreen ? "螢幕還在跳。你不確定它跳過的是號碼，還是人。" : "螢幕顯示 031。你記得剛進來時也是 031。", "narration"); state.seenScreen = true; state.time += 1; } },
  ];
  if (!s.foundBag) list.push({ id: "bag", label: "撿起椅下的藥袋", onChoose: (state, ctx) => { state.foundBag = true; state.unlockedRuleIds.push("m1", "m2", "m3"); ctx.narrate("椅子底下卡著一個沒有藥的藥袋。背面有人用很急的字寫了三句話，像是留給沒來得及走的人。", "item"); state.time += 1; } });
  return list;
}
const ENDINGS = [
  { id: "admitted", label: "初診完成", when: (s) => s.time >= END && (s.enteredClinic || s.followedDoctor), text: "23:55。診所的鐵門落下。你坐在診間裡，病歷被放到面前，醫師簽名欄已經有字。門外的叫號螢幕亮起：044。你忽然知道，明天晚上還會有人坐在候診椅上，等這個號碼被跳過。" },
  { id: "unregistered", label: "未掛號離開", when: (s) => s.time >= END, text: "23:55。鐵門還沒落下前，你走出去，把空白號碼牌留在抽取機旁。街上很冷。你回頭看了一眼，診所招牌已經暗了，只有叫號螢幕隔著玻璃亮著：下一位。你沒有加快腳步。" },
];

export const closedClinic = {
  id: "closed-clinic", title: "停業診所", blurb: "22:00 停止掛號。最後一號還在等被叫到。",
  archive: { no: "RH-044", stamp: "候診中" },
  openingNarrative: "21:40。診所外的鐵門拉了一半，候診室卻還亮著。你推門進去，抽取機吐出一張號碼牌，沒有人按它。\n\n螢幕顯示：031。椅子上只有你和一個低著頭的老人。",
  initialTime: START, initialUnlockedRuleIds: ["c1", "c2", "c3", "c4"], rules: RULES, rulebooks: RULEBOOKS,
  initialState: { activeEvent: null, activeUntil: null, doneEvents: [], foundBag: false, seenScreen: false, correctedScreen: false, followedDoctor: false, returnedTicket: false, enteredClinic: false },
  derive, actions, timeModel: "shift", endings: ENDINGS, ui: { visitLabel: (n) => `第 ${n} 次候診`, restart: "重新候診" },
};
export default closedClinic;
