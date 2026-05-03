import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const configPath = path.join(appRoot, "config", "demo.config.json");

export function loadConfig() {
  const raw = fs.readFileSync(configPath, "utf8");
  const config = JSON.parse(raw);

  if (!Array.isArray(config.fpgaTargets) || config.fpgaTargets.length === 0) {
    throw new Error("config.fpgaTargets must contain at least one target");
  }

  return {
    appRoot,
    publicDir: path.join(appRoot, "public"),
    configPath,
    server: {
      host: config.server?.host || "127.0.0.1",
      port: Number(config.server?.port || 5177),
    },
    fpgaTargets: config.fpgaTargets,
    ssh: {
      connectTimeoutMs: Number(config.ssh?.connectTimeoutMs || 12000),
      allowTerminalInput: config.ssh?.allowTerminalInput !== false,
      strictHostKeyChecking: config.ssh?.strictHostKeyChecking === true,
    },
    commands: {
      buildTestC: String(config.commands?.buildTestC || "gcc test.c -o test_with"),
      runTestC: String(config.commands?.runTestC || "./test_with"),
      collectResult: String(config.commands?.collectResult || "true"),
    },
  };
}

export function publicTarget(target) {
  return {
    name: target.name,
    host: target.host,
    port: target.port,
    username: target.username,
    authProfile: target.authProfile,
    workingDirectory: target.workingDirectory,
    usesPrivateKey: Boolean(target.privateKeyPath),
    usesPassword: Boolean(target.password),
  };
}
