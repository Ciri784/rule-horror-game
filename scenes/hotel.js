// Rule Horror — 深夜飯店
//
// 這間飯店電梯面板跳過 4 樓。你的房卡印著 602，那是帶得進來的號碼。
// 門牌是房間自己認的——它隨時可能不認你的房卡。
//
// 玩家拿到 4 本守則，沒有一本會告訴你「信我」或「別信我」；
// 哪一條把你往 704 推，你得自己做。

import { pickUp, moveTo, unlockRule, formatTime } from "../engine.js";

const CARD_NUMBER = "602";   // 房卡上的號碼
const HIDDEN_NUMBER = "704"; // 房間自己翻出來的號碼
const DRIFT_FLIP = 3;        // 偏移累積到這裡，門牌翻

const LOCATIONS = {
  "my-room":        { label: "你的房間" },
  "lobby":          { label: "一樓大廳" },
  "staff-corridor": { label: "員工通道" },
  "monitor-room":   { label: "監控室" },
  "floor-7":        { label: "七樓走廊" },
};

const ITEMS = {
  "guest-card":   { label: "房卡" },
  "key-704":      { label: "鑰匙" },
  "staff-card":   { label: "員工證" },
  "staff-manual": { label: "員工守則" },
  "shift-note":   { label: "夜班守則" },
  "note-704":     { label: "門縫下的紙" },
};

const RULEBOOKS = {
  "房客守則":  { heldBy: ["guest-card"], autoFromItem: "guest-card" },
  "員工守則":  { heldBy: ["staff-manual"] },
  "夜班守則":  { heldBy: ["shift-note"] },
  "704 註記":  { heldBy: ["note-704"] },
};

const has = (s, it) => s.heldItems.includes(it);

// ── 房客守則 ──
// 床頭那本。看起來都很正常。其中一條是飯店想讓你做的——但不會標出來。
const RULES = {
  rg1: { subject: "房客", book: "房客守則",
         text: "房卡上的號碼就是你這間的房號。退房時憑房卡。" },
  rg2: { subject: "房客", book: "房客守則",
         text: "睡覺時把房卡放在枕頭旁邊，出門也帶著。" },
  rg3: { subject: "房客", book: "房客守則",
         text: "夜裡有人敲門，先問他找哪間。他報的不是你的房號，別開。" },
  rg4: { subject: "房客", book: "房客守則",
         text: "十二點以後不要開電視。電視看完記得關，別再按開。" },
  rg5: { subject: "房客", book: "房客守則",
         text: "房間裡的東西跟進來時不一樣，閉眼數到十再睜開。別急著問櫃台。" },
  rg6: { subject: "房客", book: "房客守則",
         text: "早上六點聽到鈴聲就收拾行李。鈴響第二次之前到櫃台。" },

  // ── 員工守則 ──
  // 枕頭下。字面上都很正常，合在一起看會把夜班的人一步步送上某個樓層。
  re1: { subject: "員工", book: "員工守則",
         text: "員工證是夜班唯一的工作識別，請隨身攜帶。" },
  re2: { subject: "員工", book: "員工守則",
         text: "巡房路線以電梯面板為準，缺人的樓層優先。" },
  re3: { subject: "員工", book: "員工守則",
         text: "住客反映房間有異狀，親自上樓查看，不要請住客自己下來。" },
  re4: { subject: "員工", book: "員工守則",
         text: "監控畫面出現面板上沒有的樓層，記下房號通報櫃台。" },
  re5: { subject: "員工", book: "員工守則",
         text: "夜班結束前填寫交班簿，把當晚巡過的房號都寫上。" },
  re6: { subject: "員工", book: "員工守則",
         text: "看到跟自己穿一樣制服的同事，主動打個招呼。" },

  // ── 夜班守則 ──
  // 員工通道牆上，被膠帶補過很多次。寫得比較直，語氣像留給下個夜班的人。
  rn1: { subject: "夜班", book: "夜班守則",
         text: "員工守則是飯店印的。別照著做。" },
  rn2: { subject: "夜班", book: "夜班守則",
         text: "七字頭的房間不要進，不要敲，不要應。" },
  rn3: { subject: "夜班", book: "夜班守則",
         text: "監視器的時間不重要，重要的是那幾台你還沒看的。" },
  rn4: { subject: "夜班", book: "夜班守則",
         text: "有人跟你說 704 是某一層，那個人今晚就要去那一層。" },
  rn5: { subject: "夜班", book: "夜班守則",
         text: "早上六點下班。下了班，今晚的房號跟你沒關係。" },

  // ── 704 註記 ──
  // 門牌翻成 704 之後才塞進門縫。字跡不太一樣，有的是工整，有的是慌張，
  // 像是不同人寫在不同晚上。讀起來不像說明書，比較像牆上被人刻過的字。
  rf1: { subject: "704", book: "704 註記",
         text: "你還在數樓梯。" },
  rf2: { subject: "704", book: "704 註記",
         text: "房卡還在口袋裡嗎。不用找了。" },
  rf3: { subject: "704", book: "704 註記",
         text: "隔壁昨晚跟你打過招呼。你不記得他。" },
  rf4: { subject: "704", book: "704 註記",
         text: "六點會響一次鈴。鈴響之前，房間還不認你。" },
  rf5: { subject: "704", book: "704 註記",
         text: "鑰匙不用還。下個住客會找到的。" },
  rf6: { subject: "704", book: "704 註記",
         text: "走廊盡頭那間，燈一直亮著。不是因為有人忘了關。" },
  rf7: { subject: "704", book: "704 註記",
         text: "你按過幾次電梯。每次出來的都是同一層。" },
};

const JUDGES = [
  // 上了七樓就是闖進來的人——夜班守則第二條。
  { when: (s) => s.location === "floor-7", identity: "intruder" },
  { when: (s) => has(s, "staff-card") && s.time >= 18 * 60 && s.time < 22 * 60, identity: "staff" },
  { when: (s) => has(s, "staff-card"), identity: "intruder" },
  { when: (s) => has(s, "guest-card") && s.location === "my-room", identity: "guest" },
  { when: (s) => has(s, "guest-card"), identity: "intruder" },
];

function derive(s) {
  if (s.drift >= DRIFT_FLIP) s.doorNumber = HIDDEN_NUMBER;
  else if (s.doorNumber == null) s.doorNumber = CARD_NUMBER;
}

function unlockBook(ids, s, c) {
  ids.forEach((id) => { if (!s.unlockedRuleIds.includes(id)) unlockRule(id, s, c); });
}

function actions(state, ctx) {
  const at = (id) => state.location === id;
  ctx.itemLabels = ctx.itemLabels ||
    Object.fromEntries(Object.entries(ITEMS).map(([k, v]) => [k, v.label]));
  ctx.scene = ctx.scene || hotel;
  const out = [];

  if (at("my-room")) {
    if (has(state, "guest-card")) {
      out.push({ id: "look-card", label: "看房卡",
        onChoose: (s, c) => {
          c.narrate(`房卡邊角磨白了，印著 ${CARD_NUMBER}。你走進這間房時櫃台遞給你的，還溫的。`);
          if (s.doorNumber !== CARD_NUMBER) {
            c.narrate("你又翻過來看了房卡一次。房卡沒變過。");
          }
          s.time += 1;
        } });
    }
    out.push({ id: "look-door", label: "看門牌",
      onChoose: (s, c) => {
        c.narrate(`門牌上寫著 ${s.doorNumber}。白底黑字，跟飯店其他房間一樣。`);
        if (s.doorNumber !== CARD_NUMBER) {
          c.narrate("你站在那裡又看了一下。房卡和門牌是兩個號碼。");
        }
        s.time += 2;
      } });
    if (has(state, "guest-card")) {
      out.push({ id: "compare", label: "對照門牌跟房卡",
        onChoose: (s, c) => {
          if (s.doorNumber === CARD_NUMBER) {
            c.narrate("房卡跟門牌都是 602，字對得很整齊。");
          } else {
            c.narrate(`房卡 ${CARD_NUMBER}，門牌 ${s.doorNumber}。兩張都沒印錯。`);
            c.narrate("今晚只能信一個。");
          }
          s.time += 2;
        } });
    }
    out.push({ id: "watch-tv", label: "看電視",
      onChoose: (s, c) => {
        const sevens = s.crossedMidnight || s.drift >= 1;
        if (sevens) {
          if (s.tvOff) {
            s.drift += 1; s.tvOff = false;
            c.narrate("電視自己跳回去了。畫面是一條你沒走過的走廊，燈一盞一盞亮著，鏡頭正對著盡頭一扇門。");
            c.narrate("你盯著看了三秒。螢幕上那扇門沒有倒影。");
          } else {
            c.narrate("你又打開電視。畫面一樣是那條走廊，門的倒影這次比較長。");
          }
          s.tvOn7 = true;
        } else {
          c.narrate("電視是雪花，只有第 4 台有聲音，半夜新聞重播。");
        }
        // 違反 rg4：十二點以後不要開電視
        if (s.crossedMidnight && !s._brokeRg4) {
          s.drift += 1;
          s._brokeRg4 = true;
          c.narrate("你想起守則第四條。但你已經按了。");
        }
        s.time += 3;
      } });
    if (state.tvOn7 && !state.tvOff) {
      out.push({ id: "tv-off", label: "關電視",
        onChoose: (s, c) => {
          s.tvOff = true; s.tvOn7 = false;
          c.narrate("你按掉電視。房間暗下來，只剩門牌上 704 的綠光在牆上晃了一下。");
          c.narrate("等等。");
          c.narrate("你回頭看門牌。");
          c.narrate("還是 602。剛才沒看錯。");
          s.time += 1;
        } });
    }
    out.push({ id: "look-window", label: "看窗外",
      onChoose: (s, c) => {
        if (s.doorNumber === CARD_NUMBER) {
          c.narrate("窗外是停車場，六樓往下看的高度。你記得進來時停車場滿的，現在一台車都沒有。");
        } else {
          c.narrate("窗外還是停車場，但太近了——這個高度不像六樓，也不像七樓。");
          c.narrate("你數樓層，數到一半，窗戶上的灰塵開始動。");
        }
        s.time += 3;
      } });
    out.push({ id: "look-pillow", label: "翻枕頭",
      onChoose: (s, c) => {
        if (!has(s, "staff-card")) {
          pickUp("staff-card", s, c);
          c.narrate("枕頭下壓著一張員工證，和一捲了邊的小本子。");
          c.narrate("員工證上的照片不是你的。照片裡那個人看著鏡頭，表情像剛下班。");
          if (!has(s, "staff-manual")) pickUp("staff-manual", s, c);
        } else if (!has(s, "staff-manual")) {
          pickUp("staff-manual", s, c);
          c.narrate("枕頭旁還有一本捲了邊的小本子。");
        } else {
          c.narrate("枕頭下什麼都沒有了。床單有一塊凹痕，形狀像一個人的背。");
        }
        if (has(s, "staff-manual")) unlockBook(["re1", "re2", "re3", "re4", "re5", "re6"], s, c);
        s.time += 2;
      } });
    out.push({ id: "look-nightstand", label: "翻床頭櫃",
      onChoose: (s, c) => {
        if (!has(s, "key-704")) {
          c.narrate("抽屜底層一把銅鑰匙，齒都磨圓了，上面刻著 704。");
          c.narrate("你的房卡是 602。");
          c.narrate("你把鑰匙拿起來，門牌像是咳了一下。");
          pickUp("key-704", s, c);
          s.drift += 1;
        } else {
          c.narrate("抽屜空了，只剩鑰匙擦過的痕跡。");
        }
        s.time += 2;
      } });
    if (state.doorNumber === HIDDEN_NUMBER && !has(state, "note-704")) {
      out.push({ id: "take-note", label: "撿起門縫下的紙",
        onChoose: (s, c) => {
          c.narrate("門縫下塞了一張泛黃的紙，折成四折。你不記得它什麼時候出現的。");
          c.narrate("紙上的字工整得不像倉促寫的——但有幾個字的墨比較深，像是被劃掉重寫過。");
          pickUp("note-704", s, c);
          unlockBook(["rf1", "rf2", "rf3", "rf4", "rf5", "rf6", "rf7"], s, c);
          s.time += 2;
        } });
    }
    if (state.crossedMidnight && !state._askedKnocker) {
      out.push({ id: "ask-door", label: "問他找哪間",
        onChoose: (s, c) => {
          s._askedKnocker = true;
          if (s.doorNumber === HIDDEN_NUMBER) {
            c.narrate("你隔著門問：找哪間？");
            c.narrate("門外停了一下。一個聲音說：704。");
            c.narrate("你的房卡是 602。");
          } else {
            c.narrate("你隔著門問：找哪間？");
            c.narrate("門外停了一下。一個聲音說：602。");
            c.narrate("你等他再說一句，但走廊安靜了。");
          }
          s.time += 1;
        } });
    }
    if (state._askedKnocker) {
      out.push({ id: "open-door", label: "開門",
        onChoose: (s, c) => {
          if (s.doorNumber === HIDDEN_NUMBER) {
            s.drift += 2;
            c.narrate("你開了門。");
            c.narrate("門外站著一個人，對你點了一下頭，像鄰居那種點法。");
            c.narrate("你不記得他的臉。但你看著他，覺得以前見過。");
          } else {
            c.narrate("你開了門。走廊是空的，只有你自己呼吸的聲音。");
            c.narrate("門牌還是 602。");
          }
          s.time += 2;
        } });
    }
    // 睡覺：前兩次安全、推進時間，第三次起每次加一點偏移。
    // 門牌已經翻成 704 之後睡覺，偏移直接 +2。
    out.push({ id: "sleep", label: "躺下試著睡",
      onChoose: (s, c) => {
        s.sleptCount = (s.sleptCount || 0) + 1;
        const n = s.sleptCount;

        if (s.doorNumber === HIDDEN_NUMBER) {
          s.drift += 2;
          c.narrate("你躺下來。枕頭的位置比記得的低。");
          c.narrate("你閉上眼。門牌在牆上翻了一面，這次你沒起來看。");
          c.narrate("夢裡你走在一條很長的走廊，燈一盞一盞亮著。盡頭有一扇門。");
          return;
        }

        s.time += 120;
        if (n >= 3) s.drift += 1;

        if (n === 1) {
          c.narrate("你躺下來，盯著天花板。床單有清潔劑的味道。");
          c.narrate("你睡著了。沒有夢，或者你不記得了。");
          c.narrate(`醒來時房間很暗，時鐘指向 ${formatTime(s.time)}。`);
        } else if (n === 2) {
          c.narrate("你又躺下來。走廊很安靜。");
          c.narrate("這次比較難入睡，但你還是睡著了。");
          c.narrate(`醒來時，時鐘指向 ${formatTime(s.time)}。`);
        } else if (n === 3) {
          c.narrate("你第三次躺下來。床單的溫度不太對，像有人剛躺過。");
          c.narrate("你夢到一扇門，門牌上的數字在動。你看不清楚。");
          if (s.drift >= 2) {
            c.narrate("醒來時，你不在房間裡。");
            c.narrate("你站在一樓大廳的沙發上，腳底是地毯，櫃台的人看著你。");
            c.narrate("他說：您走錯了。我帶您回去。");
            moveTo(c.scene, s, "lobby", LOCATIONS["lobby"].label);
          } else {
            c.narrate(`醒來時，時鐘指向 ${formatTime(s.time)}。`);
          }
        } else {
          c.narrate("你躺下來。不太確定自己為什麼還在這間房間。");
          c.narrate("這次有夢。夢裡你走到門口，門鎖咔的一聲開了。");
          if (s.drift >= 3) {
            c.narrate("醒來時，你不認得這層樓。");
            c.narrate("走廊很短，只有兩扇門。一盞燈。門牌寫 704。");
            moveTo(c.scene, s, "floor-7", LOCATIONS["floor-7"].label);
          } else {
            c.narrate(`醒來時，時鐘指向 ${formatTime(s.time)}。門牌上寫的是 ${s.doorNumber}。`);
          }
        }
      } });
    // 鑰匙有兩個用途：開 704 的門（結局），或拿來試電梯面板（去七樓）。
    if (has(state, "key-704") && state.doorNumber === HIDDEN_NUMBER && !state._keyUsedOnDoor) {
      out.push({ id: "unlock-704", label: "用鑰匙開門",
        onChoose: (s, c) => {
          c.narrate("你把銅鑰匙插進門鎖。齒對了。");
          c.narrate("門開了。門後不是走廊，是一間跟你房間一模一樣的房間，床鋪整整齊齊。");
          c.narrate("床上坐著一個人，穿著跟你一樣的衣服。");
          c.narrate("他抬頭看你，說：你來了。鑰匙不用還。");
          s._keyUsedOnDoor = true;
          s.drift += 1;
          s.time += 1;
        } });
    }
    out.push({ id: "go-lobby", label: "出門，下樓",
      onChoose: (s, c) => {
        if (s.crossedMidnight) {
          s.drift += 2;
          c.narrate("你開門，走進走廊。");
          c.narrate("走廊的燈在你身後一盞一盞熄掉。你沒回頭數。");
        }
        moveTo(c.scene, s, "lobby", LOCATIONS["lobby"].label);
        s.time += 2;
      } });
  }

  else if (at("lobby")) {
    out.push({ id: "look-window", label: "看大廳落地窗",
      onChoose: (s, c) => {
        c.narrate("落地窗外是停車場，一台車都沒有。旋轉門外的街燈還亮著，但街上看不到人。");
        c.narrate("你進來時，櫃台跟你說過今晚飯店客滿。");
        s.time += 2;
      } });
    out.push({ id: "look-frontdesk", label: "看櫃台",
      onChoose: (s, c) => {
        c.narrate("櫃台後面坐著一個人，制服燙得很平。他在寫什麼，沒抬頭。");
        c.narrate("你注意到他手邊有一本厚厚的登記簿，攤開著，寫滿了房號。");
        c.narrate("你只看見一欄：房號 602。");
        s.time += 1;
      } });
    out.push({ id: "talk-clerk", label: "跟櫃台說話",
      onChoose: (s, c) => {
        c.narrate("你走過去。");
        c.narrate("他抬頭看你，笑了一下：你房間還好吧？");
        c.narrate("你問他今晚客滿嗎。他翻了翻登記簿，說：都在。");
        c.narrate("你問「都在」是什麼意思。他的笑容停了半秒：就是都在啊。");
        if (has(s, "key-704")) {
          c.narrate("他的目光停在你口袋的位置。");
          c.narrate("你沒拿出鑰匙。但他好像知道你帶了什麼。");
          c.narrate("他說：那個不是您的。");
          c.narrate("你問什麼不是你的。他沒回答，低頭繼續寫。");
        }
        if (s.drift >= 1) {
          c.narrate("你又問：4 樓怎麼沒有？");
          c.narrate("他看著你，這次沒笑：4 樓沒有 4 樓。您早點休息。");
        } else {
          c.narrate("你沒再問。");
        }
        s.time += 3;
      } });
    out.push({ id: "look-elevator", label: "看電梯面板",
      onChoose: (s, c) => {
        c.narrate("電梯面板亮著：1、2、3、5、6。");
        c.narrate("4 的位置是一塊刮痕，像有人用鑰匙劃過。");
        if (has(s, "key-704")) {
          c.narrate("你把鑰匙拿出來比了一下。");
          c.narrate("齒跟那道刮痕的寬度差不多。");
        }
        s.time += 1;
      } });
    out.push({ id: "go-room", label: "搭電梯回房",
      onChoose: (s, c) => {
        c.narrate("電梯面板上沒有 4。你按 6，門關上前，面板上多亮了一層你沒按的樓。");
        c.narrate("你盯著那個燈，直到它熄掉。門開的時候，六樓到了。");
        moveTo(c.scene, s, "my-room", LOCATIONS["my-room"].label);
        s.time += 2;
      } });
    if (has(state, "key-704") && !state._usedKeyOnPanel) {
      out.push({ id: "use-key-elevator", label: "用鑰匙戳電梯面板",
        onChoose: (s, c) => {
          s.drift += 1;
          c.narrate("你把銅鑰匙對著 4 的位置插進去。");
          c.narrate("齒對了。面板上多了一個按鈕，沒有數字，只有一條刮痕。");
          c.narrate("你按下去。電梯沒反應，門也沒關。");
          c.narrate("鑰匙拔出來的時候，面板又恢復原樣。");
          c.narrate("櫃台那邊好像看了你一眼。");
          s._usedKeyOnPanel = true;
          s.time += 3;
        } });
    }
    if (state._usedKeyOnPanel) {
      out.push({ id: "go-7", label: "搭電梯上七樓",
        onChoose: (s, c) => {
          c.narrate("你再按一次那個沒數字的按鈕。");
          c.narrate("這次電梯動了。");
          c.narrate("門開的時候，空氣有冷氣的味道，跟六樓的不一樣。");
          c.narrate("走廊只有一盞燈亮著，盡頭有一扇門。");
          moveTo(c.scene, s, "floor-7", LOCATIONS["floor-7"].label);
          s.drift += 1;
          s.time += 3;
        } });
    }
    if (has(state, "staff-card")) {
      out.push({ id: "go-staff", label: "刷員工證進員工通道",
        onChoose: (s, c) => {
          c.narrate("讀卡機嗶了一聲，門開。");
          c.narrate("員工證上的日期是上週的。");
          moveTo(c.scene, s, "staff-corridor", LOCATIONS["staff-corridor"].label);
          s.time += 2;
        } });
    }
  }

  else if (at("staff-corridor")) {
    out.push({ id: "look-wall", label: "看牆上",
      onChoose: (s, c) => {
        c.narrate("牆上貼了一張夜班守則，用膠帶補過很多次。");
        c.narrate("字跡有兩種——一種是印刷的，一種是後來用紅筆補的。");
        c.narrate("紅筆寫的那句，墨比較新。");
        if (!has(s, "shift-note")) pickUp("shift-note", s, c);
        unlockBook(["rn1", "rn2", "rn3", "rn4", "rn5"], s, c);
        s.time += 2;
      } });
    out.push({ id: "go-lobby", label: "回一樓大廳",
      onChoose: (s, c) => { moveTo(c.scene, s, "lobby", LOCATIONS["lobby"].label); s.time += 2; } });
    if (has(state, "shift-note") || has(state, "staff-card")) {
      out.push({ id: "go-monitor", label: "進監控室",
        onChoose: (s, c) => { moveTo(c.scene, s, "monitor-room", LOCATIONS["monitor-room"].label); s.time += 2; } });
    }
  }

  else if (at("monitor-room")) {
    out.push({ id: "look-monitors", label: "看監視器",
      onChoose: (s, c) => {
        c.narrate("十六個畫面，十五個是空走廊。");
        c.narrate("第十六個，是一扇門。鏡頭正對著它，像它裝的攝影機。");
        c.narrate("門牌寫 704。畫面右下角跳的時間，比牆上的鐘早三分鐘。");
        s._blackout = true;
        s.time += 3;
      } });
    if (state._blackout) {
      out.push({ id: "look-back", label: "把那一格放大",
        onChoose: (s, c) => {
          s.drift += 1; s._blackout = false;
          c.narrate("門開了一條縫。");
          c.narrate("裡面站著一個人，背對鏡頭，穿的衣服跟你身上那件一樣。");
          c.narrate("他慢慢轉過頭——");
          c.narrate("畫面跳回 15 個空走廊。");
          c.narrate("你把滑鼠移開。口袋裡那把鑰匙又沉了一下。");
          s.time += 1;
        } });
    }
    if (state._blackout) {
      out.push({ id: "look-replay", label: "回放其他畫面",
        onChoose: (s, c) => {
          c.narrate("你切到錄影回放，挑了空走廊那幾格。");
          c.narrate("回放到三點左右的時候，有一個畫面多了一個人。");
          c.narrate("那個人站在走廊盡頭，背對鏡頭，站了大約 20 秒。");
          c.narrate("你把時間軸往前推——他從一扇門裡走出來。");
          c.narrate("門牌是 704。");
          s.time += 2;
        } });
    }
    out.push({ id: "go-staff", label: "回員工通道",
      onChoose: (s, c) => { s._blackout = false; moveTo(c.scene, s, "staff-corridor", LOCATIONS["staff-corridor"].label); s.time += 2; } });
  }

  else if (at("floor-7")) {
    out.push({ id: "look-hall", label: "看走廊",
      onChoose: (s, c) => {
        c.narrate("走廊很短，只有 703 跟 704 兩扇門，中間一盞燈。");
        c.narrate("703 的門牌是暗的。704 的門牌是亮的，綠光。");
        c.narrate("門口的地毯有點濕，像有人剛拖過。");
        s.time += 2;
      } });
    out.push({ id: "knock-704", label: "敲 704 的門",
      onChoose: (s, c) => {
        c.narrate("你敲了三下。");
        c.narrate("裡面有腳步聲，停在門後。");
        c.narrate("你沒等到應門。腳步聲走開了，往房間更深的地方。");
        c.narrate("你聽見床發出聲音。");
        s.time += 2;
      } });
    if (has(state, "key-704")) {
      out.push({ id: "open-704", label: "開 704 的門",
        onChoose: (s, c) => {
          c.narrate("你用鑰匙開了門。");
          c.narrate("房間是空的。床單鋪得很整齊，像沒人住過。");
          c.narrate("窗戶是開的。");
          c.narrate("你往床頭櫃看了一眼。抽屜是空的，但裡面有一道刮痕。");
          c.narrate("刮痕的形狀，跟你口袋裡那把鑰匙一模一樣。");
          c.narrate("你把鑰匙放在床上。");
          c.narrate("鑰匙自己滾進了抽屜。");
          c.narrate("你沒去撿。門在你身後關上。");
          s._entered704Floor = true;
          s.drift += 2;
          s.time += 3;
        } });
    }
    out.push({ id: "go-down", label: "下樓回大廳",
      onChoose: (s, c) => {
        c.narrate("你按電梯下樓。");
        c.narrate("門開的時候，你已經在一樓了。");
        c.narrate("櫃台的人看著你，跟你點了一下頭。");
        moveTo(c.scene, s, "lobby", LOCATIONS["lobby"].label);
        s.time += 3;
      } });
  }

  return out;
}

const ENDINGS = [
  // 鑰匙在 704 房門上用過——你打開了那扇門。
  { id: "key-holder", label: "鑰匙不用還",
    text: "門關上之前，你看了一眼門牌。\n602。它一直是 602。\n但你手裡的鑰匙寫著 704，而且它剛剛開了一扇門。\n你站在走廊裡，口袋是空的。身後的門鎖上了。\n電梯面板上，有一層燈亮著。",
    when: (s) => s._keyUsedOnDoor === true },

  // 七樓進了 704，門關上，沒出來。
  { id: "stayed", label: "住了下來",
    text: "門在你身後關上。\n房間跟你的不一樣——床單是新的，枕頭下沒有東西。\n你拉開床頭櫃，抽屜裡有一把銅鑰匙，齒磨得剛好。\n門牌寫 704。你把房卡放回口袋。\n房卡上的字，不見了。",
    when: (s) => s._entered704Floor === true },

  // 門牌被房間翻成 704、還在房裡、撐過午夜。
  { id: "resident", label: "換了一張房卡",
    text: "早上六點，門牌還是 704。\n你把原本的房卡放回口袋，發現口袋裡是空的——鑰匙不知道什麼時候不見了。\n櫃台那邊遞來一張新的房卡。你沒看上面的號碼，只看到自己走進電梯。\n面板上沒有 4，但有一層是亮的。",
    when: (s) => s.doorNumber === HIDDEN_NUMBER && s.location === "my-room" && s.crossedMidnight === true },

  // 身份不是房客、撐過午夜。
  { id: "claimed-by-clerk", label: "被叫去開門",
    text: "走廊盡頭，夜班的櫃台人員已經站在那裡。\n他笑著跟你說：你的房間我們幫你換好了，請跟我來。\n你走進電梯，他沒按樓，門自己關上。\n你想起那本守則叫你出來巡邏。你還記得是哪一本，但已經想不起上面寫了什麼。",
    when: (s) => s.identity === "intruder" && s.crossedMidnight === true },

  // 撐到天亮、房牌從頭到尾是 602、還在自己房間。
  { id: "checked-out", label: "天亮退房",
    text: "六點整，房間的電話響了。\n你拿起話筒，沒有人說話，只有一聲很輕的喀。\n門牌從頭到尾都是 602。\n你把房卡交回櫃台，櫃台的人看了一眼，跟你說：歡迎下次再來。\n你走出旋轉門的時候，電梯面板的燈剛好熄掉一層。",
    when: (s) => s.crossedMidnight === true && s.time >= 6 * 60 && s.time < 23 * 60
              && s.doorNumber === CARD_NUMBER && s.identity === "guest" && s.location === "my-room" },
];

export const hotel = {
  id: "hotel",
  title: "深夜飯店",
  blurb: "房卡上的號碼帶得進來。門牌不一定。",
  intro: "夜班。",
  openingNarrative: "夜裡十一點，你走進 602 號房，行李放上床。\n電梯面板上沒有 4 樓，你沒多想。\n櫃台遞房卡時順手塞了一張紙條：房客守則，入住前請過目。撐到早上六點。",
  initialItems: ["guest-card"],
  initialUnlockedRuleIds: ["rg1", "rg2", "rg3", "rg4", "rg5", "rg6"],
  initialIdentity: "guest",
  initialLocation: "my-room",
  initialTime: 23 * 60,
  initialState: { doorNumber: CARD_NUMBER, drift: 0, tvOn7: false, tvOff: false, _blackout: false, sleptCount: 0, _keyUsedOnDoor: false, _usedKeyOnPanel: false, _brokeRg4: false, _entered704Floor: false, _askedKnocker: false },
  rules: RULES,
  rulebooks: RULEBOOKS,
  judges: JUDGES,
  derive,
  actions,
  endings: ENDINGS,
  ui: {
    visitLabel: (n) => `第 ${n} 次入住`,
    restart: "重新入住",
  },
};

export default hotel;
