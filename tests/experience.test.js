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

describe("advanceClock time models", () => {
  it("cycle scenes wrap at midnight and set crossedMidnight (hotel)", async () => {
    const { advanceClock } = await import("../engine.js");
    const { state } = run(hotel);
    state.time = 1439;
    advanceClock(hotel, state, 1);
    expect(state.time).toBe(0);
    expect(state.crossedMidnight).toBe(true);
  });

  it("shift scenes never wrap (night-desk)", async () => {
    const { advanceClock } = await import("../engine.js");
    const { state } = run(nightDesk);
    state.time = 1439;
    advanceClock(nightDesk, state, 1);
    expect(state.time).toBe(1440);
  });

  it("a full unattended shift reaches 06:00 and an ending", async () => {
    const { advanceClock, evaluateTriggers, checkEndings } = await import("../engine.js");
    const { state, ctx } = run(nightDesk);
    for (let i = 0; i < 430 && !state.ended; i++) {
      advanceClock(nightDesk, state, 1);
      evaluateTriggers(nightDesk, state);
      checkEndings(nightDesk, state, ctx);
    }
    expect(state.time).toBeGreaterThanOrEqual(1800);
    expect(state.ended).toBeTruthy();
    // 午夜後的事件與 03:00 對時 ambience 都有跑到
    expect(texts(state)).toContain("三點整");
    expect(texts(state)).toContain("敲門");
  });
});
