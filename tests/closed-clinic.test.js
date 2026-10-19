import { describe, it, expect } from "vitest";
import { freshState, applyAction, narrate, evaluateTriggers } from "../engine.js";
import { closedClinic } from "../scenes/closed-clinic.js";

function run() { const state = freshState(closedClinic); return { state, ctx: { scene: closedClinic, narrate: (t, k) => narrate(state, t, k) } }; }
const act = (s, c, id) => applyAction(closedClinic, s, id, c);

describe("停業診所", () => {
  it("螢幕跳號事件會強制玩家選擇是否替人回答", () => {
    const { state, ctx } = run();
    state.time = 22 * 60 + 5; evaluateTriggers(closedClinic, state);
    expect(state.activeEvent).toBe("skip");
    act(state, ctx, "skip:tell");
    expect(state.correctedScreen).toBe(true);
  });
  it("進診間後，關門前會完成初診結局", () => {
    const { state, ctx } = run();
    state.time = 23 * 60 + 20; state.doneEvents = ["skip", "doctor"]; evaluateTriggers(closedClinic, state);
    act(state, ctx, "last:enter"); state.time = 23 * 60 + 55;
    expect(act(state, ctx, "wait")?.id).toBe("admitted");
  });
});
