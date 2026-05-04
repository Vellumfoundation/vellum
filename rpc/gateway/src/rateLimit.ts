const limit = Number(process.env.RPC_RATE_LIMIT_PER_MINUTE || "120");
const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (bucket.count >= limit) {
    return false;
  }

  bucket.count += 1;
  return true;
}
