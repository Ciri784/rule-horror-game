import { describe, it, expect } from "vitest";
import { freshState, applyAction, narrate, evaluateTriggers } from "../engine.js";
import { nightDesk } from "../scenes/night-desk.js";

function newRun() {
  const state = freshState(nightDesk);
  const ctx = { scene: nightDesk, visitCount: 1, fresh: true, narrate: (t, k) => narrate(state, t, k) };
  return { state, ctx };
}
const tick = (s) => evaluateTriggers(nightDesk, s);
const ids = (s, ctx) => nightDesk.actions(s, ctx).map((a) => a.id);
const act = (s, ctx, id) => applyAction(nightDesk, s, id, ctx);
const lastText = (s) => s.narrative[s.narrative.length - 1].text;

// 各事件時間窗起點（分鐘）
const START = {
  "ev-drunk": 1400,      // 23:20
  "ev-4f": 1430,         // 23:50
  "ev-knock": 1470,      // 00:30
  "ev-phone": 1515,      // 01:15
  "ev-monitor": 1600,    // 02:40
  "ev-complaint": 1650,  // 03:30
  "ev-colleague": 1740,  // 05:00
};

// 把時間推到事件起點並觸發 derive,斷言事件已上門。
// 跳過的事件窗會以超時依序收場(每次 evaluateTriggers 處理一件),
// 所以循環 tick 直到目標事件上門。
function trigger(s, evId) {
  s.time = Math.max(s.time, START[evId]);
  for (let i = 0; i < 12 && s.activeEvent !== evId; i++) tick(s);
  expect(s.activeEvent).toBe(evId);
}

describe("夜班櫃台 night-desk", () => {
  it("開場：23:00 上班，守則與交班簿都在手邊", () => {
    const { state, ctx } = newRun();
    expect(state.time).toBe(23 * 60);
    for (const id of ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "h1", "h2", "h3"]) {
      expect(state.unlockedRuleIds).toContain(id);
    }
    expect(ids(state, ctx)).toEqual(["idle", "read-book"]);
    expect(state.activeEvent).toBe(null);
  });

  it("事件上門是強制回應：處置選項之外沒有待機", () => {
    const { state, ctx } = newRun();
    trigger(state, "ev-drunk");
    const available = ids(state, ctx);
    expect(available).toContain("ev-drunk:refuse");
    expect(available).toContain("ev-drunk:admit");
    expect(available).not.toContain("idle");
  });

  it("收下醉客：名字早已在簿上，字跡是你的", () => {
    const { state, ctx } = newRun();
    trigger(state, "ev-drunk");
    act(state, ctx, "ev-drunk:admit");
    expect(state.drunkAdmitted).toBe(true);
    expect(state.activeEvent).toBe(null);
    expect(state.doneEvents).toContain("ev-drunk");
    expect(state.narrative.some((n) => n.text.includes("字跡是你的"))).toBe(true);
  });

  it("超時不處理也是一種處置", () => {
    const { state, ctx } = newRun();
    trigger(state, "ev-drunk");
    state.time = 1436; // 超過 23:55 窗口
    tick(state);
    expect(state.activeEvent).toBe(null);
    expect(state.doneEvents).toContain("ev-drunk");
    expect(lastText(state)).toContain("空白的一頁");
  });

  it("掛斷電話會引出連鎖：五分鐘後，七聲", () => {
    const { state, ctx } = newRun();
    trigger(state, "ev-phone");
    act(state, ctx, "ev-phone:hang");
    expect(state.pendingEvent).not.toBe(null);
    state.time += 5;
    tick(state);
    expect(state.activeEvent).toBe("ev-phone2");
    act(state, ctx, "ev-phone2:answer");
    expect(state.phoneMarked).toBe(true);
  });

  it("監視器十秒：第一拍留下懸念，第二拍越線", () => {
    const { state, ctx } = newRun();
    trigger(state, "ev-monitor");
    act(state, ctx, "ev-monitor:watch");
    expect(state.activeEvent).toBe("ev-monitor"); // stay: 事件不走
    expect(state.monitorSeconds).toBe(7);
    act(state, ctx, "ev-monitor:watch2");
    expect(state.watchedTooLong).toBe(true);
    expect(state.activeEvent).toBe(null);
    expect(lastText(state)).toContain("你回頭。沒有人。");
  });

  it("上樓查看直接終結這一晚：lost-corridor", () => {
    const { state, ctx } = newRun();
    trigger(state, "ev-complaint");
    const end = act(state, ctx, "ev-complaint:upstairs");
    expect(state.wentUpstairs).toBe(true);
    expect(state.ended).toBe("lost-corridor");
    expect(end && end.id).toBe("lost-corridor");
  });

  it("05:00 把鑰匙交出去直接終結這一晚：left-early", () => {
    const { state, ctx } = newRun();
    trigger(state, "ev-colleague");
    const end = act(state, ctx, "ev-colleague:handover");
    expect(state.gaveKeysEarly).toBe(true);
    expect(state.ended).toBe("left-early");
    expect(end && end.id).toBe("left-early");
  });

  it("守規矩的一晚：撐到 06:00，交班", () => {
    const { state, ctx } = newRun();
    const route = [
      ["ev-drunk", "refuse"],
      ["ev-4f", "recite"],
      ["ev-knock", "stay"],
      ["ev-phone", "answer"],
      ["ev-monitor", "away"],
      ["ev-complaint", "deflect"],
      ["ev-colleague", "wait"],
    ];
    for (const [ev, choice] of route) {
      trigger(state, ev);
      act(state, ctx, `${ev}:${choice}`);
    }
    state.time = 30 * 60; // 06:00
    const end = act(state, ctx, "idle");
    expect(state.ended).toBe("shift-end");
    expect(end && end.id).toBe("shift-end");
  });

  it("開過門的一晚：撐到 06:00，但有什麼跟著你", () => {
    const { state, ctx } = newRun();
    trigger(state, "ev-knock");
    act(state, ctx, "ev-knock:open");
    expect(state.openedDoor).toBe(true);
    state.time = 30 * 60;
    const end = act(state, ctx, "idle");
    expect(state.ended).toBe("shift-end-dark");
    expect(end && end.id).toBe("shift-end-dark");
  });
});
