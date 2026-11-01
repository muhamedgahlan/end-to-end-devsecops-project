import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMetricsSnapshot, createServer, routeLabel, safePublicPath } from "../src/server.js";

test("routeLabel groups important application routes", () => {
  assert.equal(routeLabel("/"), "/");
  assert.equal(routeLabel("/index.html"), "/");
  assert.equal(routeLabel("/healthz"), "/healthz");
  assert.equal(routeLabel("/metrics"), "/metrics");
  assert.equal(routeLabel("/assets/styles.css"), "/assets");
  assert.equal(routeLabel("/missing"), "other");
});

test("safePublicPath blocks path traversal", () => {
  assert.equal(safePublicPath("/../package.json"), null);
});

test("metrics endpoint returns prometheus text", async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/metrics`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /devops_project_http_requests_total/);
    assert.match(body, /devops_project_uptime_seconds/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("buildMetricsSnapshot includes metric metadata", () => {
  const snapshot = buildMetricsSnapshot();

  assert.match(snapshot, /# HELP devops_project_http_requests_total/);
  assert.match(snapshot, /# TYPE devops_project_uptime_seconds gauge/);
});
