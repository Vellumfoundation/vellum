async function main(): Promise<void> {
  const urls = [
    process.env.VELLUM_RPC_URL,
    process.env.EXPLORER_URL,
    process.env.STATUS_URL
  ].filter((url): url is string => Boolean(url));

  for (const url of urls) {
    const startedAt = Date.now();
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    console.log(JSON.stringify({ url, ok: response.ok, status: response.status, latencyMs: Date.now() - startedAt }));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
