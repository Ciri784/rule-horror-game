// Rule Horror — 深夜便利商店（store)
//
// 視角再翻轉：你不是住房的客人，也不是被守則約束的櫃台——
// 你是有事要做的大夜班店員。飯店是待著等事情發生，超商是
// 事情在你補貨、結帳、報廢的時候發生。
//
// 這個場所的「它」：空位。架上不能留空位，你不補，它自己補。
//
// 23:00 上班，07:00 下班（shift 時鐘 1380→1860）。事件依時間窗
// 自己找上門；任務（補貨、報廢）則由玩家主動做，做了才有事。

import { narrate } from "../engine.js";

const SHIFT_START = 23 * 60;   // 1380 = 23:00
const SHIFT_END = 31 * 60;     // 1860 = 隔天 07:00(formatTime 會 %24 顯示 07:00)
const CHOICE_MINUTES = 3;      // 每個處置花掉的遊戲時間
const DISCARD_OK = 28 * 60;    // 1680 = 04:00,報廢解禁

// ── 守則與便簽 ──
// 官方守則印在 A4 上,收銀台抽屜裡;前輩的便簽貼在收銀機底下。
// 兩份文件開場全給,哪條此刻生效,玩家自己判斷。
const RULES = {
  s1: { subject: "守則", book: "大夜班守則",
        text: "上班時間 23:00–07:00。打過上班卡之後,下班前不要再碰打卡機。" },
  s2: { subject: "守則", book: "大夜班守則",
        text: "補貨從貨架最裡面開始,一排一排補滿。架上不能留空位。" },
  s3: { subject: "守則", book: "大夜班守則",
        text: "關東煮 02:00 關火。關火之後不管客人出多少錢,都回答賣完了。" },
  s4: { subject: "守則", book: "大夜班守則",
        text: "自動門開了卻沒有人進來時,低頭數到十。不要看門外。" },
  s5: { subject: "守則", book: "大夜班守則",
        text: "報廢品 04:00 之後才能丟。裝進後門的綠色袋子,袋口綁兩圈,丟完不要回頭看。",
        mutate: { from: "袋口綁兩圈", to: "袋口不用綁", when: (s) => !!s.readLastPage } },
  s6: { subject: "守則", book: "大夜班守則",
        text: "客人問有沒有賣某樣東西,查收銀機旁的庫存本。本上沒有的,回答沒有。不要說我去後面找。" },
  s7: { subject: "守則", book: "大夜班守則",
        text: "監視器如果出現不屬於本店的畫面,切到下一台。本店只有六台。" },
  s8: { subject: "守則", book: "大夜班守則",
        text: "天亮的標準是打卡機的時間,不是窗外的亮度。07:00 之前,窗外再亮,都不是早上。",
        mutate: { from: "07:00", to: "06:00", when: (s) => !!s.countedBags } },

  n1: { subject: "前輩", book: "給下一個大夜",
        text: "「守則第二條是認真的。你不補,它自己補。你不會想知道它補了什麼。」" },
  n2: { subject: "前輩", book: "給下一個大夜",
        text: "「關東煮的湯杓,關火之後不要洗,插著。早上再洗。」" },
  n3: { subject: "前輩", book: "給下一個大夜",
        text: "「有個客人只會說跟昨天一樣。收銀機會自己跳出金額,照收,不要找他錢。」" },
  n4: { subject: "前輩", book: "給下一個大夜",
        text: "「04:44 燈會閃。閃完去數綠色袋子。數完不要想剛才是幾個。」" },
  n5: { subject: "前輩", book: "給下一個大夜",
        text: "「庫存本最後一頁不要翻。不是鬼故事那種不要翻,是真的對你比較好。」" },
};

const RULEBOOKS = {
  "大夜班守則": {},
  "給下一個大夜": {},
};

// ── 事件池 ──
// 時間窗 [start, end](分鐘)。進窗強制找上玩家;逾時沒處理,timeout 也是一種處置。
const EVENTS = [
  {
    id: "ev-door",
    window: [1420, 1450], // 23:40–00:10
    prompt: "自動門開了。感應聲很標準,門滑開得也很標準——門外沒有人。街上也沒有人。門就這樣開著,像在等誰走進來。",
    choices: [
      { id: "count-ten", label: "低頭數到十",
        resolve: (s, c) => { c.narrate("你低下頭,數到十。門關上了。收銀機底下那張便簽的角動了一下——店裡沒有風。"); } },
      { id: "look-out", label: "看門外",
        resolve: (s, c) => {
          s.sawOutside = true;
          c.narrate("你看了。街上很空,空得像還沒貼圖。對面騎樓站著一個人,面對店門,距離很遠,你看不清臉——但你知道他看的是收銀台。你低頭再抬頭,他不見了。門關上了。");
        } },
    ],
    timeout: (s) => narrate(s, "門開了很久,自己關了。你全程盯著收銀機螢幕,螢幕上倒映著店門——你發誓你沒看門外,但你什麼都看到了。"),
  },
  {
    id: "ev-monitor",
    window: [1510, 1540], // 01:10–01:40
    prompt: "你例行掃過監視器。一台、兩台……第七台。畫面裡是一條走道,燈是這家店的燈,地板是這家店的地板——但這家店沒有這條走道。走道很深,盡頭有一扇門。",
    choices: [
      { id: "switch", label: "切到下一台",
        resolve: (s, c) => { c.narrate("你切了。一台、兩台……六台,輪完又回到一台。第七台不在輪播裡了。你決定不要去找它是什麼時候離開的。"); } },
      { id: "find", label: "離開收銀台,找那條走道",
        resolve: (s, c) => {
          s.lookedAisle = true;
          c.narrate("你一排一排走。飲料、零食、泡麵、日用品,六排,你數了三遍,沒有那條走道。你回到收銀台——監視器第七台還在。畫面裡,走道盡頭那扇門,開了。");
        } },
    ],
    timeout: (s) => narrate(s, "你移開視線的時候,不記得自己看了多久。第七台的畫面裡,走道盡頭的門開了一條縫。你切到下一台,手比平常快。"),
  },
  {
    id: "ev-oden",
    window: [1565, 1595], // 02:05–02:35
    prompt: "一個客人站在關東煮前面,手裡拿著碗,湯杓已經握在手上。火已經關了——02:00 過了。他回頭看你:「還有吧?我出三倍。」",
    choices: [
      { id: "soldout", label: "「賣完了。」",
        resolve: (s, c) => { c.narrate("你照守則回答。他握著湯杓站了一會,把碗放回去,放得很輕。他走出去的時候,自動門開得很慢,像在讓什麼東西先進來。"); } },
      { id: "sell", label: "賣他",
        resolve: (s, c) => {
          s.soldOden = true;
          c.narrate("你點頭。他自己舀了三樣,湯杓離手的那一秒,你聽見湯面滾了一下——火是關的。他付錢,走出門。你低頭:關東煮的格子裡,湯是滿的,滿得像沒人動過。");
          c.narrate("發票機印了一張。你沒按。\n\n深夜便利商店 024分店\n--------------------------------\n關火的湯................1\n插著的湯杓..............1\n--------------------------------\n合計            0 元\n\n再 來", "receipt");
        } },
    ],
    timeout: (s) => {
      s.soldOden = true;
      narrate(s, "他等不到回答,自己舀了一碗,把錢放在收銀台上。你沒收。錢一直放在那裡,放到早上。");
    },
  },
  {
    id: "ev-same",
    window: [1620, 1660], // 03:00–03:40
    prompt: "一個客人走進來,直接走到收銀台,什麼都沒拿。他說:「跟昨天一樣。」你確定你沒見過他——你昨天根本沒上班。收銀機螢幕自己跳出一個金額。",
    choices: [
      { id: "charge", label: "照金額收,不找錢",
        resolve: (s, c) => {
          c.narrate("你照便簽說的,按下金額,不找錢。他把錢放進來,自己從櫃檯上拿了一樣東西——你沒看清是什麼,他動作很熟練,像拿過幾百次。他點點頭,走了。收銀機抽屜關得很順。");
          c.narrate("發票機自己響了,吐出一截紙:\n\n深夜便利商店 024分店\n大夜班 收銀機01\n--------------------------------\n跟昨天一樣..............1\n跟你講話................1\n你多看的那一眼..........1\n--------------------------------\n合計      已由本人自取\n找零      不 必\n\n謝謝光顧  明天見", "receipt");
        } },
      { id: "change", label: "找錢給他",
        resolve: (s, c) => {
          s.gaveChange = true;
          c.narrate("你照正常程序找錢。他低頭看著你遞過去的零錢,看了很久,久到你的手開始酸。最後他接過去,說:「你不一樣。」他走了。收銀機螢幕上那個金額沒有消失,一直亮著。");
        } },
      { id: "ask", label: "問他昨天買了什麼",
        resolve: (s, c) => {
          s.askedYesterday = true;
          c.narrate("你問出口就後悔了。他抬起頭,第一次正眼看你:「你不記得?」他的表情不是生氣,是困惑,困惑得很真誠。「那你昨天,是賣給誰?」他沒拿東西就走了。");
        } },
    ],
    timeout: (s) => narrate(s, "他站著等,等了很久,自己點點頭,像替你做了決定。他伸手進收銀機——抽屜沒有彈開,他的手穿過去了。他拿走了什麼,走了。你決定不清點。"),
  },
  {
    id: "ev-flash",
    window: [1724, 1744], // 04:44–05:04
    prompt: "04:44。全店的燈一起閃了一下,很短,像整家店眨了一次眼。便簽第四條在你腦中亮起來。",
    choices: [
      { id: "count", label: "去後門數綠色袋子",
        resolve: (s, c) => {
          s.countedBags = true;
          if (s.discarded) {
            c.narrate("你走到後門。三個袋子。你記得你綁了兩個。便簽說,數完不要想。你回到收銀台,沒有想。");
            c.narrate("發票機又響了,很短,像只印一行。\n\n--------------------------------\n綠色袋子  x3     不要想\n--------------------------------", "receipt");
          } else {
            c.narrate("你走到後門,綠色袋子安安分分靠著牆。你數了,然後才想起來,你今晚根本還沒丟東西。便簽說,數完不要想。你沒有想。");
            c.narrate("發票機又響了,很短,像只印一行。\n\n--------------------------------\n綠色袋子(空)  x1   不要想\n--------------------------------", "receipt");
          }
        } },
      { id: "ignore", label: "當作沒看到",
        resolve: (s, c) => { c.narrate("你坐在收銀台後面,沒有動。燈沒有再閃。一切正常。你把「一切正常」四個字按進腦子裡,按得很用力。"); } },
    ],
    timeout: (s) => narrate(s, "你愣著的時候,燈又閃了一下。然後沒有了。你後來一直不確定,第二次閃,是不是只有你看見。"),
  },
  {
    id: "ev-morning",
    window: [1805, 1850], // 06:05–06:50
    prompt: "06:05。窗外的天亮了一格。玻璃門外站著一個穿制服背心的人,對你揮手,嘴型是「早」。打卡機上顯示 06:05——守則第八條:07:00 之前,窗外再亮,都不是早上。",
    choices: [
      { id: "wait", label: "看著打卡機,等到 07:00",
        resolve: (s, c) => { c.narrate("你坐著沒動。他站了一會,揮著的手慢慢放下,笑容淡掉,轉身走進那個太亮的早晨裡。07:00,真正的早班推門進來,打哈欠,說今天外面好冷。冷,這才是早上該有的樣子。"); } },
      { id: "open", label: "開門讓他進來",
        resolve: (s, c) => {
          s.openedEarly = true;
          c.narrate("你開了門。他走進來,帶著一身太亮的光。他經過你的時候,你低頭看打卡機——06:12,然後數字淡掉了,像從來沒亮過。");
        } },
    ],
    timeout: (s) => narrate(s, "他站了一會,笑容淡掉,轉身走進那片太亮的早晨。你低頭,打卡機 06:50。離 07:00 還有十分鐘,你忽然很想找個什麼來數。你忍住了。"),
  },
];

// ── 環境敘事池 ──
// 到點即播,錯過超過十分鐘不補——你沒聽見就是沒聽見。
const AMBIENCE = [
  { t: 1400, text: "店內廣播響起,女聲,語速很慢:「現在時間,二十三點,整。」你記得這家店沒有整點報時。" },
  { t: 1470, text: "飲料櫃的壓縮機停了。整家店安靜得像被誰按了靜音。三秒後,它自己咳了一聲,繼續運轉。" },
  { t: 1530, text: "關東煮的湯滾了一下。你抬頭——還沒到關火的時間,湯面卻是靜的。" },
  { t: 1580, text: "自動門的感應聲響了一下。你抬頭,門是關的。感應器上的紅點亮著,像有誰正站在門口。" },
  { t: 1610, text: "店內廣播:「現在時間,二十六點,整。」你低頭看打卡機:02:50。" },
  { t: 1680, text: "微波爐嗶了一聲。裡面是空的,轉盤在轉。" },
  { t: 1700, text: "霜淇淋機的燈滅了。你沒關過它。" },
  { t: 1705, text: "發票機自己開始印,吐了十幾公分的紙,又自己停住。你撕下來。" },
  { t: 1705, kind: "receipt", text: "\n--------------------------------\n\n     還 沒 輪 到 你\n\n--------------------------------\n" },
  { t: 1760, text: "你聽見補貨的聲音——塑膠筐、上架、排面。聲音來自你最熟的那排貨架。你今晚還沒補過那排。" },
  { t: 1830, text: "窗外的天黑得很標準。你忽然不記得,店門口那盞路燈,原本是不是這個顏色。" },
];

function findEventDef(id) {
  return EVENTS.find((e) => e.id === id) || null;
}

// ── 衍生狀態:事件排程 ──
function derive(state) {
  if (state.ended) return;

  // 環境敘事:每步先掃,到點即播,錯過不補。
  const ambHeard = state._ambHeard || (state._ambHeard = {});
  for (const a of AMBIENCE) {
    if (state.time >= a.t && !ambHeard[a.t]) {
      ambHeard[a.t] = true;
      if (state.time - a.t <= 10) narrate(state, a.text, a.kind);
    }
  }

  if (!state.activeEvent) {
    const ev = EVENTS.find((e) => !state.doneEvents.includes(e.id) && state.time >= e.window[0]);
    if (ev) {
      if (state.time >= ev.window[1]) {
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

  if (state.time >= state.activeUntil) {
    const def = findEventDef(state.activeEvent);
    state.doneEvents.push(state.activeEvent);
    state.activeEvent = null;
    state.activeUntil = null;
    if (def) def.timeout(state);
  }
}

// ── 庫存本 ──
function inventoryText(s) {
  const lines = ["你翻開庫存本。按貨架分頁,字是前輩的,品項旁邊有他的手寫註記。"];
  lines.push("飲料那頁的空白處寫著:架上滿的時候,不要數。");
  if (s.soldOden) lines.push("關東煮那頁被湯浸過,字暈開了,只看得出一行:關火之後賣出去的,不算庫存。算什麼,我不知道。");
  if (s.foundCan && !s.canResolved) lines.push("你把進貨單又對了一遍。沒有那罐。單子上每一行你都認得,只有它,像自己走進筐裡的。");
  lines.push("最後一頁被膠帶貼死了。便簽第五條:不要翻。");
  return lines.join("");
}

// ── 動作 ──
// 事件進行中:只有處置選項。待機時:做事——補貨、報廢、翻庫存本,
// 或站回收銀台讓時間流逝。
function actions(state, ctx) {
  if (state.ended) return [];

  if (state.activeEvent) {
    const def = findEventDef(state.activeEvent);
    if (!def) return [];
    return def.choices.map((choice) => ({
      id: `${def.id}:${choice.id}`,
      label: choice.label,
      onChoose: (s, c) => {
        choice.resolve(s, c);
        s.doneEvents.push(def.id);
        s.activeEvent = null;
        s.activeUntil = null;
        s.time += CHOICE_MINUTES;
      },
    }));
  }

  const list = [];

  // 補貨:一次性任務。補到最後,筐裡多了一罐進貨單上沒有的。
  if (!state.foundCan && !state.canResolved) {
    list.push({ id: "restock", label: "補飲料櫃的貨",
      onChoose: (s, c) => {
        s.foundCan = true;
        c.narrate("你拖著補貨車到飲料櫃,照守則從最裡面開始,一排一排補滿。補到最後一排,塑膠筐裡多了一罐——進貨單上沒有它。牌子你沒見過,瓶身很冰,標籤上沒有成分表,只有一行保存期限,印著明天的日期。");
        s.time += 15;
      } });
  }
  if (state.foundCan && !state.canResolved) {
    list.push({ id: "stock-can", label: "把那罐排上貨架",
      onChoose: (s, c) => {
        s.stockedUnknown = true;
        s.canResolved = true;
        c.narrate("你把它排進最裡面那排的最裡面。架上滿了,滿得很標準。你關上櫃門——玻璃上你的倒影,慢了一拍才跟著關上。");
        s.time += 2;
      } });
    list.push({ id: "scrap-can", label: "把它放進報廢籃",
      onChoose: (s, c) => {
        s.canResolved = true;
        c.narrate("你把它丟進報廢籃。籃底響了一聲,比一罐飲料該有的聲音重。你決定不複查。");
        s.time += 2;
      } });
  }

  // 報廢:守則說 04:00 之後才能丟。早丟也是一種處置。
  if (!state.discarded && !state.discardedEarly) {
    list.push({ id: "discard", label: "報廢過期品",
      onChoose: (s, c) => {
        if (s.time < DISCARD_OK) {
          s.discardedEarly = true;
          c.narrate("你把過期品裝進綠色袋子,綁了兩圈,提去後門。守則說 04:00 之後才能丟——你回到店裡的時候,袋子已經靠回後門邊,袋口開著,裡面是空的。架上那些過期品,明天會再過期一次。");
        } else {
          s.discarded = true;
          c.narrate("04:00 過了。你把過期品裝進綠色袋子,袋口綁兩圈,提去後門放下。你沒有回頭看。回來的路上,店裡的燈很標準,一切都很標準。");
        }
        s.time += 15;
      } });
  }

  list.push({ id: "inventory", label: "翻庫存本",
    onChoose: (s, c) => { c.narrate(inventoryText(s)); s.time += 2; } });

  if (state.time >= 1600 && !state.readLastPage) {
    list.push({ id: "last-page", label: "撕開庫存本最後一頁的膠帶",
      onChoose: (s, c) => {
        s.readLastPage = true;
        c.narrate("你撕開膠帶。最後一頁只有一個表格:日期,品項。每一列的日期都是明天,品項欄寫著你的名字——每一列都是。你數了,三十幾列,排到很後面的明天。你把本子合上,貼回膠帶,貼得比原來還緊。");
        s.time += 2;
      } });
  }

  list.push({ id: "counter", label: "站回收銀台(時間流逝)",
    onChoose: (s, c) => {
      c.narrate("你站回收銀台。自動門關著,關東煮的湯在滾,店裡的亮很標準。");
      s.time += 10;
    } });

  return list;
}

// ── 結局 ──
// 判斷錯誤不一定是死;但有些判斷,當晚就補齊了。
const ENDINGS = [
  { id: "early-light", label: "提早天亮",
    when: (s) => s.openedEarly,
    text: "你後來一直不確定你有沒有下班。便利商店還在,二十四小時,全年無休。只是收銀台後面站的是誰,越來越不重要了。這一班,提早天亮。" },
  { id: "filled", label: "補齊",
    when: (s) => s.stockedUnknown && s.lookedAisle,
    text: "下班前你巡最後一次店。每一排都是滿的,每一格都沒有空位——包括那條不存在的走道盡頭,那扇門後面:貨架整齊地排著,最裡面那格,放著一件制服背心,疊得很平整,尺碼是你的。架上不能留空位。這家店,補齊了。" },
  { id: "shift-end-dark", label: "下班(打卡機猶豫了一下)",
    when: (s) => s.time >= SHIFT_END && (s.sawOutside || s.soldOden || s.gaveChange || s.askedYesterday || s.readLastPage || s.discardedEarly || s.stockedUnknown),
    text: "07:00。你打卡——打卡機猶豫了一下才印字,像不太確定你還能不能打這張卡。早班推門進來,繞過你,站到收銀台後面,動作熟練得像已經站了很久。你走出自動門回頭看:店裡很亮,亮得每個貨架都沒有影子。收銀機底下那張便簽,最下面多了一行,字跡是你的。你不記得你寫過。這一班,算是下了。" },
  { id: "shift-end", label: "下班",
    when: (s) => s.time >= SHIFT_END,
    text: "07:00。打卡機印字的聲音很乾脆。早班推門進來,打哈欠,說今天外面好冷。你交班,走出自動門,天是亮的,是早上那種亮。你想了想,在便簽最下面補了一行,留給下一個大夜:「守則是真的。便簽也是。你自己判斷。」這一班,下班。" },
];

export const store = {
  id: "store",
  title: "深夜便利商店",
  blurb: "23:00 打卡。貨要補滿,過期的要報廢。架上不能留空位。",
  theme: "store",
  archive: { no: "RH-024", stamp: "已歸檔" },
  openingNarrative: "23:00。你打卡,套上制服背心,站進收銀台。\n店裡很亮,亮得每個貨架都沒有影子。關東煮的湯在滾,飲料櫃的壓縮機低低地響,自動門安安分分地關著。\n收銀台抽屜裡有一份印好的大夜班守則。收銀機底下貼著一張便簽,字很急,開頭是:給下一個大夜。",
  initialTime: SHIFT_START,
  initialUnlockedRuleIds: ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "n1", "n2", "n3", "n4", "n5"],
  // 預言:03:12 自動門會自己開三次。(shift 時鐘,03:12 = 1632)
  omens: [
    { id: "door-three", at: 1632, lead: 40,
      cue: "ding",
      foretell: "自動門開了。關上。又開了。關上。第三次,它停在開著的位置十秒,才關。",
      happen: "自動門開了。關上。又開了。關上。第三次,它停在開著的位置十秒,才關。你低頭對時間——和剛才那條記錄,分秒不差。" },
  ],
  rules: RULES,
  rulebooks: RULEBOOKS,
  initialState: {
    activeEvent: null,
    activeUntil: null,
    doneEvents: [],
    sawOutside: false,
    lookedAisle: false,
    soldOden: false,
    gaveChange: false,
    askedYesterday: false,
    countedBags: false,
    openedEarly: false,
    foundCan: false,
    stockedUnknown: false,
    canResolved: false,
    discarded: false,
    discardedEarly: false,
    readLastPage: false,
  },
  derive,
  actions,
  timeModel: "shift",
  isUrgent: (s) => !!s.activeEvent,
  endings: ENDINGS,
  ui: {
    visitLabel: (n) => `第 ${n} 次大夜`,
    restart: "重新上班",
  },
};

export default store;
