import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const currentFile = fileURLToPath(import.meta.url);
const publicDir = normalize(join(__dirname, "..", "public"));

const port = Number.parseInt(process.env.PORT || "3000", 10);
const metrics = {
  startedAt: Date.now(),
  totalRequests: 0,
  requestsByRoute: new Map()
};

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

export function routeLabel(pathname) {
  if (pathname === "/" || pathname === "/index.html") return "/";
  if (pathname === "/healthz") return "/healthz";
  if (pathname === "/metrics") return "/metrics";
  if (pathname.startsWith("/assets/")) return "/assets";
  return "other";
}

export function recordRequest(pathname) {
  metrics.totalRequests += 1;
  const label = routeLabel(pathname);
  metrics.requestsByRoute.set(label, (metrics.requestsByRoute.get(label) || 0) + 1);
}

export function buildMetricsSnapshot() {
  const uptimeSeconds = Math.floor((Date.now() - metrics.startedAt) / 1000);
  const requestLines = [...metrics.requestsByRoute.entries()]
    .map(([route, count]) => `devops_project_http_requests_total{route="${route}"} ${count}`)
    .join("\n");

  return [
    "# HELP devops_project_http_requests_total Total HTTP requests handled by route.",
    "# TYPE devops_project_http_requests_total counter",
    requestLines || 'devops_project_http_requests_total{route="/"} 0',
    "# HELP devops_project_uptime_seconds Application uptime in seconds.",
    "# TYPE devops_project_uptime_seconds gauge",
    `devops_project_uptime_seconds ${uptimeSeconds}`
  ].join("\n");
}

export function safePublicPath(pathname) {
  const cleanPath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const target = normalize(join(publicDir, cleanPath));

  if (!target.startsWith(publicDir)) {
    return null;
  }

  return target;
}

async function serveStaticFile(requestPath, response) {
  const filePath = safePublicPath(requestPath);

  if (!filePath) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentTypes[extname(filePath)] || "application/octet-stream",
      "cache-control": "public, max-age=300"
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

export function createServer() {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    recordRequest(url.pathname);

    if (url.pathname === "/healthz") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (url.pathname === "/metrics") {
      response.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" });
      response.end(`${buildMetricsSnapshot()}\n`);
      return;
    }

    await serveStaticFile(url.pathname, response);
  });
}

if (process.argv[1] === currentFile) {
  createServer().listen(port, "0.0.0.0", () => {
    console.log(`End to End DevOps Project running on port ${port}`);
  });
}
