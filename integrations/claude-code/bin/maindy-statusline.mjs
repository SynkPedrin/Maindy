#!/usr/bin/env node
// Claude Code statusLine command: prints one compact `maindy.` line. Never blocks >200ms, never fails.
import { runStatusLine } from "../src/statusline.mjs";

let printed = false;
const print = (line) => {
  if (printed) return;
  printed = true;
  process.stdout.write(line + "\n");
};
const failsafe = setTimeout(() => {
  print("maindy.");
  process.exit(0);
}, 195);
failsafe.unref();

runStatusLine()
  .then((line) => print(line))
  .catch(() => print("maindy."))
  .finally(() => {
    clearTimeout(failsafe);
    process.exit(0);
  });
