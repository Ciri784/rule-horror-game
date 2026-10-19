import { describe, expect, it } from "vitest";
import { applyAction, evaluateTriggers, freshState, narrate } from "../engine.js";
import { store } from "../scenes/store.js";
import { nightDesk } from "../scenes/night-desk.js";
import { lastBus } from "../scenes/last-bus.js";
import { hotel } from "../scenes/hotel.js";

const ctxFor = (scene, state) => ({ scene, narrate: (text, kind) => narrate(state, text, kind) });

describe("timeline integrity", () => {
  it("timestamps a missed store event at its scheduled minute, not the later click", () => {
    const state = freshState(store);
    state.time = 1729; // 04:49; 04:44 was crossed by a long action
    // Expired earlier event windows resolve one per trigger pass; keep
    // advancing the scheduler until the still-live 04:44 event arrives.
    for (let i = 0; i < 8 && !state.activeEvent; i++) evaluateTriggers(store, state);
    const flash = state.narrative.find((entry) => entry.text.startsWith("04:44。"));
    expect(flash?.time).toBe(1724);
  });

  it("timestamps a missed night-desk ambience at the exact scheduled minute", () => {
    const state = freshState(nightDesk);
    state.time = 1625; // 03:05; the scene announces the 03:00 anomaly
    evaluateTriggers(nightDesk, state);
    const anomaly = state.narrative.find((entry) => entry.text.startsWith("三點整。"));
    expect(anomaly?.time).toBe(1620);
  });

  it("keeps the bus arrival on 00:17 even when waiting jumps across it", () => {
    const state = freshState(lastBus);
    state.time = 15;
    state.crossedMidnight = true;
    state.doneEvents = ["bus-blank", "paper"];
    applyAction(lastBus, state, "wait", ctxFor(lastBus, state));
    const arrival = state.narrative.find((entry) => entry.text.includes("真正有聲音的公車"));
    expect(arrival?.time).toBe(1457);
  });

  it("keeps an omen consequence on its foretold minute after a long action", () => {
    const state = freshState(hotel);
    state.time = 145; // 02:25, past the 02:20 omen
    state.crossedMidnight = true;
    evaluateTriggers(hotel, state);
    const happened = state.narrative.find((entry) => entry.text.includes("時間不對的記錄"));
    expect(happened?.time).toBe(140);
  });

  it("stamps a late night-desk ending at 06:00 rather than the overshooting action", () => {
    const state = freshState(nightDesk);
    state.time = 1798;
    applyAction(nightDesk, state, "idle", ctxFor(nightDesk, state));
    const ending = state.narrative.at(-1);
    expect(state.ended).toBe("shift-end");
    expect(ending?.time).toBe(1800);
  });
});
