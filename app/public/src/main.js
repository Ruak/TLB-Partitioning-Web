import { apiGet, apiPost } from "./api.js";

const state = {
  targets: [],
  commands: {},
  terminalText: "",
  latestResult: null,
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

function appendTerminal(text) {
  state.terminalText += text;
  if (state.terminalText.length > 60000) {
    state.terminalText = state.terminalText.slice(-60000);
  }
  $("#terminalOutput").textContent = state.terminalText || "等待终端输出...";
  $("#terminalOutput").scrollTop = $("#terminalOutput").scrollHeight;
}

function setStatus(session) {
  const connected = session.connected;
  $("#sshStatus").textContent = connected ? "SSH 已连接" : `SSH ${session.status || "未连接"}`;
  $("#sshStatus").className = `status-pill ${connected ? "online" : "offline"}`;
  $("#sideSshStatus").textContent = connected ? "已连接" : "未连接";
}

function renderTargets() {
  const select = $("#targetSelect");
  select.innerHTML = state.targets
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
  $("#cmdBuild").textContent = state.commands.buildTestC || "--";
  $("#cmdRun").textContent = state.commands.runTestC || "--";
  $("#cmdCollect").textContent = state.commands.collectResult || "--";
}

function renderLatestResult(result) {
  state.latestResult = result;
  $("#latestCommand").textContent = result?.command || "--";
  $("#latestStatus").textContent = result?.status || "--";
  $("#latestStartedAt").textContent = result?.startedAt || "--";
  $("#latestOutput").textContent = result?.output || "暂无输出";
  $("#resultStatus").textContent = result?.status === "running" ? "结果采集中" : "结果待采集";
  $("#resultStatus").className = `status-pill ${result?.status === "running" ? "idle" : ""}`;
}

async function init() {
  bindEvents();
  bindEventSource();

  const health = await apiGet("/api/health");
  $("#backendStatus").textContent = "后端在线";
  $("#backendStatus").className = "status-pill online";
  setStatus(health.session);
  renderLatestResult(health.session.latestResult);

  const targetPayload = await apiGet("/api/fpga/targets");
  state.targets = targetPayload.targets;
  state.commands = targetPayload.commands;
  renderTargets();
  renderCommands();

  appendTerminal("后端已连接，等待 SSH 会话...\n");
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

  $$(".command-item").forEach((button) => {
    button.addEventListener("click", () => runCommand(button.dataset.command));
  });

  $("#runAllBtn").addEventListener("click", async () => {
    await runCommand("runTestC");
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
    const result = await apiPost("/api/fpga/results/mark-complete");
    renderLatestResult(result);
    toast("已标记结果采集完成");
  });

  $("#refreshResultBtn").addEventListener("click", async () => {
    renderLatestResult(await apiGet("/api/fpga/results/latest"));
  });
}

async function runCommand(commandKey) {
  const session = await apiPost("/api/fpga/run/test-partition", { commandKey });
  setStatus(session);
  renderLatestResult(session.latestResult);
}

function bindEventSource() {
  const source = new EventSource("/events/terminal");

  source.addEventListener("terminal", (event) => {
    const payload = JSON.parse(event.data);
    appendTerminal(payload.text);
  });

  source.addEventListener("status", (event) => {
    setStatus(JSON.parse(event.data));
  });

  source.addEventListener("result", (event) => {
    renderLatestResult(JSON.parse(event.data));
  });

  source.onerror = () => {
    $("#backendStatus").textContent = "事件流重连中";
    $("#backendStatus").className = "status-pill idle";
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

init().catch((error) => {
  $("#backendStatus").textContent = "后端异常";
  $("#backendStatus").className = "status-pill offline";
  appendTerminal(`[frontend error] ${error.message}\n`);
});
