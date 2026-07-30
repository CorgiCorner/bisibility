import { readFileSync } from "node:fs";

const required = readFileSync(new URL("../.nvmrc", import.meta.url), "utf8").trim();
const current = process.versions.node;

if (current === required) {
  console.log(`Node ${current}`);
  process.exit(0);
}

console.error(
  `Repository development requires Node ${required}. Current: ${current}. Run: nvm install && nvm use`,
);
process.exit(1);
