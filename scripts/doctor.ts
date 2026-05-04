import { existsSync } from "node:fs";

const tools = ["node", "pnpm", "docker", "forge"];

console.log("Vellum doctor");
console.log("Required local tools:", tools.join(", "));
console.log("Config present:", existsSync("config/project.json"));
console.log("Run `pnpm validate:config` for strict repository checks.");
