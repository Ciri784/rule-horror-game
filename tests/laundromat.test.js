import { describe, it, expect } from "vitest";
import { freshState, applyAction, narrate, evaluateTriggers } from "../engine.js";
import { laundromat } from "../scenes/laundromat.js";

function run() { const state = freshState(laundromat); return { state, ctx: { scene: laundromat, narrate: (t, k) => narrate(state, t, k) } }; }
const act = (s, c, id) => applyAction(laundromat, s, id, c);

describe("地下洗衣店", () => {
  it("第七台敲門時，開門與等待是互斥處置", () => {
    const { state, ctx } = run(); state.time = 28; evaluateTriggers(laundromat, state);
    expect(state.activeEvent).toBe("knock"); act(state, ctx, "knock:open");
    expect(state.openedEarly).toBe(true); expect(state.activeEvent).toBe(null);
  });
  it("帶走有名字的白襯衫，凌晨前會被代為分類", () => {
    const { state, ctx } = run(); state.time = 82; state.doneEvents = ["knock", "coat"]; evaluateTriggers(laundromat, state);
    act(state, ctx, "return:take-shirt"); state.time = 110;
    expect(act(state, ctx, "sit")?.id).toBe("sorted");
  });
});
