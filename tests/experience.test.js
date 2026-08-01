import { describe, it, expect } from "vitest";
import { freshState, applyAction, narrate, evaluateTriggers } from "../engine.js";
import { nightDesk } from "../scenes/night-desk.js";
import { hotel } from "../scenes/hotel.js";

function run(scene) {
  const state = freshState(scene);
  const ctx = { scene, visitCount: 1, fresh: true, narrate: (t, k) => narrate(state, t, k) };
  return { state, ctx };
}
const texts = (s) => s.narrative.map((n) => n.text).join("\n");
const lastText = (s) => s.narrative[s.narrative.length - 1].text;

describe("night-desk ambience pool", () => {
  it("03:00 echo plays on time", () => {
    const { state } = run(nightDesk);
    state.time = 1620;
    evaluateTriggers(nightDesk, state);
    expect(texts(state)).toContain("三點整");
  });

  it("missed ambience is not replayed", () => {
    const { state } = run(nightDesk);
    state.time = 1430; // 1410 entry is 20 min past the catch window
    evaluateTriggers(nightDesk, state);
    expect(texts(state)).not.toContain("冷氣");
    evaluateTriggers(nightDesk, state);
    expect(texts(state)).not.toContain("冷氣");
  });

  it("register book shows predecessor name in 704 and player name after 03:00", () => {
    const { state, ctx } = run(nightDesk);
    applyAction(nightDesk, state, "read-book", ctx);
    expect(texts(state)).toContain("前任");
    state.time = 1625;
    applyAction(nightDesk, state, "read-book", ctx);
    expect(texts(state)).toContain("是你的名字");
  });
});

describe("hotel flavor action repeat noise", () => {
  it("look-card plays the short version on repeat", () => {
    const { state, ctx } = run(hotel);
    applyAction(hotel, state, "look-card", ctx);
    expect(texts(state)).toContain("磨白");
    applyAction(hotel, state, "look-card", ctx);
    expect(lastText(state)).toContain("還是那張");
  });

  it("look-elevator plays the short version on repeat", () => {
    const { state, ctx } = run(hotel);
    state.location = "lobby";
    applyAction(hotel, state, "look-elevator", ctx);
    expect(texts(state)).toContain("刮痕");
    applyAction(hotel, state, "look-elevator", ctx);
    expect(lastText(state)).toContain("沒數第二遍");
  });

  it("03:00 hour event mentions the elevator upstairs", () => {
    const { state } = run(hotel);
    state.crossedMidnight = true;
    state.time = 181; // 03:01
    evaluateTriggers(hotel, state);
    expect(texts(state)).toContain("電梯在樓上停了");
  });
});

describe("night-desk urgency flag", () => {
  it("isUrgent reflects activeEvent", () => {
    const { state } = run(nightDesk);
    expect(nightDesk.isUrgent(state)).toBe(false);
    state.time = 1400;
    evaluateTriggers(nightDesk, state);
    expect(state.activeEvent).toBe("ev-drunk");
    expect(nightDesk.isUrgent(state)).toBe(true);
  });
});
