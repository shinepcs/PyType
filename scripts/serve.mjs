import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const host = process.env.PYTYPE_HOST || "127.0.0.1";
const port = Number(process.env.PYTYPE_PORT || 4173);
const publicFiles = new Set(["index.html", "404.html", ".nojekyll"]);
const publicDirectories = new Set(["assets", "css", "data", "js"]);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

async function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl, `http://${host}:${port}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/PyType" || pathname.startsWith("/PyType/")) {
    pathname = pathname.slice("/PyType".length) || "/";
  }
  if (pathname.includes("\\") || pathname.includes("\0")) return null;
  if (pathname.endsWith("/")) pathname += "index.html";
  const relativePath = pathname.replace(/^\/+/, "");
  const segments = relativePath.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) return null;
  const candidate = resolve(root, `.${pathname}`);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return null;
  const [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(candidate)]);
  const normalizedRelative = relative(realRoot, realCandidate).split(sep).join("/");
  if (normalizedRelative.startsWith("../") || normalizedRelative === "..") return null;
  const topLevel = normalizedRelative.split("/", 1)[0];
  return publicFiles.has(normalizedRelative) || publicDirectories.has(topLevel) ? realCandidate : null;
}

const server = createServer(async (request, response) => {
  try {
    const filePath = await resolveRequestPath(request.url ?? "/");
    if (!filePath) throw new Error("not public");
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("not a file");
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": mimeTypes[extname(filePath)] ?? "application/octet-stream",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    createReadStream(resolve(root, "404.html")).pipe(response);
  }
});

server.listen(port, host, () => {
  console.log(`Python Typing Survival served at http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
