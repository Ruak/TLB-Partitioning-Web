import { Client } from "ssh2";

function nowIso() {
  return new Date().toISOString();
}

export class SshSession {
  constructor(config, hub) {
    this.config = config;
    this.hub = hub;
    this.client = null;
    this.shell = null;
    this.target = null;
    this.status = "idle";
    this.latestResult = {
      status: "idle",
      commandKey: null,
      command: null,
      startedAt: null,
      endedAt: null,
      output: ""
    };
  }

  get connected() {
    return Boolean(this.client && this.shell && this.status === "connected");
  }

  snapshot() {
    return {
      status: this.status,
      connected: this.connected,
      target: this.target ? this.publicTarget(this.target) : null,
      latestResult: this.latestResult
    };
  }

  publicTarget(target) {
    return {
      name: target.name,
      host: target.host,
      port: target.port,
      username: target.username,
      authProfile: target.authProfile,
      workingDirectory: target.workingDirectory,
      usesPassword: Boolean(target.password)
    };
  }

  connect(targetName) {
    if (this.connected) return this.snapshot();

    const target = this.config.fpgaTargets.find((item) => item.name === targetName);
    if (!target) throw new Error(`Unknown FPGA target: ${targetName}`);

    this.disconnect(false);
    this.target = target;
    this.status = "connecting";
    this.hub.emit("status", this.snapshot());
    this.hub.emit("terminal", {
      stream: "system",
      text: `[${nowIso()}] connecting ${target.username}@${target.host}:${target.port}\n`
    });

    const client = new Client();
    this.client = client;

    client.on("ready", () => {
      client.shell({ term: "xterm-color", cols: 120, rows: 36 }, (error, stream) => {
        if (error) {
          this.fail(error);
          return;
        }

        this.shell = stream;
        this.status = "connected";
        this.hub.emit("terminal", { stream: "system", text: `[${nowIso()}] SSH shell ready\n` });
        this.hub.emit("status", this.snapshot());

        stream.on("data", (chunk) => {
          const text = chunk.toString("utf8");
          this.appendOutput(text);
          this.hub.emit("terminal", { stream: "stdout", text });
        });

        stream.stderr?.on("data", (chunk) => {
          const text = chunk.toString("utf8");
          this.appendOutput(text);
          this.hub.emit("terminal", { stream: "stderr", text });
        });

        stream.on("close", () => {
          this.status = "closed";
          this.shell = null;
          this.hub.emit("terminal", { stream: "system", text: `\n[${nowIso()}] SSH shell closed\n` });
          this.hub.emit("status", this.snapshot());
        });
      });
    });

    client.on("error", (error) => this.fail(error));
    client.on("close", () => {
      this.client = null;
      this.shell = null;
      if (this.status !== "failed") this.status = "closed";
      this.hub.emit("status", this.snapshot());
    });

    client.connect({
      host: target.host,
      port: Number(target.port || 22),
      username: target.username,
      password: target.password,
      readyTimeout: this.config.ssh.connectTimeoutMs,
      keepaliveInterval: 15000
    });

    return this.snapshot();
  }

  fail(error) {
    this.status = "failed";
    this.hub.emit("terminal", { stream: "system", text: `[ssh error] ${error.message}\n` });
    this.hub.emit("status", this.snapshot());
  }

  disconnect(emit = true) {
    if (emit) {
      this.hub.emit("terminal", { stream: "system", text: "\n[system] disconnect requested\n" });
    }
    if (this.shell) {
      this.shell.end("exit\n");
      this.shell = null;
    }
    if (this.client) {
      this.client.end();
      this.client = null;
    }
    this.status = "closed";
    if (emit) this.hub.emit("status", this.snapshot());
    return this.snapshot();
  }

  writeInput(data) {
    if (!this.config.ssh.allowTerminalInput) {
      throw new Error("Terminal input is disabled");
    }
    if (!this.connected) {
      throw new Error("SSH session is not connected");
    }
    this.shell.write(data);
    return this.snapshot();
  }

  runPreset(commandKey) {
    const command = this.config.commands[commandKey];
    if (!command) throw new Error(`Unknown command preset: ${commandKey}`);
    if (!this.connected) throw new Error("SSH session is not connected");

    const fullCommand = this.target?.workingDirectory
      ? `cd ${this.shellQuote(this.target.workingDirectory)} && ${command}`
      : command;

    this.latestResult = {
      status: "running",
      commandKey,
      command: fullCommand,
      startedAt: nowIso(),
      endedAt: null,
      output: ""
    };
    this.hub.emit("result", this.latestResult);
    this.shell.write(`${fullCommand}\n`);
    this.hub.emit("terminal", { stream: "stdin", text: `$ ${fullCommand}\n` });
    return this.snapshot();
  }

  appendOutput(text) {
    if (this.latestResult.status === "running") {
      this.latestResult.output += text;
      if (this.latestResult.output.length > 30000) {
        this.latestResult.output = this.latestResult.output.slice(-30000);
      }
      this.hub.emit("result", this.latestResult);
    }
  }

  markLatestComplete() {
    if (this.latestResult.status === "running") {
      this.latestResult.status = "captured";
      this.latestResult.endedAt = nowIso();
      this.hub.emit("result", this.latestResult);
    }
    return this.latestResult;
  }

  shellQuote(value) {
    return `'${String(value).replaceAll("'", "'\\''")}'`;
  }
}
