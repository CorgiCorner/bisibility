// Loaded with `node --import` so TypeScript resolution hooks register before
// worker imports resolve.
import { registerHooks } from "node:module";
import { load, resolve } from "./loader.mjs";

registerHooks({ load, resolve });
