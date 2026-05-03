import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { loadConfig, publicTarget } from "./config.js";
import { SseHub } from "./sseHub.js";
import { SshSession } from "./sshSession.js";

const config = loadConfig();
const hub = new SseHub();
const sshSession = new SshSession(config, hub);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function routeApi(request, response, url) {
  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, { ok: true, session: sshSession.snapshot() });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/fpga/targets") {
      sendJson(response, 200, {
        targets: config.fpgaTargets.map(publicTarget),
        commands: config.commands
      });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/fpga/results/latest") {
      sendJson(response, 200, sshSession.latestResult);
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/fpga/ssh/connect") {
      const body = await readJson(request);
      sendJson(response, 200, sshSession.connect(body.targetName || config.fpgaTargets[0].name));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/fpga/ssh/disconnect") {
      sendJson(response, 200, sshSession.disconnect());
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/fpga/terminal/input") {
      const body = await readJson(request);
      sendJson(response, 200, sshSession.writeInput(String(body.data || "")));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/fpga/run/test-partition") {
      const body = await readJson(request);
      sendJson(response, 200, sshSession.runPreset(body.commandKey || "runTestWith"));
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/fpga/results/mark-complete") {
      sendJson(response, 200, sshSession.markLatestComplete());
      return true;
    }
  } catch (error) {
    sendJson(response, 400, { ok: false, error: error.message });
    return true;
  }

  return false;
}

function serveStatic(request, response, url) {
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.resolve(config.publicDir, `.${pathname}`);
  if (!filePath.startsWith(config.publicDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
    response.end(data);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/events/terminal") {
    hub.add(response);
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    const handled = await routeApi(request, response, url);
    if (!handled) sendJson(response, 404, { ok: false, error: "API not found" });
    return;
  }

  serveStatic(request, response, url);
});

server.listen(config.server.port, config.server.host, () => {
  console.log(`FPGA console listening on http://${config.server.host}:${config.server.port}`);
});
