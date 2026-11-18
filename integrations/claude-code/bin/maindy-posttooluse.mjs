#!/usr/bin/env node
// Claude Code PostToolUse hook (matcher: Bash). Prints updatedToolOutput only when compression
// is meaningful; on any failure prints nothing and exits 0 (Claude Code keeps the original output).
import { runHook } from "../src/posttooluse.mjs";

runHook()
  .then((out) => {
    if (out) process.stdout.write(JSON.stringify(out));
  })
  .catch(() => {})
  .finally(() => process.exit(0));
