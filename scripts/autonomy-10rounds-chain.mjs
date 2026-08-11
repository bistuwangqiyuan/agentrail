#!/usr/bin/env node
/**
 * Alias entry for chain-focused 10-round autonomy.
 * Usage: node scripts/autonomy-10rounds-chain.mjs [baseUrl]
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, "autonomy-10rounds.mjs");
const base = process.argv[2] || "http://127.0.0.1:3000";
const r = spawnSync(process.execPath, [target, base], { stdio: "inherit" });
process.exit(r.status ?? 1);
