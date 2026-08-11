// Scene registry. Adding a new 場所： create scenes/<name>.js exporting a
// scene object (see docs/scene-contract.md), import it here, and add it to
// the array. app.js registers everything in this list, and the index page
// lists them in this order.

import { hotel } from "./hotel.js";
import { nightDesk } from "./night-desk.js";
import { store } from "./store.js";

export const scenes = [
  hotel,
  nightDesk,
  store,
];
