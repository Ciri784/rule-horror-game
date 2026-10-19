// Bounded multi-path audit. Despite this file's old name, it does not claim
// to exhaust every possible state: it verifies distinct, ordinary player
// choice policies can each reach an ending without a dead end.
import { scenes } from "../scenes/index.js";
import { runPath, strategies } from "./path-audit.mjs";

let failed = false;
for (const scene of scenes) {
  for (const strategyName of Object.keys(strategies)) {
    const result = runPath(scene, strategyName);
    const status = result.state.ended || (result.deadlocked ? "deadlocked" : "step-limit");
    console.log(`${scene.id.padEnd(12)} ${strategyName.padEnd(6)} ${status.padEnd(18)} ${result.path.length} actions`);
    if (!result.state.ended || result.deadlocked) failed = true;
  }
}

if (failed) process.exitCode = 1;
