# 場景契約 — 怎麼加一個新場所

引擎(`engine.js`)只認**通用概念**:敘事流、持有物、身份、位置、已解鎖規則、
時間、結局。場所專屬的一切(飯店的門牌、圖書館的噪音值…)住在**場景物件**裡。

加一個新場所 = 三步:

1. 建 `scenes/<name>.js`,`export const <name> = { … }`(照下面契約)。
2. 在 `scenes/index.js` import 它、加進 `scenes` 陣列。
3. 完成。首頁會自動列出它,路由 `#<id>` 會載入它。

`scenes/hotel.js` 是一個完整的參考實作。

---

## 場景物件

### 必填

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | string | 唯一 id,也是路由 hash(`#hotel`)。 |
| `title` | string | 首頁卡片大標。 |
| `blurb` | string | 首頁卡片小標(一句氛圍)。 |
| `openingNarrative` | string | 敘事流的第一段。`\n` 可換行。 |
| `actions(state, ctx)` | fn | 回傳當下可選的動作陣列(見下)。 |
| `endings` | array | 結局陣列,依序判定,第一個 `when` 為真者勝出(見下)。 |

### 規則系統(規則怪談核心)

| 欄位 | 型別 | 說明 |
|------|------|------|
| `rules` | object | `{ id: { book, subject, text } }`。規則永遠固定,靠解鎖出現。 |
| `rulebooks` | object | `{ 書名: {…} }`。決定規則欄的分組下拉;規則的 `book` 對應書名。 |
| `initialUnlockedRuleIds` | string[] | 開場就解鎖的規則 id(通常是第一本)。 |

已解鎖的規則**永遠完整顯示**;哪條此刻生效由玩家判斷,引擎不標。用
`unlockRule(id, state, ctx)` 或 `unlockBook([...ids], …)` 在動作裡解鎖。

### 身份系統(選用)

「這地方認定你是誰」。每步由 `judges` 重算進 `state.identity`。

| 欄位 | 型別 | 說明 |
|------|------|------|
| `judges` | array | `[{ when(state) -> bool, identity: string }]`,依序取第一個命中。 |
| `defaultIdentity` | string | 沒有 judges / 都不命中時的值(預設 `'unknown'`)。 |
| `initialIdentity` | string | freshState 的初始身份。 |

### 衍生狀態與場景私有欄位(選用)

| 欄位 | 型別 | 說明 |
|------|------|------|
| `initialState` | object | spread 進 freshState 的**場景私有欄位**(門牌、計數、旗標…)。引擎不碰,只有你的 `derive`/`actions` 讀寫。 |
| `derive(state)` | fn | 每步(action 後)呼叫一次,重算衍生狀態(例:偏移到門檻就翻門牌)。 |

### 初始通用狀態(選用,有預設)

`initialItems` (string[]) · `initialLocation` (string) · `initialTime` (分鐘,預設 0) 。

### UI 覆寫(選用)

場所專屬用語放這;沒給的用通用預設。

| key | 預設 | hotel 用 |
|-----|------|----------|
| `rulesTitle` / `nowTitle` / `actionsTitle` | 已知規則 / 此刻 / 您可以 | 同 |
| `visitLabel(n)` | `第 n 次` | `第 n 次入住` |
| `restart` | 重新開始 | 重新入住 |
| `reset` / `home` | 重置本關 / 回到首頁 | 同 |
| `emptyRules` | 您目前還沒有拿到任何守則。 | 同 |

### 視覺主題與首頁檔案室(選用)

| 欄位 | 型別 | 說明 |
|------|------|------|
| `theme` | string | 場景視覺主題。遊玩畫面外框會加上 `.theme-<name>`,配色與質感由 `style.css` 的對應區塊接管(現有 `theme-hotel`)。不給 = 預設的暗色監視器質感。 |
| `archive` | object | `{ no, stamp }`。首頁檔案室的卷宗編號與歸檔章文字;不給則編號自動補 `RH-00n`、章用「已歸檔」。 |
| `omens` | array | `[{ id, at, lead, foretell, happen, when?, cue? }]`。預言敘事:`at` 前 `lead` 分鐘起,敘事流出現一條時間戳是 `at` 的記錄(kind `omen`);時鐘走到 `at` 時事件真的發生,瞬間播放 `cue` 音效(`"ding"`/`"thump"`/`"flicker"`)。cycle 場景請把 `at` 訂在午夜後,直接比大小。 |
| `rule.mutate` | object | 可選。`{ from, to, when(state) }`:條件成立時,該條守則顯示文字中第一個 `from` 被替換成渗紅手寫體的 `to`。**只改顯示,引擎永遠照原文判定**——「守則是真的」,變的是字。`from` 必須真的出現在原文裡(有測試把關)。 |

---

## action 與 ending 的形狀

```js
// action:
{ id: "look-door", label: "看門牌",
  onChoose: (state, ctx) => { ctx.narrate("……"); state.time += 2; } }

// ending:
{ id: "checked-out", label: "天亮退房",
  when: (s) => s.crossedMidnight && s.time >= 6*60 && …,
  text: "結局散文,會推進敘事流。" }
```

`ctx` 提供 `narrate(text, kind?)`、`scene`、`visitCount`。引擎工具(從
`engine.js` import,在動作裡呼叫):`pickUp`、`moveTo`、`unlockRule`。

`state.time` 用分鐘;跨午夜時 `state.crossedMidnight` 自動 latch。`core.js`
也會依真實時間閒置推進 `state.time`(5 秒 = 1 分)。

---

## 最小骨架(無身份、無衍生狀態,能跑)

```js
export const room = {
  id: "room",
  title: "空房間",
  blurb: "門是鎖著的。",
  openingNarrative: "你醒來,門上貼著一張紙。",
  initialUnlockedRuleIds: ["r1"],
  rules: { r1: { book: "紙條", text: "不要開燈。" } },
  rulebooks: { "紙條": {} },
  actions: (s, ctx) => [
    { id: "wait", label: "等待", onChoose: (s) => { s.time += 60; } },
    { id: "light", label: "開燈", onChoose: (s, c) => { c.narrate("你開了燈。"); s.brokeRule = true; } },
  ],
  endings: [
    { id: "taken", label: "被帶走", when: (s) => s.brokeRule, text: "燈一亮,房間就不再是空的了。" },
    { id: "dawn", label: "天亮", when: (s) => s.time >= 6 * 60, text: "天亮了。門開了。" },
  ],
  initialState: { brokeRule: false },
};
```

## 存檔版本

改了持久化 state 的形狀時,把 `engine.js` 的 `STORAGE_PREFIX` 版本段(`v2`)
往上加,舊存檔會被乾淨忽略(不做遷移)。
