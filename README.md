# 四十四號檔案室 / Rule Horror Game

直接遊玩：<https://ciri784.github.io/rule-horror-game/>

A quiet collection of rule-horror interactive fiction.

> Rooms that change. Rules that follow you.

This is a static, dependency-free web project. It hosts short scenes in which
the player receives a list of rules; breaking them does not always kill, but
it usually rewrites the rulebook — including rewriting itself.

## Current scenes

- **深夜飯店** — A nameless hotel with no fourth floor: the elevator skips
  from 3 to 5. You check into room 602 at eleven at night; your keycard says
  602, and that is the one number you can trust. The missing floor comes back
  after dark, wearing 7-hundred numbers, and 704 is the room on it. Keep your
  door reading 602 until morning. Four rulebooks — guest, staff, night-shift,
  and the floor's own — each swear they protect you, and they contradict each
  other on purpose.
- **夜班櫃台** — The hotel from behind the desk. Work from 23:00 to 06:00;
  decide whether to trust the printed desk rules or the previous clerk's
  handwriting when each guest, call, and camera feed asks for an answer.
- **深夜便利商店** — A night shift where empty shelf space is never really
  empty. Restock, dispose of expired goods, and survive until the time clock
  says morning — not when the windows start to brighten.
- **末班公車** — A bus stop with no timetable. Every bus stops, but only one
  is yours; learn what the temporary notice means before you get on.
- **停業診所** — The clinic stopped taking registrations at ten. The final
  number is still on the screen, and it has your name on the back.
- **地下洗衣店** — Machine seven begins its cycle when it says three minutes
  remain. Take only your own clothes home.

## 遊玩方式

每個場景都不是考記憶力：規則會衝突、被改寫，甚至開始對玩家說謊。先讀環境，再決定信哪一張紙。

## 本次整理 — 2026-11-18

- 首頁先提醒玩家保留互相矛盾的紙條；新拿到的規則本也會清楚標示已取得條數。
- 結案單不只列結果，會留下重玩的閱讀方向；停業診所則依你是否更正叫號、帶走藥袋、歸還號碼牌等選擇改寫收束。
- 限時事件會明說沉默也是一種回答，讓危險的優先順序更清楚，但不直接公布正解。
- 所有場景已跑過完整路徑測試；更新仍維持純靜態、無建置流程。

## Run locally

Just open `index.html` in a browser. No build step, no server.

## Deploy

GitHub Pages is wired up via `.github/workflows/pages.yml`. Pushing to `main`
will deploy the site root to <https://ciri784.github.io/rule-horror-game/>.

## Author

This project is owned and maintained by Ciri784. The project is a
single-author creative work and is not accepting contributions at this time.
