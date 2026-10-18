import { describe, expect, it } from "vitest";
import { formatTime, freshState } from "../engine.js";
import { scenes } from "../scenes/index.js";

describe("scene clock contract", () => {
  it("uses initialTime as the sole opening timestamp for every scene", () => {
    for (const scene of scenes) {
      const state = freshState(scene);
      expect(state.narrative).toHaveLength(1);
      expect(state.narrative[0].time).toBe(scene.initialTime ?? 0);
      expect(formatTime(state.narrative[0].time)).toMatch(/^\d{2}:\d{2}$/);
      // The UI renders this timestamp beside openingNarrative. An authoring
      // timestamp in the text produces duplicates and eventually drifts.
      expect(scene.openingNarrative).not.toMatch(/^\s*(?:\d{1,2}:\d{2}|凌晨|夜裡\s*十[一二三四五六七八九]?點)/);
    }
  });
});
