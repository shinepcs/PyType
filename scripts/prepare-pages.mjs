import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const destination = resolve(root, ".pages-dist");
const entries = ["index.html", "404.html", ".nojekyll", "assets", "css", "js", "data"];

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });

for (const entry of entries) {
  await cp(resolve(root, entry), resolve(destination, entry), { recursive: true });
}

await rm(resolve(destination, "js", "config.example.js"), { force: true });

console.log(`Prepared ${entries.length} public entries in .pages-dist`);
