#!/usr/bin/env node
import { main } from "./cli.js";

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`contextforge: ${message}`);
  process.exitCode = 1;
});
