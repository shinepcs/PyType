import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceRoots = ["js", "scripts", "tests"];
const publicRoots = ["assets", "css", "data", "js"];
const secretPatterns = [
  /sb_secret_[A-Za-z0-9_-]{16,}/,
  /sbp_[A-Za-z0-9_-]{20,}/,
  /(?:service_role|secret)["']?\s*[:=]\s*["'][A-Za-z0-9._-]{20,}["']/i,
  /postgres(?:ql)?:\/\/[^\s:]+:[^\s@]+@/i,
  /\bSUPABASE_(?:SERVICE_ROLE|SECRET)_KEY\b/i,
];
const allowedPublicExtensions = new Set([".css", ".html", ".ico", ".js", ".json", ".png", ".svg", ".webp", ".woff2"]);

async function collect(directory, extensions) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in checked trees: ${path}`);
    if (entry.isDirectory()) result.push(...await collect(path, extensions));
    else if (!extensions || extensions.has(extname(entry.name))) result.push(path);
  }
  return result;
}

const scriptFiles = (await Promise.all(
  sourceRoots.map((directory) => collect(resolve(root, directory), new Set([".js", ".mjs"]))),
)).flat();
const failures = [];
for (const file of scriptFiles) {
  const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (check.status !== 0) failures.push(`${relative(root, file)}: ${check.stderr.trim()}`);
}

for (const dataFile of await collect(resolve(root, "data"), new Set([".json"]))) {
  try {
    JSON.parse(await readFile(dataFile, "utf8"));
  } catch (error) {
    failures.push(`${relative(root, dataFile)}: invalid JSON (${error.message})`);
  }
}

const publicFiles = (await Promise.all(
  publicRoots.map((directory) => collect(resolve(root, directory))),
)).flat();
publicFiles.push(resolve(root, "index.html"), resolve(root, "404.html"));
for (const file of publicFiles) {
  if (!allowedPublicExtensions.has(extname(file))) {
    failures.push(`${relative(root, file)}: public file extension is not allowlisted`);
  }
  const content = await readFile(file, "utf8");
  for (const pattern of secretPatterns) {
    if (pattern.test(content)) failures.push(`${relative(root, file)}: privileged credential pattern detected`);
  }
  for (const token of content.matchAll(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g)) {
    try {
      const payload = JSON.parse(Buffer.from(token[0].split(".")[1], "base64url").toString("utf8"));
      if (payload?.role === "service_role") {
        failures.push(`${relative(root, file)}: legacy service_role JWT detected`);
      }
    } catch {
      // Non-JWT text that only resembles three base64url segments is harmless.
    }
  }
}

for (const file of await collect(resolve(root, "js"), new Set([".js", ".mjs"]))) {
  const content = await readFile(file, "utf8");
  if (/\binnerHTML\b/.test(content)) failures.push(`${relative(root, file)}: innerHTML is forbidden`);
  if (/\beval\s*\(|\bnew\s+Function\b/.test(content)) failures.push(`${relative(root, file)}: dynamic execution is forbidden`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Checked ${scriptFiles.length} scripts, JSON data, and ${publicFiles.length} public files.`);
