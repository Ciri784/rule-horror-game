// 迴歸:cycle 時鐘的預言時序。hotel 開場 23:00(1380),預言 at 02:20(140)——
// 直接比大小 1382>=140 會讓預言在開場就爆、foretell 永遠不播。
import { describe, it, expect } from "vitest";
import { freshState, evaluateTriggers, advanceClock } from "../engine.js";

const scene = {
  id: "omen-test", title: "t", initialTime: 23 * 60,
  initialState: {}, rules: {}, rulebooks: {}, judges: [], endings: [],
  omens: [{ id: "o", at: 2 * 60 + 20, lead: 45, foretell: "F", happen: "H" }],
  actions: () => [],
};

function tick(state, mins) { advanceClock(scene, state, mins); evaluateTriggers(scene, state); }

describe("cycle omen timing", () => {
  it("pre-midnight does not fire even though time-of-day > at", () => {
    const s = freshState(scene);
    tick(s, 2); // 23:02
    expect(s._omens.o.foretold).toBeFalsy();
    expect(s._omens.o.happened).toBeFalsy();
    expect(s.narrative.length).toBe(0);
  });
  it("foretells after wrap at at-lead, happens at at", () => {
    const s = freshState(scene);
    tick(s, 60); // 跨午夜 → 00:00
    tick(s, 94); // 01:34,還不到
    expect(s._omens.o.foretold).toBeFalsy();
    tick(s, 1);  // 01:35 = at-lead
    expect(s._omens.o.foretold).toBe(true);
    expect(s._omens.o.happened).toBeFalsy();
    tick(s, 45); // 02:20
    expect(s._omens.o.happened).toBe(true);
  });
});
