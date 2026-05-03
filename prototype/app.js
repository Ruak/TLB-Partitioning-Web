const state = {
  view: "overview",
  attackRunning: false,
  attackComplete: false,
  sshConnected: false,
  fpgaComplete: false,
  timers: [],
  records: [
    "[system] prototype loaded",
    "[config] userA/userB/attacker scripts pending",
    "[config] fpga target local-fpga-board pending",
  ],
};

const views = {
  overview: "概览",
  unprotected: "无防护模式",
  protected: "有防护模式",
  compare: "结果对比",
  records: "实验记录",
};

const attackLogs = {
  a: [
    "[00:00.102] user_a_script started",
    "[00:00.288] session_nonce = 0x8f31c2aa",
    "[00:00.514] auth token generated with masked key",
    "[00:01.020] send -> B: hello, verify session",
    "[00:02.418] warning: unexpected ACK sequence observed",
  ],
  b: [
    "[00:00.118] user_b_script started",
    "[00:00.639] receive <- A: hello, verify session",
    "[00:00.841] verify token: accepted",
    "[00:02.921] receive <- A: upgrade session privilege",
    "[00:03.104] forged packet accepted: true",
  ],
  attacker: [
    "[00:00.140] attacker_script started",
    "[00:00.702] sampling shared TLB/cache timing window",
    "[00:01.377] stable cluster detected: set=1 confidence=0.91",
    "[00:01.822] recovered key preview: 7f:42:9c:***:d1",
    "[00:02.700] forge identity=A message=\"upgrade session privilege\"",
    "[00:03.120] result: attack succeeded",
  ],
};

const terminalLines = {
  connect: [
    "bridge: opening SSH session to root@192.168.1.100:22",
    "fingerprint: SHA256:demo-local-fpga",
    "auth profile: fpga-key",
    "fpga@local-fpga-board:~$",
  ],
  build: [
    "fpga@local-fpga-board:~$ gcc test.c -o test",
    "compile: csr helpers linked",
    "compile: tlb_partitioning hooks enabled",
    "build complete: ./test",
  ],
  run: [
    "fpga@local-fpga-board:~$ ./test",
    "[partition] alloc sid=1 secure_set=1",
    "[victim] auth flow complete",
    "[observer] timing cluster unstable, no usable key material",
    "[forge] rejected by receiver",
    "[result] leak_observed=false forge_succeeded=false",
  ],
  collect: [
    "fpga@local-fpga-board:~$ cat result.log",
    "target=local-fpga-board",
    "test=test.c",
    "tlb_partitioning=enabled",
    "leak_observed=false",
    "forge_succeeded=false",
  ],
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function setView(view) {
  state.view = view;
  $$(".view").forEach((el) => el.classList.toggle("active", el.id === view));
  $$(".nav-item").forEach((el) => el.classList.toggle("active", el.dataset.view === view));
  $("#pageTitle").textContent = views[view];
  $("#modeEyebrow").textContent = view === "overview" ? "当前模式" : "实验工作区";
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  window.clearTimeout(node.dataset.timer);
  node.dataset.timer = window.setTimeout(() => node.classList.remove("show"), 1800);
}

function pushRecord(line) {
  state.records.push(line);
  $("#recordLog").textContent = state.records.join("\n");
}

function setStatus(node, className, text) {
  node.className = `status-pill ${className}`;
  node.innerHTML = `<i></i> ${text}`;
}

function markTimeline(step, resultClass = "done") {
  const item = $(`#attackTimeline li[data-step="${step}"]`);
  if (item) item.classList.add(resultClass);
}

function appendLog(target, line) {
  const el = $(target);
  el.textContent = el.textContent.includes("[idle]") ? line : `${el.textContent}\n${line}`;
  el.scrollTop = el.scrollHeight;
}

function clearTimers() {
  state.timers.forEach((timer) => window.clearTimeout(timer));
  state.timers = [];
}

function startAttack() {
  clearTimers();
  state.attackRunning = true;
  state.attackComplete = false;
  $("#logA").textContent = "";
  $("#logB").textContent = "";
  $("#logAttacker").textContent = "";
  $$("#attackTimeline li").forEach((li) => li.classList.remove("done", "fail"));
  $("#keyPreview").textContent = "--";
  $("#forgedIdentity").textContent = "--";
  $("#receiverAccepted").textContent = "运行中";
  $("#attackPhase").textContent = "运行中";
  $("#attackSummary").textContent = "观测中";
  $("#scriptStateMini").textContent = "运行中";
  setStatus($("#scriptStatus"), "idle", "本机脚本运行中");
  pushRecord("[no-partition] start local three-script experiment");

  const schedule = [
    [100, () => markTimeline("init")],
    [120, () => appendLog("#logA", attackLogs.a[0])],
    [180, () => appendLog("#logB", attackLogs.b[0])],
    [240, () => appendLog("#logAttacker", attackLogs.attacker[0])],
    [620, () => appendLog("#logA", attackLogs.a[1])],
    [820, () => appendLog("#logB", attackLogs.b[1])],
    [1000, () => markTimeline("observe")],
    [1120, () => appendLog("#logAttacker", attackLogs.attacker[1])],
    [1480, () => appendLog("#logA", attackLogs.a[2])],
    [1750, () => appendLog("#logAttacker", attackLogs.attacker[2])],
    [2150, () => markTimeline("recover")],
    [2220, () => appendLog("#logAttacker", attackLogs.attacker[3])],
    [2260, () => ($("#keyPreview").textContent = "7f:42:9c:***:d1")],
    [2700, () => appendLog("#logA", attackLogs.a[3])],
    [3050, () => appendLog("#logB", attackLogs.b[2])],
    [3300, () => toast("密钥摘要已标记为关键证据")],
  ];

  state.timers = schedule.map(([delay, fn]) => window.setTimeout(fn, delay));
}

function forgeAttack() {
  if (!state.attackRunning && !state.attackComplete) startAttack();
  const schedule = [
    [400, () => markTimeline("forge")],
    [500, () => appendLog("#logAttacker", attackLogs.attacker[4])],
    [700, () => ($("#forgedIdentity").textContent = "用户 A")],
    [900, () => markTimeline("inject")],
    [1050, () => appendLog("#logB", attackLogs.b[3])],
    [1220, () => appendLog("#logA", attackLogs.a[4])],
    [1380, () => appendLog("#logB", attackLogs.b[4])],
    [1540, () => appendLog("#logAttacker", attackLogs.attacker[5])],
    [1650, completeAttack],
  ];
  state.timers.push(...schedule.map(([delay, fn]) => window.setTimeout(fn, delay)));
}

function completeAttack() {
  state.attackRunning = false;
  state.attackComplete = true;
  markTimeline("result", "fail");
  $("#receiverAccepted").textContent = "已接受伪造消息";
  $("#attackPhase").textContent = "攻击成功";
  $("#attackSummary").textContent = "攻击成功";
  $("#attackEvidenceState").textContent = "keyRecovered=true, receiverAccepted=true";
  $("#scriptStateMini").textContent = "完成";
  setStatus($("#scriptStatus"), "done", "本机脚本完成");
  pushRecord("[no-partition] keyRecovered=true forgedIdentity=A receiverAccepted=true");
  toast("无防护结果已写入实验记录");
}

function stopAttack() {
  clearTimers();
  state.attackRunning = false;
  $("#attackPhase").textContent = "已停止";
  $("#scriptStateMini").textContent = "已停止";
  setStatus($("#scriptStatus"), "offline", "本机脚本已停止");
  pushRecord("[no-partition] stopped by operator");
}

function clearAttack() {
  clearTimers();
  state.attackRunning = false;
  state.attackComplete = false;
  $("#logA").textContent = "[idle] 等待启动 user_a_script";
  $("#logB").textContent = "[idle] 等待启动 user_b_script";
  $("#logAttacker").textContent = "[idle] 等待启动 attacker_script";
  $$("#attackTimeline li").forEach((li) => li.classList.remove("done", "fail"));
  $("#keyPreview").textContent = "--";
  $("#forgedIdentity").textContent = "--";
  $("#receiverAccepted").textContent = "等待";
  $("#attackPhase").textContent = "未开始";
  $("#attackSummary").textContent = "未启动";
  $("#scriptStateMini").textContent = "待机";
  setStatus($("#scriptStatus"), "idle", "本机脚本待机");
}

function appendTerminal(lines) {
  const terminal = $("#terminalOutput");
  const current = terminal.textContent.includes("等待连接...") ? "" : `${terminal.textContent}\n`;
  const next = Array.isArray(lines) ? lines.join("\n") : String(lines);
  terminal.textContent = normalizeTerminalText(`${current}${next}`);
  terminal.scrollTop = terminal.scrollHeight;
}

function normalizeTerminalText(text) {
  return String(text)
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function connectFpga() {
  state.sshConnected = true;
  $("#sshBadge").textContent = "已连接";
  $("#fpgaStateMini").textContent = "已连接";
  setStatus($("#sshStatus"), "online", "SSH 已连接");
  appendTerminal(terminalLines.connect);
  pushRecord("[fpga] ssh connected target=local-fpga-board authProfile=fpga-key");
  toast("FPGA SSH 会话已建立");
}

function disconnectFpga() {
  state.sshConnected = false;
  $("#sshBadge").textContent = "未连接";
  $("#fpgaStateMini").textContent = "未连接";
  setStatus($("#sshStatus"), "offline", "SSH 未连接");
  appendTerminal(["bridge: ssh session closed"]);
  pushRecord("[fpga] ssh disconnected");
}

function ensureFpgaConnected() {
  if (!state.sshConnected) {
    connectFpga();
  }
}

function buildTest() {
  ensureFpgaConnected();
  appendTerminal(terminalLines.build);
  pushRecord("[fpga] build test.c success");
}

function runTest() {
  ensureFpgaConnected();
  appendTerminal(terminalLines.run);
  state.fpgaComplete = true;
  $("#guardSummary").textContent = "防护生效";
  $("#fpgaEvidenceState").textContent = "test.c 输出已通过终端采集";
  pushRecord("[fpga] test.c completed; see terminal output");
  toast("FPGA 防护结果已更新");
}

function collectResult() {
  ensureFpgaConnected();
  appendTerminal(terminalLines.collect);
  pushRecord("[fpga] collect result.log");
}

function rerunFpga() {
  buildTest();
  window.setTimeout(runTest, 350);
  window.setTimeout(collectResult, 700);
}

function exportRecords() {
  const payload = {
    experimentRun: {
      id: $("#runId").textContent,
      mode: "prototype",
      status: state.attackComplete && state.fpgaComplete ? "success" : "running",
    },
    attackEvidence: {
      keyRecovered: state.attackComplete,
      keyPreview: $("#keyPreview").textContent,
      forgedIdentity: $("#forgedIdentity").textContent,
      receiverAccepted: state.attackComplete,
    },
    fpgaEvidence: {
      targetName: "local-fpga-board",
      sshConnected: state.sshConnected,
      testCommand: "gcc test.c -o test && ./test",
      outputSource: "terminal",
      resultCaptured: state.fpgaComplete,
    },
    records: state.records,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "tlb-partitioning-demo-record.json";
  link.click();
  URL.revokeObjectURL(url);
  toast("JSON 记录已导出");
}

function resetDemo() {
  clearAttack();
  state.sshConnected = false;
  state.fpgaComplete = false;
  state.records = [
    "[system] prototype reset",
    "[config] userA/userB/attacker scripts pending",
    "[config] fpga target local-fpga-board pending",
  ];
  $("#terminalOutput").textContent = "fpga@bridge:~$ 等待连接...";
  $("#recordLog").textContent = state.records.join("\n");
  $("#sshBadge").textContent = "未连接";
  $("#fpgaStateMini").textContent = "未连接";
  $("#guardSummary").textContent = "待验证";
  $("#attackEvidenceState").textContent = "等待无防护实验";
  $("#fpgaEvidenceState").textContent = "等待 FPGA 实验";
  setStatus($("#sshStatus"), "offline", "SSH 未连接");
  toast("演示状态已重置");
}

function bindEvents() {
  $$(".nav-item, .link-btn").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  $("#startAttackBtn").addEventListener("click", startAttack);
  $("#forgeBtn").addEventListener("click", forgeAttack);
  $("#stopAttackBtn").addEventListener("click", stopAttack);
  $("#clearAttackBtn").addEventListener("click", clearAttack);

  $("#connectBtn").addEventListener("click", connectFpga);
  $("#disconnectBtn").addEventListener("click", disconnectFpga);
  $("#buildTestBtn").addEventListener("click", buildTest);
  $("#runTestBtn").addEventListener("click", runTest);
  $("#collectBtn").addEventListener("click", collectResult);
  $("#rerunBtn").addEventListener("click", rerunFpga);

  $("#clearTerminalBtn").addEventListener("click", () => {
    $("#terminalOutput").textContent = "fpga@bridge:~$";
  });
  $("#copyTerminalBtn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("#terminalOutput").textContent);
      toast("终端输出已复制");
    } catch {
      toast("浏览器限制了剪贴板访问");
    }
  });

  $("#exportRecordsBtn").addEventListener("click", exportRecords);
  $("#exportCompareBtn").addEventListener("click", exportRecords);
  $("#resetDemoBtn").addEventListener("click", resetDemo);
}

bindEvents();
setView("overview");
