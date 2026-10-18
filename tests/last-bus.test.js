import { describe, expect, it } from "vitest";
import { applyAction, formatTime, freshState, narrate } from "../engine.js";
import { lastBus } from "../scenes/last-bus.js";

function boot() {
  const state = freshState(lastBus);
  return { state, ctx: { scene: lastBus, narrate: (text, kind) => narrate(state, text, kind) } };
}

describe("末班公車", () => {
  it("uses one clock: the UI timestamp is midnight and the prose does not duplicate it", () => {
    const { state } = boot();
    expect(formatTime(state.time)).toBe("00:17");
    expect(lastBus.openingNarrative).not.toMatch(/\b\d{2}:\d{2}/);
  });

  it("lets the player refuse 0 號車 and reach the genuine last bus", () => {
    const { state, ctx } = boot();
    applyAction(lastBus, state, "wait", ctx);
    expect(state.firstBus).toBe(true);
    applyAction(lastBus, state, "let-pass", ctx);
    applyAction(lastBus, state, "wait-real", ctx);
    applyAction(lastBus, state, "wait-real", ctx);
    expect(state.ended).toBe("real-last-bus");
  });
});
