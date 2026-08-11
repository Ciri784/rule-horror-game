// 煙霧測試:三個場景都真的 renderScene 一遍,炸了就現形。
import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><main id=\"app\"></main></body></html>", { url: "https://example.com/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
globalThis.localStorage = dom.window.localStorage;
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);

const { registerScene, renderScene, renderIndex } = await import("../core.js");
const { scenes } = await import("../scenes/index.js");
scenes.forEach(registerScene);

describe("DOM smoke: every scene renders", () => {
  beforeEach(() => {
    document.getElementById("app").innerHTML = "";
    localStorage.clear();
  });
  it("index renders", () => {
    renderIndex();
    expect(document.querySelectorAll(".scene-card, a").length).toBeGreaterThan(0);
  });
  for (const s of scenes) {
    it(`scene ${s.id} renders without throwing`, () => {
      renderScene(s.id);
      const mon = document.querySelector(".monitor");
      expect(mon, "monitor mounted").toBeTruthy();
      expect(document.querySelectorAll(".narr-row").length).toBeGreaterThan(0);
      expect(document.querySelectorAll(".rulebook, ol.rules").length).toBeGreaterThan(0);
      expect(document.querySelectorAll(".action-btn").length).toBeGreaterThan(0);
    });
  }
});
