import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const configPath = path.join(appRoot, "config", "demo.config.json");

export function loadConfig() {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  return {
    appRoot,
    publicDir: path.join(appRoot, "public"),
    server: {
      host: config.server?.host || "127.0.0.1",
      port: Number(config.server?.port || 5177)
    },
    fpgaTargets: config.fpgaTargets || [],
    ssh: {
      connectTimeoutMs: Number(config.ssh?.connectTimeoutMs || 12000),
      allowTerminalInput: config.ssh?.allowTerminalInput !== false
    },
    commands: config.commands || {},
    unprotected: {
      distro: config.unprotected?.distro || "Ubuntu",
      workingDirectory: config.unprotected?.workingDirectory || path.resolve(appRoot, "..", "e"),
      defaultCore: String(config.unprotected?.defaultCore || "0"),
      defaultKey: config.unprotected?.defaultKey || "00112233445566778899aabbccddeeff",
      defaultSamples: Number(config.unprotected?.defaultSamples || 200000),
      defaultCacheSets: Number(config.unprotected?.defaultCacheSets || 64),
      defaultLineShift: Number(config.unprotected?.defaultLineShift || 6),
      defaultCacheLevel: Number(config.unprotected?.defaultCacheLevel || 1),
      appPort: Number(config.unprotected?.appPort || 8899),
      buildOnStart: config.unprotected?.buildOnStart !== false
    }
  };
}

export function publicTarget(target) {
  return {
    name: target.name,
    label: target.label || target.name,
    protection: target.protection || target.name,
    host: target.host,
    port: target.port,
    username: target.username,
    authProfile: target.authProfile,
    workingDirectory: target.workingDirectory,
    usesPassword: Boolean(target.password)
  };
}
