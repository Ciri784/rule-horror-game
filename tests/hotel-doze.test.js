import { describe, it, expect } from "vitest";
import { freshState, applyAction, narrate } from "../engine.js";
import { hotel } from "../scenes/hotel.js";

const mk = () => {
  const state = freshState(hotel);
  const ctx = { scene: hotel, visitCount: 1, fresh: true, narrate: (t, k) => narrate(state, t, k) };
  return { state, ctx };
};
const ids = (s, ctx) => hotel.actions(s, ctx).map((a) => a.id);

describe("hotel doze（瞇一下）", () => {
  it("午夜後、門牌還是 602 才出現", () => {
    const { state, ctx } = mk();
    expect(ids(state, ctx)).not.toContain("doze"); // 午夜前
    state.time = 180; state.crossedMidnight = true;
    expect(ids(state, ctx)).toContain("doze");
  });

  it("+30 分鐘，前三次免費，第四次起 drift+1", () => {
    const { state, ctx } = mk();
    state.time = 180; state.crossedMidnight = true;
    // derive 只在 applyAction 裡跑：先做一個無害動作讓 03:00 整點事件結算（drift+1），
    // 再以那個當基準線，才量的到 doze 自己的 drift。
    applyAction(hotel, state, "look-bed", ctx); // +1 分鐘，本身不動 drift
    const d0 = state.drift;
    applyAction(hotel, state, "doze", ctx); expect(state.time).toBe(211);
    applyAction(hotel, state, "doze", ctx); expect(state.time).toBe(241);
    applyAction(hotel, state, "doze", ctx); expect(state.time).toBe(271);
    expect(state.drift).toBe(d0); // 前三次免費
    applyAction(hotel, state, "doze", ctx); expect(state.time).toBe(301);
    expect(state.drift).toBe(d0 + 1);
  });

  it("門牌翻成 704 之後消失", () => {
    const { state, ctx } = mk();
    state.time = 180; state.crossedMidnight = true;
    expect(ids(state, ctx)).toContain("doze"); // 602 時有
    state.doorNumber = "704";
    expect(ids(state, ctx)).not.toContain("doze");
  });

  it("第二次鈴（06:10）之後不能再瞇", () => {
    const { state, ctx } = mk();
    state.time = 370; state.crossedMidnight = true;
    expect(ids(state, ctx)).not.toContain("doze");
  });
});
