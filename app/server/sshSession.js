import { Client } from "ssh2";

function nowIso() {
  return new Date().toISOString();
}

function emptyResult(commandKey = null) {
  return {
    status: "idle",
    commandKey,
    command: null,
    startedAt: null,
    endedAt: null,
    output: ""
  };
}

export class SshSession {
  constructor(config, hub) {
    this.config = config;
    this.hub = hub;
    this.client = null;
    this.shell = null;
    this.target = null;
    this.status = "idle";
    this.activeResultKey = null;
    this.latestResult = emptyResult();
    this.resultsByCommand = {
      runTestWith: emptyResult("runTestWith"),
      runTestNo: emptyResult("runTestNo")
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
      latestResult: this.latestResult,
      resultsByCommand: this.resultsByCommand
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

    if (!this.isResultCommand(commandKey)) {
      this.shell.write(`${fullCommand}\n`);
      this.hub.emit("terminal", { stream: "stdin", text: `$ ${fullCommand}\n` });
      return this.snapshot();
    }

    this.closeActiveResult();
    const result = {
      status: "running",
      commandKey,
      command: fullCommand,
      startedAt: nowIso(),
      endedAt: null,
      output: ""
    };
    this.activeResultKey = commandKey;
    this.latestResult = result;
    this.resultsByCommand[commandKey] = result;
    this.emitResult(result);
    this.shell.write(`${fullCommand}\n`);
    this.hub.emit("terminal", { stream: "stdin", text: `$ ${fullCommand}\n` });
    return this.snapshot();
  }

  appendOutput(text) {
    const result = this.activeResultKey ? this.resultsByCommand[this.activeResultKey] : null;
    if (result?.status === "running") {
      result.output += text;
      if (result.output.length > 30000) {
        result.output = result.output.slice(-30000);
      }
      this.latestResult = result;
      this.emitResult(result);
    }
  }

  markLatestComplete() {
    const result = this.activeResultKey ? this.resultsByCommand[this.activeResultKey] : this.latestResult;
    if (result?.status === "running") {
      result.status = "captured";
      result.endedAt = nowIso();
      this.latestResult = result;
      this.emitResult(result);
      this.activeResultKey = null;
    }
    return this.latestResult;
  }

  closeActiveResult() {
    const result = this.activeResultKey ? this.resultsByCommand[this.activeResultKey] : null;
    if (result?.status === "running") {
      result.status = "captured";
      result.endedAt = nowIso();
      this.latestResult = result;
      this.emitResult(result);
    }
    this.activeResultKey = null;
  }

  emitResult(result) {
    this.hub.emit("result", {
      latestResult: result,
      resultsByCommand: this.resultsByCommand
    });
  }

  isResultCommand(commandKey) {
    return commandKey === "runTestWith" || commandKey === "runTestNo";
  }

  shellQuote(value) {
    return `'${String(value).replaceAll("'", "'\\''")}'`;
  }
}
