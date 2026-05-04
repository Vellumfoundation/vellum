const blocked = new Set((process.env.RPC_BLOCKED_CLIENTS || "").split(",").map((value) => value.trim()).filter(Boolean));

export function isBlockedClient(client: string): boolean {
  return blocked.has(client);
}
