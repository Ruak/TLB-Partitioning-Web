import { apiGet, apiPost } from "./api.js";

const state = {
  targets: [],
  commands: {},
  terminalText: ""
};

const views = {
  protected: "有防护模式",
  records: "实验记录"
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

function setPill(node, className, text) {
  node.className = `status-pill ${className}`;
  node.innerHTML = `<i></i> ${text}`;
}

function setView(view) {
  if (!views[view]) return;
  $$(".view").forEach((node) => node.classList.toggle("active", node.id === view));
  $$(".nav-item[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  $("#pageTitle").textContent = views[view];
  $("#modeEyebrow").textContent = "实验工作区";
}

function appendTerminal(text) {
  state.terminalText += stripAnsi(text);
  if (state.terminalText.length > 60000) {
    state.terminalText = state.terminalText.slice(-60000);
  }
  const node = $("#terminalOutput");
  node.textContent = state.terminalText || "fpga@bridge:~$ 等待终端输出...";
  node.scrollTop = node.scrollHeight;
}

function setStatus(session) {
  const connected = session.connected;
  setPill($("#sshStatus"), connected ? "online" : "offline", connected ? "SSH 已连接" : `SSH ${session.status || "未连接"}`);
  $("#sideStatus").textContent = connected ? "已连接" : "未连接";
  $("#sshBadge").textContent = connected ? "已连接" : "未连接";
  $("#sshBadge").className = `badge ${connected ? "good" : "muted"}`;
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
  $("#targetHost").value = target.host || "--";
  $("#targetPort").value = String(target.port || 22);
  $("#targetUser").value = target.username || "--";
  $("#targetWorkdir").value = target.workingDirectory || "~";
}

function renderCommands() {
  $("#cmdRun").textContent = state.commands.runTestWith || "--";
  $("#cmdList").textContent = state.commands.listHome || "--";
  $("#cmdCheck").textContent = state.commands.checkBinary || "--";
}

function renderLatestResult(result) {
  const status = result?.status || "idle";
  const statusMeta = {
    running: { label: "结果采集中", recordLabel: "采集中", className: "idle" },
    captured: { label: "结果已采集", recordLabel: "已采集", className: "done" },
    idle: { label: "结果待采集", recordLabel: "待采集", className: "idle" }
  };
  const meta = statusMeta[status] || { label: status, recordLabel: status, className: "idle" };

  $("#latestCommand").textContent = result?.command || "--";
  $("#latestStatus").textContent = meta.recordLabel;
  $("#latestStartedAt").textContent = result?.startedAt || "--";
  $("#latestEndedAt").textContent = result?.endedAt || "--";
  const latestOutput = $("#latestOutput");
  latestOutput.textContent = result?.output ? stripAnsi(result.output) : "暂无输出";
  latestOutput.scrollTop = latestOutput.scrollHeight;
  setPill($("#resultStatus"), meta.className, meta.label);
}

function bindEvents() {
  $$(".nav-item[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      setView(button.dataset.view);
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

  $$(".command-item[data-command]").forEach((button) => {
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
    $("#terminalOutput").textContent = "fpga@bridge:~$";
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
    toast(result?.status === "captured" ? "结果已标记为已采集" : "当前没有正在采集的结果");
  });

  $("#refreshResultBtn").addEventListener("click", async () => {
    renderLatestResult(await apiGet("/api/fpga/results/latest"));
    toast("实验记录已刷新");
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
    setPill($("#backendStatus"), "idle", "事件流重连中");
    $("#backendMini").textContent = "重连中";
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
  setView("protected");

  const health = await apiGet("/api/health");
  setPill($("#backendStatus"), "online", "后端桥接层");
  $("#backendMini").textContent = "在线";
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
  setPill($("#backendStatus"), "offline", "后端异常");
  $("#backendMini").textContent = "异常";
  appendTerminal(`[frontend error] ${error.message}\n`);
});
