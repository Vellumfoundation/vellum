import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const zeroAddress = "0x0000000000000000000000000000000000000000";

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertFile(path: string): void {
  assert(existsSync(path), `Missing required file: ${path}`);
}

export function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function isZeroAddress(value: unknown): boolean {
  return typeof value === "string" && value.toLowerCase() === zeroAddress;
}

export function isPlaceholderUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;

  const normalized = value.toLowerCase();
  return normalized.includes("vellum.example")
    || normalized.includes("project.example")
    || normalized.includes(".example")
    || normalized.includes("example.com")
    || normalized.includes("tbd");
}

export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function walkFiles(root: string, predicate: (path: string) => boolean): string[] {
  if (!existsSync(root)) return [];

  const results: string[] = [];
  const entries = readdirSync(root);

  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".git" || entry === ".turbo") continue;
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      results.push(...walkFiles(path, predicate));
    } else if (predicate(path)) {
      results.push(path);
    }
  }

  return results;
}
