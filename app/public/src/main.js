import { apiGet, apiPost } from "./api.js";

const state = {
  targets: [],
  commands: {},
  terminalText: ""
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(node.dataset.timer);
  node.dataset.timer = setTimeout(() => node.classList.remove("show"), 1800);
}

function stripAnsi(value) {
  return String(value)
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function appendTerminal(text) {
  state.terminalText += stripAnsi(text);
  if (state.terminalText.length > 60000) {
    state.terminalText = state.terminalText.slice(-60000);
  }
  const node = $("#terminalOutput");
  node.textContent = state.terminalText || "等待终端输出...";
  node.scrollTop = node.scrollHeight;
}

function setStatus(session) {
  const connected = session.connected;
  $("#sshStatus").textContent = connected ? "SSH 已连接" : `SSH ${session.status || "未连接"}`;
  $("#sshStatus").className = `pill ${connected ? "online" : "offline"}`;
  $("#sideStatus").textContent = connected ? "已连接" : "未连接";
}

function renderTargets() {
  $("#targetSelect").innerHTML = state.targets
    .map((target) => `<option value="${escapeHtml(target.name)}">${escapeHtml(target.name)}</option>`)
    .join("");
  renderTargetMeta();
}

function renderTargetMeta() {
  const target = state.targets.find((item) => item.name === $("#targetSelect").value) || state.targets[0];
  if (!target) return;
  $("#targetMeta").innerHTML = `
    <div><dt>Host</dt><dd>${escapeHtml(target.host)}:${escapeHtml(String(target.port || 22))}</dd></div>
    <div><dt>User</dt><dd>${escapeHtml(target.username)}</dd></div>
    <div><dt>Workdir</dt><dd>${escapeHtml(target.workingDirectory || "~")}</dd></div>
  `;
}

function renderCommands() {
  $("#cmdRun").textContent = state.commands.runTestWith || "--";
  $("#cmdList").textContent = state.commands.listHome || "--";
  $("#cmdCheck").textContent = state.commands.checkBinary || "--";
}

function renderLatestResult(result) {
  $("#latestCommand").textContent = result?.command || "--";
  $("#latestStatus").textContent = result?.status || "--";
  $("#latestStartedAt").textContent = result?.startedAt || "--";
  $("#latestOutput").textContent = result?.output ? stripAnsi(result.output) : "暂无输出";
  $("#resultStatus").textContent = result?.status === "running" ? "结果采集中" : "结果待采集";
  $("#resultStatus").className = `pill ${result?.status === "running" ? "idle" : ""}`;
}

function bindEvents() {
  $$(".nav-item[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".nav-item").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      $$(".view").forEach((view) => view.classList.toggle("active", view.id === button.dataset.view));
    });
  });

  $("#targetSelect").addEventListener("change", renderTargetMeta);

  $("#connectBtn").addEventListener("click", async () => {
    const session = await apiPost("/api/fpga/ssh/connect", { targetName: $("#targetSelect").value });
    setStatus(session);
    toast("连接请求已发送");
  });

  $("#disconnectBtn").addEventListener("click", async () => {
    const session = await apiPost("/api/fpga/ssh/disconnect");
    setStatus(session);
    toast("断开请求已发送");
  });

  $$(".command").forEach((button) => {
    button.addEventListener("click", async () => {
      const session = await apiPost("/api/fpga/run/test-partition", { commandKey: button.dataset.command });
      setStatus(session);
      renderLatestResult(session.latestResult);
    });
  });

  $("#terminalForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = $("#terminalInput");
    const value = input.value;
    if (!value.trim()) return;
    await apiPost("/api/fpga/terminal/input", { data: `${value}\n` });
    input.value = "";
  });

  $("#clearBtn").addEventListener("click", () => {
    state.terminalText = "";
    $("#terminalOutput").textContent = "";
  });

  $("#copyBtn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("#terminalOutput").textContent);
      toast("终端输出已复制");
    } catch {
      toast("浏览器限制了剪贴板访问");
    }
  });

  $("#markCompleteBtn").addEventListener("click", async () => {
    renderLatestResult(await apiPost("/api/fpga/results/mark-complete"));
  });

  $("#refreshResultBtn").addEventListener("click", async () => {
    renderLatestResult(await apiGet("/api/fpga/results/latest"));
  });
}

function bindEventSource() {
  const source = new EventSource("/events/terminal");
  source.addEventListener("terminal", (event) => {
    const payload = JSON.parse(event.data);
    appendTerminal(payload.text);
  });
  source.addEventListener("status", (event) => setStatus(JSON.parse(event.data)));
  source.addEventListener("result", (event) => renderLatestResult(JSON.parse(event.data)));
  source.onerror = () => {
    $("#backendStatus").textContent = "事件流重连中";
    $("#backendStatus").className = "pill idle";
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function init() {
  bindEvents();
  bindEventSource();

  const health = await apiGet("/api/health");
  $("#backendStatus").textContent = "后端在线";
  $("#backendStatus").className = "pill online";
  setStatus(health.session);
  renderLatestResult(health.session.latestResult);

  const payload = await apiGet("/api/fpga/targets");
  state.targets = payload.targets;
  state.commands = payload.commands;
  renderTargets();
  renderCommands();
  appendTerminal("后端已连接，等待 SSH 会话...\n");
}

init().catch((error) => {
  $("#backendStatus").textContent = "后端异常";
  $("#backendStatus").className = "pill offline";
  appendTerminal(`[frontend error] ${error.message}\n`);
});
