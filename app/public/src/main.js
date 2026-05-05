import { apiGet, apiPost } from "./api.js";

const state = {
  targets: [],
  commands: {},
  terminalText: "",
  resultsByCommand: {},
  unprotectedLogs: [],
  sshSession: null,
  unprotectedSession: null,
  latestResult: null
};

const views = {
  overview: "概览",
  unprotected: "无防护模式",
  protected: "有防护模式",
  compare: "结果对比",
  records: "实验记录"
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

const perfTests = [
  {
    key: "runPerfCoremark",
    name: "有防护基础性能测试",
    color: "#18766f"
  },
  {
    key: "runPerfProc",
    name: "有防护进程压力测试",
    color: "#6750a4"
  },
  {
    key: "runPerfThread",
    name: "有防护线程压力测试",
    color: "#a86600"
  },
  {
    key: "runPerfConcurrent",
    name: "有防护并发压力测试",
    color: "#b33431"
  }
];

const collectionTypes = [
  { key: "runProtectionTest", name: "防护功能测试" },
  ...perfTests
];

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
  state.sshSession = session;
  const connected = session.connected;
  setPill($("#sshStatus"), connected ? "online" : "offline", connected ? "SSH 已连接" : `SSH ${session.status || "未连接"}`);
  $("#sideStatus").textContent = connected ? "已连接" : "未连接";
  $("#sshBadge").textContent = connected ? "已连接" : "未连接";
  $("#sshBadge").className = `badge ${connected ? "good" : "muted"}`;
  renderCollectionState();
  renderOverview();
}

function renderTargets() {
  $("#targetSelect").innerHTML = state.targets
    .map((target) => {
      const label = target.label || target.name;
      return `<option value="${escapeHtml(target.name)}">${escapeHtml(label)}</option>`;
    })
    .join("");
  renderTargetMeta();
  renderOverview();
}

function renderTargetMeta() {
  const target = state.targets.find((item) => item.name === $("#targetSelect").value) || state.targets[0];
  if (!target) return;
  const protectionLabel = target.protection === "cache" ? "Cache 防护" : target.protection === "tlb" ? "TLB 防护" : target.protection || "--";
  $("#targetProtection").value = protectionLabel;
  $("#targetHost").value = target.host || "--";
  $("#targetPort").value = String(target.port || 22);
  $("#targetUser").value = target.username || "--";
  $("#targetWorkdir").value = target.workingDirectory || "~";
}

function renderCommands() {
  renderOverview();
}

function setTimelineDone(step, done) {
  const item = $(`#attackTimeline li[data-step="${step}"]`);
  if (item) item.classList.toggle("done", Boolean(done));
}

function setInputValue(selector, value) {
  const node = $(selector);
  if (document.activeElement === node) return;
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
  setPill($("#unprotectedStatus"), statusClass, `本机脚本${phaseText}`);

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
  state.unprotectedLogs = [];
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
  state.unprotectedLogs.push(entry);
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
    running: { label: "结果采集中", recordLabel: "采集中", className: "idle" },
    captured: { label: "结果已采集", recordLabel: "已采集", className: "done" },
    idle: { label: "结果待采集", recordLabel: "待采集", className: "idle" }
  };
  return statusMeta[status || "idle"] || { label: status, recordLabel: status, className: "idle" };
}

function renderResultCard(prefix, result) {
  const status = result?.status || "idle";
  const meta = getStatusMeta(status);
  const statusNode = $(`#${prefix}Status`);
  statusNode.textContent = meta.recordLabel;
  statusNode.className = `badge ${meta.className}`;
  $(`#${prefix}Command`).textContent = result?.command || "--";
  $(`#${prefix}StartedAt`).textContent = result?.startedAt || "--";
  $(`#${prefix}EndedAt`).textContent = result?.endedAt || "--";
  const outputNode = $(`#${prefix}Output`);
  outputNode.textContent = result?.output ? stripAnsi(result.output) : "暂无输出";
  outputNode.scrollTop = outputNode.scrollHeight;
}

function renderResultsByCommand(resultsByCommand = state.resultsByCommand) {
  state.resultsByCommand = resultsByCommand || {};
  renderResultCard("cacheProtection", getStoredResult("cache", "runProtectionTest") || getStoredResult("cache", "runTestWith"));
  renderResultCard("cachePerformance", combinePerformanceResult("cache"));
  renderResultCard("tlbProtection", getStoredResult("tlb", "runProtectionTest") || getStoredResult("tlb", "runTestWith"));
  renderResultCard("tlbPerformance", combinePerformanceResult("tlb"));
  renderCompareCharts();
}

function renderLatestResult(result) {
  const status = result?.status || "idle";
  const meta = getStatusMeta(status);

  state.latestResult = result || null;
  setPill($("#resultStatus"), meta.className, meta.label);
  renderCollectionState();
  renderOverview();
}

function renderResultPayload(payload) {
  if (payload?.resultsByCommand) {
    renderResultsByCommand(payload.resultsByCommand);
    renderLatestResult(payload.latestResult);
    return;
  }
  const key = payload?.resultKey || payload?.commandKey;
  if (key) {
    state.resultsByCommand[key] = payload;
    renderResultsByCommand();
  }
  renderLatestResult(payload);
}

function currentCollectionRunning() {
  return state.latestResult?.status === "running";
}

function selectedCollectionType() {
  const key = $("#collectionTypeSelect")?.value || "runProtectionTest";
  return collectionTypes.find((item) => item.key === key) || collectionTypes[0];
}

function renderCollectionState() {
  const button = $("#collectToggleBtn");
  const select = $("#collectionTypeSelect");
  if (!button || !select) return;
  const running = currentCollectionRunning();
  button.textContent = running ? "结束采集" : "开始采集";
  button.className = `btn ${running ? "danger-soft" : "primary"}`;
  button.disabled = !state.sshSession?.connected;
  select.disabled = running;
}

function getStoredResult(protection, commandKey) {
  const key = `${protection}:${commandKey}`;
  return state.resultsByCommand[key] || null;
}

function combinePerformanceResult(protection) {
  const results = perfTests.map((test) => ({ test, result: getStoredResult(protection, test.key) }));
  const captured = results.filter(({ result }) => result?.output);
  if (!captured.length) return null;
  const latest = captured.at(-1).result;
  return {
    status: captured.some(({ result }) => result.status === "running") ? "running" : "captured",
    command: captured.map(({ test }) => test.name).join(" / "),
    startedAt: captured[0].result.startedAt,
    endedAt: latest.endedAt,
    output: captured
      .map(({ test, result }) => `===== ${test.name} =====\n${stripAnsi(result.output).trim()}`)
      .join("\n\n")
  };
}

function renderOverview() {
  const backendNode = $("#overviewBackend");
  if (!backendNode) return;

  backendNode.textContent = $("#backendMini")?.textContent || "检查中";
  $("#overviewScript").textContent = state.unprotectedSession?.running
    ? (phaseLabels[state.unprotectedSession.phase] || state.unprotectedSession.phase || "运行中")
    : "待机";
  $("#overviewFpga").textContent = state.sshSession?.connected
    ? (state.sshSession.target?.label || state.sshSession.target?.name || "已连接")
    : "未连接";
  const latest = state.latestResult;
  $("#overviewLastRun").textContent = latest?.status === "captured"
    ? `${latest.protection?.toUpperCase?.() || "FPGA"} ${latest.commandKey || ""}`.trim()
    : latest?.status === "running"
      ? "采集中"
      : "暂无";

  const cache = state.targets.find((item) => item.protection === "cache");
  const tlb = state.targets.find((item) => item.protection === "tlb");
  $("#overviewCacheTarget").textContent = cache?.host || "192.168.1.100";
  $("#overviewTlbTarget").textContent = tlb?.host || "192.168.1.50";
  $("#overviewPerfCommand").textContent = "./coremark.exe / ctxswitch_* / hackbench_like";
}

function selectedProtection() {
  const selected = state.targets.find((item) => item.name === $("#targetSelect")?.value);
  return selected?.protection || state.sshSession?.target?.protection || "cache";
}

function parseCoremark(output = "") {
  const match = stripAnsi(output).match(/Iterations\/Sec\s*:\s*([0-9.]+)/i);
  const value = match ? Number(match[1]) : NaN;
  return Number.isFinite(value) ? [{ x: 1, y: value, label: "CoreMark" }] : [];
}

function parseSwitchMetric(output = "", type = "iterations") {
  const points = [];
  const linePattern = /(?:ctxswitch_(?:proc|thread)|hackbench_like)[^\n]*?(?:iterations|loops)=([0-9]+)[^\n]*?per_switch=([0-9.]+)\s*ns/gi;
  let match = linePattern.exec(stripAnsi(output));
  while (match) {
    const input = Number(match[1]);
    const perSwitchNs = Number(match[2]);
    if (Number.isFinite(input) && Number.isFinite(perSwitchNs) && perSwitchNs > 0) {
      points.push({
        x: points.length + 1,
        y: 1_000_000_000 / perSwitchNs,
        label: type === "loops" ? `l=${input}` : `n=${input}`,
        raw: perSwitchNs
      });
    }
    match = linePattern.exec(stripAnsi(output));
  }
  return points;
}

function buildPerformanceSeries(protection = selectedProtection()) {
  return perfTests.map((test) => {
    const output = getStoredResult(protection, test.key)?.output || "";
    if (test.key === "runPerfCoremark") {
      const points = parseCoremark(output);
      return {
        ...test,
        scorePoints: points,
        throughputPoints: points.map((point) => ({ ...point, label: "CoreMark" }))
      };
    }
    const points = parseSwitchMetric(output, test.key === "runPerfConcurrent" ? "loops" : "iterations");
    return { ...test, scorePoints: [], throughputPoints: points };
  });
}

function renderCompareCharts() {
  const series = buildPerformanceSeries();
  const scoreSeries = series.map((item) => ({ name: item.name, color: item.color, points: item.scorePoints }));
  const throughputSeries = series.map((item) => ({ name: item.name, color: item.color, points: item.throughputPoints }));
  const scoreCount = scoreSeries.reduce((sum, item) => sum + item.points.length, 0);
  const throughputCount = throughputSeries.reduce((sum, item) => sum + item.points.length, 0);

  drawLineChart("#scoreChart", scoreSeries, "等待运行 ./coremark.exe 后绘制", "输入规模");
  drawLineChart("#throughputChart", throughputSeries, "等待运行压力测试后绘制", "输入规模");
  $("#scorePointCount").textContent = scoreCount ? `${scoreCount} 个采样点` : "暂无数据";
  $("#throughputPointCount").textContent = throughputCount ? `${throughputCount} 个采样点` : "暂无数据";
  $("#cacheScoreLatest").textContent = formatLatest(series[0].scorePoints);
  $("#cacheThroughputLatest").textContent = formatLatest(series[1].throughputPoints);
  $("#tlbScoreLatest").textContent = formatLatest(series[2].throughputPoints);
  $("#tlbThroughputLatest").textContent = formatLatest(series[3].throughputPoints);
}

function formatLatest(points) {
  const value = points.at(-1)?.y;
  if (!Number.isFinite(value)) return "--";
  if (value >= 1000) return value.toFixed(0);
  return value.toFixed(2);
}

function drawLineChart(selector, series, emptyText = "暂无可绘制数据", xAxisLabel = "采集顺序") {
  const svg = $(selector);
  if (!svg) return;
  const ns = "http://www.w3.org/2000/svg";
  const width = 640;
  const height = 260;
  const padding = { top: 22, right: 28, bottom: 42, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const allPoints = series.flatMap((item) => item.points || []);

  svg.replaceChildren();

  const add = (tag, attrs = {}, text = "") => {
    const node = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    if (text) node.textContent = text;
    svg.appendChild(node);
    return node;
  };

  add("rect", { x: 0, y: 0, width, height, rx: 8, fill: "#f9faf7" });

  if (!allPoints.length) {
    add("text", { x: width / 2, y: height / 2, "text-anchor": "middle", fill: "#6a7168", "font-size": 14 }, emptyText);
    series.forEach((item, index) => drawLegendItem(add, item, index, padding.left));
    return;
  }

  const maxX = Math.max(1, ...allPoints.map((point) => point.x));
  let minY = Math.min(...allPoints.map((point) => point.y));
  let maxY = Math.max(...allPoints.map((point) => point.y));
  if (minY === maxY) {
    minY -= Math.max(1, Math.abs(minY) * 0.1);
    maxY += Math.max(1, Math.abs(maxY) * 0.1);
  } else {
    const pad = (maxY - minY) * 0.12;
    minY -= pad;
    maxY += pad;
  }

  const xScale = (x) => padding.left + ((x - 1) / Math.max(1, maxX - 1)) * plotWidth;
  const yScale = (y) => padding.top + (1 - (y - minY) / (maxY - minY)) * plotHeight;

  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (plotHeight / 4) * i;
    const value = maxY - ((maxY - minY) / 4) * i;
    add("line", { x1: padding.left, y1: y, x2: width - padding.right, y2: y, stroke: "#d9ded4", "stroke-width": 1 });
    add("text", { x: padding.left - 10, y: y + 4, "text-anchor": "end", fill: "#6a7168", "font-size": 11 }, formatAxis(value));
  }

  add("line", { x1: padding.left, y1: height - padding.bottom, x2: width - padding.right, y2: height - padding.bottom, stroke: "#9aa395", "stroke-width": 1.4 });
  add("line", { x1: padding.left, y1: padding.top, x2: padding.left, y2: height - padding.bottom, stroke: "#9aa395", "stroke-width": 1.4 });
  add("text", { x: width - padding.right, y: height - 12, "text-anchor": "end", fill: "#6a7168", "font-size": 11 }, xAxisLabel);

  series.forEach((item, index) => {
    const points = item.points || [];
    if (points.length) {
      const path = points.map((point) => `${xScale(point.x).toFixed(1)},${yScale(point.y).toFixed(1)}`).join(" ");
      add("polyline", { points: path, fill: "none", stroke: item.color, "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round" });
      points.forEach((point) => {
        add("circle", { cx: xScale(point.x), cy: yScale(point.y), r: 4, fill: "#ffffff", stroke: item.color, "stroke-width": 2 });
        if (point.label) {
          add("text", { x: xScale(point.x), y: height - 25, "text-anchor": "middle", fill: "#6a7168", "font-size": 10 }, point.label);
        }
      });
    }
    drawLegendItem(add, item, index, padding.left);
  });
}

function drawLegendItem(add, item, index, startX) {
  const legendX = startX + (index % 2) * 238;
  const legendY = 18 + Math.floor(index / 2) * 18;
  add("circle", { cx: legendX, cy: legendY, r: 5, fill: item.color });
  add("text", { x: legendX + 10, y: legendY + 4, fill: "#232722", "font-size": 12, "font-weight": 700 }, item.name);
}

function formatAxis(value) {
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function bindEvents() {
  $$(".nav-item[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      setView(button.dataset.view);
    });
  });

  $("#targetSelect").addEventListener("change", () => {
    renderTargetMeta();
    renderOverview();
  });

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
    toast("无防护实验已启动");
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
    toast("已使用快速演示恢复启动 Eve");
  }));

  $("#eavesdropBtn").addEventListener("click", () => safeAction(async () => {
    const session = await apiPost("/api/unprotected/eavesdrop");
    renderUnprotectedStatus(session);
    toast(session.lastEavesdrop?.readable ? "Eve 已窃听到明文" : "Eve 只能看到密文");
  }));

  $("#stopUnprotectedBtn").addEventListener("click", () => safeAction(async () => {
    renderUnprotectedStatus(await apiPost("/api/unprotected/stop"));
    toast("无防护实验已停止");
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

  $("#collectToggleBtn").addEventListener("click", () => safeAction(async () => {
    if (currentCollectionRunning()) {
      const result = await apiPost("/api/fpga/results/mark-complete");
      const key = result?.resultKey || result?.commandKey;
      if (key) {
        state.resultsByCommand[key] = result;
        renderResultsByCommand();
      }
      renderLatestResult(result);
      toast(result?.status === "captured" ? "采集已结束" : "当前没有正在采集的结果");
      return;
    }

    const type = selectedCollectionType();
    const session = await apiPost("/api/fpga/results/start-collection", {
      commandKey: type.key,
      label: type.name
    });
    setStatus(session);
    renderResultPayload(session);
    toast(`开始采集：${type.name}`);
  }));

  $("#refreshCompareBtn").addEventListener("click", async () => {
    renderResultPayload(await apiGet("/api/fpga/results"));
    toast("性能曲线已刷新");
  });

  $("#refreshResultBtn").addEventListener("click", async () => {
    renderResultPayload(await apiGet("/api/fpga/results"));
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
  source.addEventListener("result", (event) => renderResultPayload(JSON.parse(event.data)));
  source.addEventListener("unprotected-status", (event) => renderUnprotectedStatus(JSON.parse(event.data)));
  source.addEventListener("unprotected-log", (event) => appendUnprotectedLog(JSON.parse(event.data)));
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
  setView("overview");

  const health = await apiGet("/api/health");
  setPill($("#backendStatus"), "online", "后端桥接层");
  $("#backendMini").textContent = "在线";
  setStatus(health.session);
  renderResultPayload(health.session);
  renderUnprotectedStatus(health.unprotected);
  renderUnprotectedLogs(health.unprotected?.logs || []);

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
