import { describe, it, expect } from "vitest";
import { freshState, evaluateTriggers } from "../engine.js";

// 預言（omens）：敘事流裡出現時間戳是未來的記錄，時鐘走到那個時間時，
// 被預言的事件真的發生。引擎永遠不標示哪條是預言。

const scene = {
  id: "omen-test",
  title: "預言房",
  blurb: "時鐘會先記下還沒發生的事。",
  openingNarrative: "你坐下來。",
  initialTime: 100,
  rules: {},
  actions: () => [],
  endings: [],
  omens: [
    { id: "bell", at: 140, lead: 45, foretell: "鐘響了一聲。", happen: "鐘真的響了一聲。" },
  ],
};

const run = (s, t) => { s.time = t; evaluateTriggers(scene, s); };

describe("omens — future-timestamped narrative", () => {
  it("foretells with a future timestamp once the lead window opens", () => {
    const s = freshState(scene);
    run(s, 94);
    expect(s.narrative.some((n) => n.kind === "omen")).toBe(false);
    run(s, 95);
    const o = s.narrative.find((n) => n.kind === "omen");
    expect(o).toBeTruthy();
    expect(o.time).toBe(140); // 時間戳蓋的是未來
    expect(o.text).toBe("鐘響了一聲。");
  });

  it("foretells only once across repeated evaluations", () => {
    const s = freshState(scene);
    run(s, 100); run(s, 120); run(s, 139);
    expect(s.narrative.filter((n) => n.kind === "omen").length).toBe(1);
  });

  it("the foretold event really happens when the clock reaches it", () => {
    const s = freshState(scene);
    run(s, 100);
    run(s, 140);
    const last = s.narrative[s.narrative.length - 1];
    expect(last.text).toBe("鐘真的響了一聲。");
    expect(last.time).toBe(140); // 這次是真實時間戳
    expect(last.kind).toBe("narration");
  });

  it("the event still happens even if the lead window was jumped over", () => {
    const s = freshState(scene);
    run(s, 141); // 直接跳過預言窗
    expect(s.narrative.some((n) => n.kind === "omen")).toBe(false);
    expect(s.narrative.some((n) => n.text === "鐘真的響了一聲。")).toBe(true);
  });

  it("never foretells after the scene has ended", () => {
    const s = freshState(scene);
    s.ended = "x";
    run(s, 100);
    expect(s.narrative.some((n) => n.kind === "omen")).toBe(false);
  });
});
