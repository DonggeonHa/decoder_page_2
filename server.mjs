import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = process.cwd();
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function resolveRequestPath(urlPath) {
  const cleanPath = decodeURIComponent((urlPath || "/").split("?")[0]);
  const normalized = normalize(cleanPath).replace(/^(\.\.[/\\])+/, "");
  const target = resolve(join(root, normalized));
  const rootPrefix = root.endsWith(sep) ? root : root + sep;

  if (target !== root && target.indexOf(rootPrefix) !== 0) {
    return null;
  }

  if (!existsSync(target)) {
    return null;
  }

  const stats = statSync(target);
  if (stats.isDirectory()) {
    return join(target, "index.html");
  }

  return target;
}

const server = createServer((request, response) => {
  const target = resolveRequestPath(request.url);

  if (!target || !existsSync(target)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const type = mimeTypes[extname(target).toLowerCase()] || "application/octet-stream";
  response.writeHead(200, {
    "content-type": type,
    "cache-control": "no-store"
  });
  createReadStream(target).pipe(response);
});

server.listen(port, host, () => {
  console.log(`FILE QR Decoder running at http://${host}:${port}/`);
});
