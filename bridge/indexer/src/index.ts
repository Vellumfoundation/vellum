const routes = [
  "GET /bridge/transactions/:address",
  "GET /bridge/transaction/:hash",
  "GET /bridge/status/:messageHash",
  "GET /bridge/tokens",
  "GET /bridge/health"
];

console.log("Bridge indexer API skeleton. Routes:");
console.log(routes.join("\n"));
console.log("Phase 3 will connect this to parent/L3 event indexing and Postgres.");
