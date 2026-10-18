// Rule Horror — 末班公車
//
// 凌晨的站牌沒有班表。你只需要搭對那一班；問題是每一班都停。

import { narrate } from "../engine.js";

const RULES = {
  r1: { subject: "站牌", book: "臨時行車公告", text: "末班車只停一次。車門開了，先看車頭號碼，再上車。" },
  r2: { subject: "站牌", book: "臨時行車公告", text: "本路線沒有 0 號車。看見 0，請退到黃線後面。" },
  r3: { subject: "站牌", book: "臨時行車公告", text: "司機若問你要去哪裡，只說站牌上寫的終點站。不要說住址。" },
  r4: { subject: "站牌", book: "臨時行車公告", text: "上車後坐在最後一排以外。不要坐空著的雙人座靠窗位置。" },
  r5: { subject: "塗改字", book: "候車亭玻璃", text: "「班表被撕掉不是因為停駛。是因為有人把『到站』當成了『回家』。」" },
  r6: { subject: "塗改字", book: "候車亭玻璃", text: "「真正的末班車，車內廣播不會報下一站。它會叫你的名字。」" },
};

const RULEBOOKS = { "臨時行車公告": {}, "候車亭玻璃": {} };

function choices(s) {
  if (!s.firstBus) return [
    { id: "read-sign", label: "讀臨時行車公告", onChoose: (state, ctx) => {
      state.readSign = true;
      ctx.narrate("公告貼得很新，膠帶卻泛黃。最下面印著終點站：『中央車站』。你不記得這附近有中央車站。");
      state.time += 3;
    } },
    { id: "wait", label: "留在黃線後等車", onChoose: (state, ctx) => {
      state.time += 8;
      ctx.narrate("路燈嗡了一聲。遠處有車燈，靠近後又轉進你沒見過的巷子。站牌上的時間沒有變。");
    } },
    { id: "step-forward", label: "站到黃線前", onChoose: (state, ctx) => {
      state.crossedLine = true;
      state.time += 2;
      ctx.narrate("柏油路比人行道低一點。你踩下去，發現路面是溫的，像剛有車開過——但街上很空。");
    } },
  ];
  if (s.firstBus === true && !s.boarded && !s.left) return [
    { id: "inspect-number", label: "看車頭號碼", onChoose: (state, ctx) => {
      state.checkedNumber = true;
      ctx.narrate("車頭電子板閃了三下：0、0、0。司機隔著擋風玻璃看你，沒有催。你忽然知道這班車會一直等到你做決定。\n\n它不是末班車。它只是知道你在等。 ");
      state.time += 1;
    } },
    { id: "board-zero", label: "上 0 號車", onChoose: (state, ctx) => {
      state.boarded = true;
      state.wrongBus = true;
      ctx.narrate("你踏上車。車門在你身後關得很輕。車內沒有乘客，最後一排那個靠窗雙人座空著，座墊上壓著一張你的悠遊卡。司機開車了。", "omen");
      state.time += 4;
    } },
    { id: "let-pass", label: "退回黃線後，讓它開走", onChoose: (state, ctx) => {
      state.firstBus = "refused";
      state.time += 5;
      ctx.narrate("你退後一步。0 號車關門，沒有發動，卻慢慢往前滑。轉過街角前，車內的燈一盞一盞熄掉。最後那扇窗裡，好像坐著一個剛剛才上車的人。 ");
    } },
  ];
  if (s.boarded) return [
    { id: "sit-window", label: "坐到最後一排靠窗的空位", onChoose: (state, ctx) => {
      state.satWindow = true;
      state.time += 2;
      ctx.narrate("你坐下。座墊很暖，像有人剛起身。窗外倒退的不是街景，是你剛才站的候車亭；它一直在窗外，退不遠，也靠不近。 ");
    } },
    { id: "ask-stop", label: "問司機這班車到哪裡", onChoose: (state, ctx) => {
      state.gaveAddress = true;
      state.time += 2;
      ctx.narrate("司機沒有回頭。廣播喀了一聲，用很禮貌的聲音唸出你的住址。你沒有告訴過他。 ");
    } },
    { id: "pull-bell", label: "按下車鈴", onChoose: (state, ctx) => {
      state.pulledBell = true;
      state.time += 3;
      ctx.narrate("鈴沒有響。車內廣播先響了：『下一站，中央車站。』接著停了一拍，補了一句：『請勿下車。』");
    } },
  ];
  return [
    { id: "wait-real", label: "繼續等真正的末班車", onChoose: (state, ctx) => {
      state.time += 10;
      ctx.narrate("站牌背面的廣告紙捲起一角。底下不是舊海報，是另一張公告：『末班車延誤。請勿離開候車亭。』你不知道它是什麼時候貼上的。 ");
    } },
    { id: "walk-home", label: "沿著路燈走回家", onChoose: (state, ctx) => {
      state.left = true;
      state.time += 5;
      ctx.narrate("你走了兩個街口，回頭看。候車亭還在同一個位置，離你一樣遠。0 號車停在那裡，車門開著。 ");
    } },
  ];
}

const ENDINGS = [
  { id: "route-zero", label: "0 號車", when: (s) => s.boarded && (s.satWindow || s.gaveAddress || s.pulledBell), text: "車停了。車門外是中央車站，月台空得很完整。司機終於回頭，看著你說：『到站了。你上次也是在這裡下車。』你想問上次是什麼時候，卻發現手上拿著一張已經刷過的票。日期是明天。" },
  { id: "walk-loop", label: "沒有離開的路", when: (s) => s.left, text: "你沿著路燈走，走過便利商店、診所、那面塗了白漆的牆。第四盞路燈底下，你又看見候車亭。站牌上的公告被撕掉一半，只留下終點站三個字：中央車站。你決定再等一班。" },
  { id: "real-last-bus", label: "末班車", when: (s) => s.firstBus === "refused" && s.time >= 1485, text: "一台普通的末班車靠站。車頭號碼你認得，司機也只是司機。他問你去哪裡，你看著公告，說出終點站的名字。車開走時，候車亭的玻璃反射出一個還在等車的人影——它沒有上來。" },
];

function derive(state) {
  if (state.ended || state.firstBus) return;
  if (state.time >= 1465) {
    state.firstBus = true;
    narrate(state, "一台公車滑進站。它沒有煞車的聲音，車頭電子板也沒有立刻亮起。司機停得很準，剛好停在你面前。", "omen", 1465);
  }
}

export const lastBus = {
  id: "last-bus",
  title: "末班公車",
  blurb: "凌晨的站牌沒有班表，但每一班車都會停。",
  theme: "bus",
  archive: { no: "RH-025", stamp: "夜間留置" },
  // 敘事流已由 UI 自動標記目前時間；不要在本文再手寫一份時間。
  openingNarrative: "你站在一個不熟的公車站。候車亭玻璃上有幾行被指甲刮出來的字，班表被人整張撕掉。\n\n路的另一頭，一對車燈正往這裡來。",
  initialTime: 1457, // 00:17
  initialUnlockedRuleIds: ["r1", "r2", "r3", "r4", "r5", "r6"],
  rules: RULES,
  rulebooks: RULEBOOKS,
  initialState: { firstBus: false, readSign: false, crossedLine: false, checkedNumber: false, boarded: false, wrongBus: false, satWindow: false, gaveAddress: false, pulledBell: false, left: false },
  derive,
  actions: choices,
  endings: ENDINGS,
  ui: { visitLabel: (n) => `第 ${n} 次候車`, restart: "重新候車" },
};

export default lastBus;
