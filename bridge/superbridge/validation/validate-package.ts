import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import "./validate-metadata";
import "./validate-addresses";
import "./validate-token-list";

const production = process.env.PROJECT_ENV === "production";
const superbridgeDir = process.env.SUPERBRIDGE_DIR || "bridge/superbridge";

function fail(message: string): never {
  throw new Error(`Superbridge package invalid: ${message}`);
}

function requireFile(path: string): Buffer {
  if (!existsSync(path)) fail(`missing ${path}`);
  const content = readFileSync(path);
  if (content.length === 0) fail(`${path} must not be empty`);
  return content;
}

for (const file of [
  "chain-metadata.json",
  "bridge-addresses.json",
  "token-list.json",
  "integration-notes.md",
  "assets/icon.svg",
  "assets/icon.png",
  "assets/logo.svg"
]) {
  requireFile(join(superbridgeDir, file));
}

const notes = readFileSync(join(superbridgeDir, "integration-notes.md"), "utf8").toLowerCase();
for (const phrase of [
  "chain-metadata.json",
  "bridge-addresses.json",
  "token-list.json",
  "withdrawal challenge period",
  "eth deposit",
  "eth withdrawal",
  "erc-20 deposit",
  "erc-20 withdrawal",
  "security contact",
  "incident contact",
  "no custom behavior"
]) {
  if (!notes.includes(phrase)) fail(`integration notes must mention ${phrase}`);
}

for (const file of ["assets/icon.svg", "assets/logo.svg"]) {
  const svg = readFileSync(join(superbridgeDir, file), "utf8");
  if (!svg.includes("<svg")) fail(`${file} must be an SVG asset`);
}

if (production) {
  const icon = readFileSync(join(superbridgeDir, "assets/icon.png"));
  const pngSignature = icon.subarray(0, 8).toString("hex");
  if (pngSignature !== "89504e470d0a1a0a") {
    fail("assets/icon.png must be a real PNG asset in production");
  }
}

console.log("Superbridge integration package passed validation.");
