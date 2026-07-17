#!/usr/bin/env node
import { createReadStream, stat } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
]);

export function resolveFixtureRequestPath(fixtureDir, requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl ?? "/", "http://127.0.0.1").pathname);
  } catch {
    return null;
  }
  const requested = pathname.replace(/^\/+/, "") || "index.html";
  const root = resolve(fixtureDir);
  const candidate = resolve(root, requested);
  const rel = relative(root, candidate);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return candidate;
  return null;
}

export function fixtureContentType(path) {
  return CONTENT_TYPES.get(extname(path).toLowerCase()) ?? "application/octet-stream";
}

export function createFixtureHttpServer(fixtureDir) {
  return createServer((request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end("Method not allowed\n");
      return;
    }
    const path = resolveFixtureRequestPath(fixtureDir, request.url);
    if (!path) {
      response.writeHead(400);
      response.end("Invalid path\n");
      return;
    }
    stat(path, (error, info) => {
      if (error || !info.isFile()) {
        response.writeHead(404);
        response.end("Not found\n");
        return;
      }
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": info.size,
        "Content-Type": fixtureContentType(path),
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      const stream = createReadStream(path);
      stream.on("error", () => response.destroy());
      stream.pipe(response);
    });
  });
}

function run(argv) {
  const port = Number.parseInt(argv[0] ?? "", 10);
  const fixtureDir = argv[1] ? resolve(argv[1]) : null;
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !fixtureDir) {
    throw new Error("Usage: fixture-http-server.mjs <port> <fixture-dir>");
  }
  const server = createFixtureHttpServer(fixtureDir);
  server.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Fixture server listening on http://127.0.0.1:${port} from ${fixtureDir}`);
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => server.close(() => process.exit(0)));
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    run(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
