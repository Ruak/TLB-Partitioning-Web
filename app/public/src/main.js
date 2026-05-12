import { apiGet, apiPost } from "./api.js";

const state = {
  targets: [],
  terminalText: "",
  resultsByCommand: {},
  sshSession: null,
  unprotectedSession: null,
  latestResult: null
};

const views = {
  overview: "概览",
  connections: "连接",
  unprotected: "无防护 POC",
  protected: "有防护 SSH / 数据采集",
  compare: "性能结果对比"
};

const phaseLabels = {
  idle: "待机",
  starting: "启动中",
  communicating: "通信中",
  recovering: "密钥恢复中",
  "key-recovered": "密钥已恢复",
  eavesdropping: "Eve 已启用",
  "message-recovered": "窃听成功",
  "recover-failed": "恢复失败",
  "start-failed": "启动失败",
  stopped: "已停止"
};

const commandLabels = {
  runProtectionTest: "防护功能测试",
  runPerformanceTest: "完整性能测试",
  runPerfCoremark: "CoreMark 基准测试",
  runPerfProc: "进程上下文切换压力测试",
  runPerfThread: "线程上下文切换压力测试",
  runPerfConcurrent: "Hackbench 并发调度压力测试"
};

const reportCharts = {
  cacheLatency: {
    selector: "#cacheLatencyChart",
    unit: "Clock Cycles",
    categories: ["1st", "2nd", "3rd", "4th"],
    series: [
      { name: "Miss 无防护", color: "#e84b40", values: [105, 70, 60, 59] },
      { name: "Hit 无防护", color: "#ef9289", values: [12, 12, 0, 12] },
      { name: "Miss 有防护", color: "#31c976", values: [105, 70, 60, 59] },
      { name: "Hit 有防护", color: "#82d9a4", values: [12, 12, 0, 12] }
    ]
  },
  coremark: {
    selector: "#coremarkChart",
    unit: "Iterations/Sec",
    categories: ["无防护", "有防护"],
    series: [{ name: "CoreMark", color: "#2b78aa", values: [153, 153] }]
  },
  processSwitch: {
    selector: "#processSwitchChart",
    unit: "us/switch",
    categories: ["100", "1000", "100000"],
    series: [
      { name: "无防护", color: "#2b78aa", values: [846.59, 815.32, 826.93] },
      { name: "有防护", color: "#dd7416", values: [917.19, 907.41, 948.98] }
    ]
  },
  threadSwitch: {
    selector: "#threadSwitchChart",
    unit: "us/switch",
    categories: ["100", "1000", "200000"],
    series: [
      { name: "无防护", color: "#2b78aa", values: [985.34, 930.22, 898.43] },
      { name: "有防护", color: "#dd7416", values: [897.42, 993.16, 1016.36] }
    ]
  },
  hackbench: {
    selector: "#hackbenchChart",
    unit: "us/switch",
    categories: ["10", "100", "1000", "10000"],
    series: [
      { name: "无防护", color: "#2b78aa", values: [1454.6, 873.12, 825.73, 821.6] },
      { name: "有防护", color: "#dd7416", values: [1614.71, 915.28, 872.92, 862.25] }
    ]
  }
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

async function safeAction(action) {
  try {
    return await action();
  } catch (error) {
    toast(error.message);
    return null;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function stripAnsi(value) {
  return String(value ?? "")
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function setPill(node, className, text) {
  if (!node) return;
  node.className = `status-pill ${className}`;
  node.innerHTML = `<i></i> ${escapeHtml(text)}`;
}

function setBadge(node, className, text) {
  if (!node) return;
  node.className = `badge ${className}`;
  node.textContent = text;
}

function setView(view) {
  if (!views[view]) return;
  $$(".view").forEach((node) => node.classList.toggle("active", node.id === view));
  $$(".nav-item[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  $("#pageTitle").textContent = views[view];
  $("#modeEyebrow").textContent = "实验工作区";
  if (view === "compare") renderReportCharts();
}

function appendTerminal(text) {
  state.terminalText += stripAnsi(text);
  if (state.terminalText.length > 60000) {
    state.terminalText = state.terminalText.slice(-60000);
  }
  const node = $("#terminalOutput");
  node.textContent = state.terminalText || "等待远程终端输出...";
  node.scrollTop = node.scrollHeight;
}

function currentTarget() {
  return state.sshSession?.target || null;
}

function targetKindLabel(target) {
  if (!target) return "--";
  if (target.kind === "remote-wsl") return "远程 WSL";
  if (target.protection === "cache") return "远程 WSL";
  if (target.protection === "tlb") return "FPGA SSH";
  return target.kind || "SSH";
}

function protectionLabel(target) {
  if (!target) return "--";
  if (target.protection === "cache") return "Cache";
  if (target.protection === "tlb") return "TLB";
  return target.label || target.name;
}

function renderTargets() {
  $("#targetSelect").innerHTML = state.targets
    .map((target) => `<option value="${escapeHtml(target.name)}">${escapeHtml(target.label || target.name)}</option>`)
    .join("");
  renderConnectionCards();
  renderOverview();
}

function targetByProtection(protection) {
  return state.targets.find((target) => target.protection === protection);
}

function setMeta(prefix, target) {
  $(`#${prefix}Host`).textContent = target?.host || "--";
  $(`#${prefix}Port`).textContent = String(target?.port || "--");
  $(`#${prefix}User`).textContent = target?.username || "--";
  $(`#${prefix}Workdir`).textContent = target?.workingDirectory || "~";
}

function renderConnectionCards() {
  const active = currentTarget();
  const connected = Boolean(state.sshSession?.connected);
  const cache = targetByProtection("cache");
  const tlb = targetByProtection("tlb");

  setMeta("cache", cache);
  setMeta("tlb", tlb);

  const activeProtection = connected ? active?.protection : null;
  setBadge($("#cacheConnectionState"), activeProtection === "cache" ? "good" : "idle", activeProtection === "cache" ? "已连接" : "未连接");
  setBadge($("#tlbConnectionState"), activeProtection === "tlb" ? "good" : "idle", activeProtection === "tlb" ? "已连接" : "未连接");
  $("#cacheConnectionCard")?.classList.toggle("active-target", activeProtection === "cache");
  $("#tlbConnectionCard")?.classList.toggle("active-target", activeProtection === "tlb");
}

function setStatus(session = {}) {
  state.sshSession = session;
  const connected = Boolean(session.connected);
  const target = session.target;
  const label = connected ? `${protectionLabel(target)} 已连接` : `远程 ${session.status || "未连接"}`;
  setPill($("#sshStatus"), connected ? "online" : "offline", label);
  $("#sideStatus").textContent = connected ? protectionLabel(target) : "未连接";
  setBadge($("#sshBadge"), connected ? "good" : "muted", connected ? "已连接" : "未连接");
  renderConnectionCards();
  renderProtectedState();
  renderOverview();
}

function renderOverview() {
  const latest = state.latestResult;
  const connected = Boolean(state.sshSession?.connected);
  const target = currentTarget();

  $("#overviewBackend").textContent = $("#backendMini")?.textContent || "检查中";
  $("#overviewActiveTarget").textContent = connected ? `${protectionLabel(target)} / ${target?.host || "--"}` : "未连接";
  $("#overviewScript").textContent = state.unprotectedSession?.running
    ? (phaseLabels[state.unprotectedSession.phase] || state.unprotectedSession.phase || "运行中")
    : "待机";
  $("#overviewLastRun").textContent = latest?.status === "captured"
    ? `${protectionLabel(latest)} ${commandLabels[latest.commandKey] || latest.commandKey || ""}`.trim()
    : latest?.status === "running"
      ? "采集中"
      : "暂无";

  const cache = targetByProtection("cache");
  const tlb = targetByProtection("tlb");
  $("#overviewCacheTarget").textContent = cache ? `${cache.host || "--"} (${targetKindLabel(cache)})` : "远程 WSL";
  $("#overviewTlbTarget").textContent = tlb ? `${tlb.host || "--"} (${targetKindLabel(tlb)})` : "FPGA SSH";
}

function renderProtectedState() {
  const connected = Boolean(state.sshSession?.connected);
  const target = currentTarget();
  $("#protectedActiveTarget").textContent = connected ? `${target?.label || target?.name} / ${target?.host}` : "未连接";
  $("#protectedConnectionKind").textContent = connected ? targetKindLabel(target) : "--";
  $("#activeTargetNote").textContent = connected
    ? `当前会话连接到 ${target?.label || target?.name}，可手动输入命令或使用一键采集。`
    : "请先在连接页连接一个目标。";
  $("#terminalInput").disabled = !connected;
  $("#terminalForm button[type='submit']").disabled = !connected;
  $("#runProtectionBtn").disabled = !connected;
  $("#runPerformanceBtn").disabled = !connected;
  $("#markCompleteBtn").disabled = !connected || state.latestResult?.status !== "running";
}

function setTimelineDone(step, done) {
  const item = $(`#attackTimeline li[data-step="${step}"]`);
  if (item) item.classList.toggle("done", Boolean(done));
}

function setInputValue(selector, value) {
  const node = $(selector);
  if (!node || document.activeElement === node) return;
  if (value !== undefined && value !== null) node.value = value;
}

function renderUnprotectedStatus(session = {}) {
  state.unprotectedSession = session;
  const phase = session.phase || "idle";
  const phaseText = phaseLabels[phase] || phase;
  const running = Boolean(session.running);
  const active = running && phase !== "stopped";

  setInputValue("#unprotectedKey", session.key);
  setInputValue("#unprotectedCore", session.core);
  setInputValue("#mallorySamples", session.recovery?.samples);
  setInputValue("#malloryCacheSets", session.recovery?.cacheSets);
  setInputValue("#malloryLineShift", session.recovery?.lineShift);
  setInputValue("#malloryCacheLevel", session.recovery?.cacheLevel);
  setInputValue("#malloryStart", session.recovery?.start);
  setInputValue("#malloryCount", session.recovery?.count);
  $("#recoveredKey").textContent = session.recoveredKey || "--";
  $("#eveState").textContent = session.eveReady ? "已启用" : "未启用";
  $("#attackPhase").textContent = phaseText;
  $("#eavesdropPreview").textContent = session.lastEavesdrop?.text || session.lastCiphertext || "--";
  $("#scriptStateMini").textContent = running ? phaseText : "待机";
  $("#aliceMessageInput").disabled = !active;
  $("#aliceMessageForm button[type='submit']").disabled = !active;
  $("#recoverKeyBtn").disabled = !active;
  $("#demoRecoverKeyBtn").disabled = !active;
  $("#eavesdropBtn").disabled = !active;
  $("#stopUnprotectedBtn").disabled = !running;

  const statusClass = phase.endsWith("failed") ? "offline" : session.eveReady ? "done" : "idle";
  setPill($("#unprotectedStatus"), statusClass, `POC ${phaseText}`);

  const badge = $("#unprotectedPhaseBadge");
  badge.textContent = phaseText;
  badge.className = `badge ${phase.endsWith("failed") ? "bad" : session.recoveredKey ? "done" : "idle"}`;

  setTimelineDone("start", active);
  setTimelineDone("send", active && Boolean(session.lastMessage));
  setTimelineDone("recover", ["recovering", "key-recovered", "eavesdropping", "message-recovered"].includes(phase));
  setTimelineDone("key", Boolean(session.recoveredKey));
  setTimelineDone("eve", active && Boolean(session.eveReady));
  setTimelineDone("result", phase === "message-recovered");
  renderOverview();
}

function clearUnprotectedLogs() {
  $("#logAlice").textContent = "[idle] 等待发送消息";
  $("#logBob").textContent = "[idle] 等待 Bob 解密输出";
  $("#logObserver").textContent = "[idle] 等待 Prime+Probe 与窃听输出";
}

function appendLog(selector, text) {
  const node = $(selector);
  node.textContent = node.textContent.includes("[idle]") ? text : `${node.textContent}\n${text}`;
  node.scrollTop = node.scrollHeight;
}

function appendUnprotectedLog(entry) {
  if (!entry?.text) return;
  const text = `[${entry.role}] ${entry.text}`;
  if (entry.role === "alice") {
    appendLog("#logAlice", text);
  } else if (entry.role === "bob") {
    appendLog("#logBob", text);
  } else {
    appendLog("#logObserver", text);
  }
}

function renderUnprotectedLogs(logs = []) {
  clearUnprotectedLogs();
  logs.forEach(appendUnprotectedLog);
}

function getStatusMeta(status) {
  const statusMeta = {
    running: { label: "结果采集中", className: "idle" },
    captured: { label: "结果已采集", className: "done" },
    idle: { label: "结果待采集", className: "idle" }
  };
  return statusMeta[status || "idle"] || { label: status, className: "idle" };
}

function renderLatestResult(result) {
  state.latestResult = result || null;
  const status = result?.status || "idle";
  const meta = getStatusMeta(status);
  setPill($("#resultStatus"), meta.className, meta.label);
  $("#latestCommand").textContent = result?.command || "--";
  $("#latestStartedAt").textContent = result?.startedAt || "--";
  $("#latestEndedAt").textContent = result?.endedAt || "--";
  $("#latestOutput").textContent = result?.output ? stripAnsi(result.output) : "暂无输出";
  renderProtectedState();
  renderOverview();
}

function renderResultPayload(payload) {
  if (payload?.resultsByCommand) {
    state.resultsByCommand = payload.resultsByCommand;
    renderLatestResult(payload.latestResult);
    return;
  }
  const key = payload?.resultKey || payload?.commandKey;
  if (key) state.resultsByCommand[key] = payload;
  renderLatestResult(payload);
}

function bindEvents() {
  $$(".nav-item[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  $$("[data-jump]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.jump));
  });

  $("#connectBtn").addEventListener("click", () => safeAction(async () => {
    const session = await apiPost("/api/fpga/ssh/connect", { targetName: $("#targetSelect").value });
    setStatus(session);
    toast(session.connected ? "目标已连接" : "连接请求已发送");
  }));

  $("#disconnectBtn").addEventListener("click", () => safeAction(async () => {
    const session = await apiPost("/api/fpga/ssh/disconnect");
    setStatus(session);
    toast("当前连接已断开");
  }));

  $("#startUnprotectedBtn").addEventListener("click", () => safeAction(async () => {
    const session = await apiPost("/api/unprotected/start", {
      key: $("#unprotectedKey").value,
      core: $("#unprotectedCore").value,
      samples: $("#mallorySamples").value,
      cacheSets: $("#malloryCacheSets").value,
      lineShift: $("#malloryLineShift").value,
      cacheLevel: $("#malloryCacheLevel").value,
      start: $("#malloryStart").value,
      count: $("#malloryCount").value
    });
    renderUnprotectedStatus(session);
    renderUnprotectedLogs(session.logs);
    toast("无防护 POC 已启动");
  }));

  $("#recoverKeyBtn").addEventListener("click", () => safeAction(async () => {
    renderUnprotectedStatus(await apiPost("/api/unprotected/recover-key", {
      samples: $("#mallorySamples").value,
      cacheSets: $("#malloryCacheSets").value,
      lineShift: $("#malloryLineShift").value,
      cacheLevel: $("#malloryCacheLevel").value,
      start: $("#malloryStart").value,
      count: $("#malloryCount").value
    }));
    toast("Mallory 已开始恢复密钥");
  }));

  $("#demoRecoverKeyBtn").addEventListener("click", () => safeAction(async () => {
    renderUnprotectedStatus(await apiPost("/api/unprotected/demo-recover-key"));
    toast("已使用快速演示恢复密钥");
  }));

  $("#eavesdropBtn").addEventListener("click", () => safeAction(async () => {
    const session = await apiPost("/api/unprotected/eavesdrop");
    renderUnprotectedStatus(session);
    toast(session.lastEavesdrop?.readable ? "Eve 已窃听到明文" : "Eve 只能看到密文");
  }));

  $("#stopUnprotectedBtn").addEventListener("click", () => safeAction(async () => {
    renderUnprotectedStatus(await apiPost("/api/unprotected/stop"));
    toast("无防护 POC 已停止");
  }));

  $("#clearUnprotectedBtn").addEventListener("click", clearUnprotectedLogs);

  $("#aliceMessageForm").addEventListener("submit", (event) => {
    event.preventDefault();
    safeAction(async () => {
      const input = $("#aliceMessageInput");
      const session = await apiPost("/api/unprotected/send", { message: input.value });
      input.value = "";
      renderUnprotectedStatus(session);
      toast("Alice 消息已发送");
    });
  });

  $("#terminalForm").addEventListener("submit", (event) => {
    event.preventDefault();
    safeAction(async () => {
      const input = $("#terminalInput");
      const value = input.value;
      if (!value.trim()) return;
      await apiPost("/api/fpga/terminal/input", { data: `${value}\n` });
      input.value = "";
    });
  });

  $("#clearBtn").addEventListener("click", () => {
    state.terminalText = "";
    $("#terminalOutput").textContent = "终端已清空";
  });

  $("#copyBtn").addEventListener("click", () => safeAction(async () => {
    await navigator.clipboard.writeText($("#terminalOutput").textContent);
    toast("终端输出已复制");
  }));

  $("#runProtectionBtn").addEventListener("click", () => safeAction(async () => {
    const payload = await apiPost("/api/fpga/run/preset", { commandKey: "runProtectionTest" });
    setStatus(payload);
    renderResultPayload(payload);
    toast("已开始防护功能测试采集");
  }));

  $("#runPerformanceBtn").addEventListener("click", () => safeAction(async () => {
    const payload = await apiPost("/api/fpga/run/preset", { commandKey: "runPerformanceTest" });
    setStatus(payload);
    renderResultPayload(payload);
    toast("已开始完整性能测试采集");
  }));

  $("#markCompleteBtn").addEventListener("click", () => safeAction(async () => {
    const result = await apiPost("/api/fpga/results/mark-complete");
    renderResultPayload(result);
    toast("当前采集已结束");
  }));

  $("#refreshResultBtn").addEventListener("click", () => safeAction(async () => {
    renderResultPayload(await apiGet("/api/fpga/results"));
    toast("采集记录已刷新");
  }));
}

function bindEventSource() {
  const source = new EventSource("/events/terminal");
  source.addEventListener("terminal", (event) => {
    const payload = JSON.parse(event.data);
    appendTerminal(payload.text);
  });
  source.addEventListener("status", (event) => setStatus(JSON.parse(event.data)));
  source.addEventListener("result", (event) => renderResultPayload(JSON.parse(event.data)));
  source.addEventListener("unprotected-status", (event) => renderUnprotectedStatus(JSON.parse(event.data)));
  source.addEventListener("unprotected-log", (event) => appendUnprotectedLog(JSON.parse(event.data)));
  source.onerror = () => {
    setPill($("#backendStatus"), "idle", "事件流重连中");
    $("#backendMini").textContent = "重连中";
  };
}

function renderReportCharts() {
  Object.values(reportCharts).forEach(drawGroupedBarChart);
}

function drawGroupedBarChart(config) {
  const svg = $(config.selector);
  if (!svg) return;

  const ns = "http://www.w3.org/2000/svg";
  const viewBox = svg.getAttribute("viewBox").split(/\s+/).map(Number);
  const width = viewBox[2];
  const height = viewBox[3];
  const padding = { top: 26, right: 24, bottom: 58, left: 64 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const values = config.series.flatMap((item) => item.values);
  const maxValue = Math.max(...values) * 1.18;
  const categoryWidth = plotWidth / config.categories.length;
  const barGap = 5;
  const groupPadding = Math.max(16, categoryWidth * 0.16);
  const barWidth = Math.max(7, (categoryWidth - groupPadding * 2 - barGap * (config.series.length - 1)) / config.series.length);

  svg.replaceChildren();

  const add = (tag, attrs = {}, text = "") => {
    const node = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    if (text) node.textContent = text;
    svg.appendChild(node);
    return node;
  };

  add("rect", { x: 0, y: 0, width, height, rx: 8, fill: "#eef2ed" });

  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (plotHeight / 4) * i;
    const value = maxValue - (maxValue / 4) * i;
    add("line", { x1: padding.left, y1: y, x2: width - padding.right, y2: y, stroke: "#d3dbd0", "stroke-width": 1 });
    add("text", { x: padding.left - 10, y: y + 4, "text-anchor": "end", fill: "#657064", "font-size": 11 }, formatChartNumber(value));
  }

  add("line", { x1: padding.left, y1: height - padding.bottom, x2: width - padding.right, y2: height - padding.bottom, stroke: "#869283", "stroke-width": 1.2 });
  add("line", { x1: padding.left, y1: padding.top, x2: padding.left, y2: height - padding.bottom, stroke: "#869283", "stroke-width": 1.2 });
  add("text", { x: padding.left, y: 18, fill: "#657064", "font-size": 11, "font-weight": 700 }, config.unit);

  config.categories.forEach((category, categoryIndex) => {
    const groupX = padding.left + categoryIndex * categoryWidth;
    config.series.forEach((series, seriesIndex) => {
      const value = series.values[categoryIndex] || 0;
      const x = groupX + groupPadding + seriesIndex * (barWidth + barGap);
      const barHeight = maxValue ? (value / maxValue) * plotHeight : 0;
      const y = padding.top + plotHeight - barHeight;
      add("rect", { x, y, width: barWidth, height: barHeight, rx: 2, fill: series.color });
      add("text", { x: x + barWidth / 2, y: y - 5, "text-anchor": "middle", fill: "#20251f", "font-size": 10, "font-weight": 700 }, formatChartNumber(value));
    });
    add("text", {
      x: groupX + categoryWidth / 2,
      y: height - 24,
      "text-anchor": "middle",
      fill: "#20251f",
      "font-size": 12,
      "font-weight": 700
    }, category);
  });

  const legendColumns = config.series.length > 2 ? 2 : config.series.length;
  const legendItemWidth = config.series.length > 2 ? 138 : 82;
  const legendBoxWidth = legendColumns * legendItemWidth + 18;
  const legendBoxX = width - padding.right - legendBoxWidth - 10;
  const legendBoxY = config.series.length > 2 ? padding.top + 8 : padding.top - 8;

  config.series.forEach((series, index) => {
    const x = legendBoxX + 10 + (index % legendColumns) * legendItemWidth;
    const y = legendBoxY + Math.floor(index / legendColumns) * 18;
    add("rect", { x, y: y - 9, width: 10, height: 10, rx: 2, fill: series.color });
    add("text", { x: x + 16, y, fill: "#20251f", "font-size": 11, "font-weight": 700 }, series.name);
  });
}

function formatChartNumber(value) {
  if (!Number.isFinite(value)) return "--";
  if (Math.abs(value) >= 100) return value.toFixed(value % 1 === 0 ? 0 : 2);
  if (Math.abs(value) >= 10) return value.toFixed(value % 1 === 0 ? 0 : 2);
  return value.toFixed(0);
}

async function init() {
  bindEvents();
  bindEventSource();
  setView("overview");
  renderReportCharts();
  renderProtectedState();

  const health = await apiGet("/api/health");
  setPill($("#backendStatus"), "online", "后端在线");
  $("#backendMini").textContent = "在线";
  setStatus(health.session);
  renderResultPayload(health.session);
  renderUnprotectedStatus(health.unprotected);
  renderUnprotectedLogs(health.unprotected?.logs || []);

  const payload = await apiGet("/api/fpga/targets");
  state.targets = payload.targets;
  renderTargets();
  appendTerminal("后端已连接，等待远程会话...\n");
}

init().catch((error) => {
  setPill($("#backendStatus"), "offline", "后端异常");
  $("#backendMini").textContent = "异常";
  appendTerminal(`[frontend error] ${error.message}\n`);
});
