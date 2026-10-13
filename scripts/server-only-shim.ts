/**
 * Bun preload for CLI scripts that import server modules: `server-only`
 * throws outside React Server Components, so stub it to an empty module.
 */
import { plugin } from "bun";

plugin({
  name: "server-only-shim",
  setup(build) {
    build.module("server-only", () => ({ exports: {}, loader: "object" }));
  },
});
