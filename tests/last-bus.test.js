import { describe, it, expect } from "vitest";
import { freshState, applyAction, narrate, evaluateTriggers } from "../engine.js";
import { lastBus } from "../scenes/last-bus.js";

function run() {
  const state = freshState(lastBus);
  const ctx = { scene: lastBus, visitCount: 1, fresh: true, narrate: (t, k) => narrate(state, t, k) };
  return { state, ctx };
}
const act = (s, ctx, id) => applyAction(lastBus, s, id, ctx);

describe("末班公車", () => {
  it("從 23:37 開始，跨午夜後 00:17 才等到 17 號車", () => {
    const { state } = run();
    state.time = 17;
    state.crossedMidnight = true;
    state.doneEvents = ["bus-blank", "paper"];
    evaluateTriggers(lastBus, state);
    expect(state.activeEvent).toBe("bus-17");
  });

  it("上 17 號車會在 00:48 成為第十七位乘客", () => {
    const { state, ctx } = run();
    state.time = 17;
    state.crossedMidnight = true;
    state.doneEvents = ["bus-blank", "paper"];
    evaluateTriggers(lastBus, state);
    act(state, ctx, "bus-17:board");
    state.time = 48;
    const end = act(state, ctx, "wait");
    expect(end && end.id).toBe("on-the-list");
  });

  it("撿便條會解鎖第二份互相矛盾的規則", () => {
    const { state, ctx } = run();
    act(state, ctx, "note");
    expect(state.foundNote).toBe(true);
    expect(state.unlockedRuleIds).toEqual(expect.arrayContaining(["n1", "n2", "n3"]));
  });
});
