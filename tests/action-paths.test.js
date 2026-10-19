import { describe, expect, it } from "vitest";
import { freshState, applyAction, narrate } from "../engine.js";
import { scenes } from "../scenes/index.js";
import { runPath, strategies } from "./path-audit.mjs";

describe("玩家操作路徑", () => {
  it("cycle 場景的操作跨午夜時會正確換日", () => {
    const hotel = scenes.find((scene) => scene.id === "hotel");
    const state = freshState(hotel);
    state.time = 23 * 60 + 59;
    const ctx = { scene: hotel, visitCount: 1, fresh: true, narrate: (text, kind) => narrate(state, text, kind) };

    applyAction(hotel, state, "look-card", ctx); // +1 minute

    expect(state.time).toBe(0);
    expect(state.crossedMidnight).toBe(true);
  });

  for (const scene of scenes) {
    for (const strategyName of Object.keys(strategies)) {
      it(`${scene.id}：${strategyName} 路徑不會卡死，且能抵達結局`, () => {
        const result = runPath(scene, strategyName);
        expect(result.deadlocked).toBe(false);
        expect(result.exhausted).toBe(false);
        expect(result.state.ended).toBeTruthy();
      });
    }
  }
});
