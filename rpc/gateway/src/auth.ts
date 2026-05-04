export function isAdminKey(key: string | undefined): boolean {
  return Boolean(process.env.RPC_ADMIN_API_KEY && key === process.env.RPC_ADMIN_API_KEY);
}
