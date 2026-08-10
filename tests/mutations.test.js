// 規則突變的資料完整性:每條宣告了 mutate 的規則,from 必須真的出現在
// 原文裡(否則替換永遠不會生效),to 與 when 必須齊全。
// 突變只改顯示;引擎判定永遠照 scene.rules 的原文。
import { test, expect } from "vitest";
import { scenes } from "../scenes/index.js";

for (const scene of scenes) {
  for (const [id, rule] of Object.entries(scene.rules || {})) {
    if (!rule.mutate) continue;
    test(`${scene.id} 規則 ${id} 的突變宣告有效`, () => {
      expect(typeof rule.mutate.when).toBe("function");
      expect(typeof rule.mutate.from).toBe("string");
      expect(rule.mutate.to).toBeTruthy();
      expect(rule.text).toContain(rule.mutate.from);
    });
  }
}
