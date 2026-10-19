// Bounded player-path runner. It only uses actions currently offered by a
// scene; no private state is set by the harness.
import { freshState, applyAction, narrate } from "../engine.js";

export const strategies = {
  first: (actions) => actions[0],
  last: (actions) => actions.at(-1),
  rotate: (actions, step) => actions[step % actions.length],
};

export function runPath(scene, strategyName, maxSteps = 600) {
  const state = freshState(scene, 0);
  const ctx = {
    scene,
    visitCount: 1,
    fresh: true,
    narrate: (text, kind) => narrate(state, text, kind),
  };
  const choose = strategies[strategyName];
  if (!choose) throw new Error(`unknown path strategy: ${strategyName}`);

  const path = [];
  for (let step = 0; step < maxSteps && !state.ended; step++) {
    const actions = scene.actions(state, ctx) || [];
    if (!actions.length) return { state, path, deadlocked: true, exhausted: false };
    const action = choose(actions, step);
    path.push(action.id);
    applyAction(scene, state, action.id, ctx);
  }
  return { state, path, deadlocked: false, exhausted: !state.ended };
}
