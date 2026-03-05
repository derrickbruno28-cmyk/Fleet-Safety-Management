const STORAGE_KEY = "fleet_safety_module_v1";
const SAMSARA_TOKEN_KEY = "fleet_safety_samsara_token";

const initialState = {
  drivers: [],
  weeklyTasks: [
    { id: crypto.randomUUID(), name: "Send Weekly Safety Video", owner: "Safety", completed: false, lastCompletedAt: null },
    { id: crypto.randomUUID(), name: "Review Bottom 10 Safety Scores", owner: "Safety", completed: false, lastCompletedAt: null },
    { id: crypto.randomUUID(), name: "Call High-Risk Drivers", owner: "Safety", completed: false, lastCompletedAt: null }
  ],
  discipline: [],
  disciplineHistory: [],
  checkCalls: [],
  checkCallOps: {
    importedAt: null,
    weeklyBatches: []
  },
  callActivity: [],
  kwenTracker: [],
  compliance: {
    importedAt: null,
    executiveMetrics: [],
    cases: [],
    repeatOffenders: []
  },
  empathy: {
    active: [],
    history: []
  },
  addendum: {
    importedAt: null,
    paragraphs: [],
    acknowledgments: []
  },
  safetyVideos: {
    importedAt: null,
    pending: [],
    courseAudit: [],
    followUps: []
  }
};

const levelLabels = {
  1: "Level 1 - Verbal Warning",
  2: "Level 2 - Written Warning",
  3: "Level 3 - Suspension"
};

let state = loadState();
const safetyVideosView = {
  team: "all",
  minPending: 0,
  hideCompleted: false
};
let selectedWeeklyBatchIndex = 0;
runWeeklyResetIfNeeded();
renderAll();
bindUI();
loadSavedSettings();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(initialState);
  try {
    const parsed = JSON.parse(raw);
    const merged = { ...structuredClone(initialState), ...parsed };
    merged.compliance = {
      ...structuredClone(initialState).compliance,
      ...(parsed.compliance || {})
    };
    merged.empathy = {
      ...structuredClone(initialState).empathy,
      ...(parsed.empathy || {})
    };
    merged.addendum = {
      ...structuredClone(initialState).addendum,
      ...(parsed.addendum || {})
    };
    merged.safetyVideos = {
      ...structuredClone(initialState).safetyVideos,
      ...(parsed.safetyVideos || {})
    };
    merged.checkCallOps = {
      ...structuredClone(initialState).checkCallOps,
      ...(parsed.checkCallOps || {})
    };
    if (!Array.isArray(merged.disciplineHistory)) merged.disciplineHistory = [];
    if (!Array.isArray(merged.safetyVideos.pending)) merged.safetyVideos.pending = [];
    if (!Array.isArray(merged.safetyVideos.courseAudit)) merged.safetyVideos.courseAudit = [];
    if (!Array.isArray(merged.safetyVideos.followUps)) merged.safetyVideos.followUps = [];
    if (!Array.isArray(merged.checkCallOps.weeklyBatches)) merged.checkCallOps.weeklyBatches = [];
    if (!Array.isArray(merged.callActivity)) merged.callActivity = [];
    if (!Array.isArray(merged.compliance.executiveMetrics)) merged.compliance.executiveMetrics = [];
    if (!Array.isArray(merged.compliance.cases)) merged.compliance.cases = [];
    if (!Array.isArray(merged.compliance.repeatOffenders)) merged.compliance.repeatOffenders = [];
    if (!Array.isArray(merged.empathy.active)) merged.empathy.active = [];
    if (!Array.isArray(merged.empathy.history)) merged.empathy.history = [];
    if (!Array.isArray(merged.addendum.paragraphs)) merged.addendum.paragraphs = [];
    if (!Array.isArray(merged.addendum.acknowledgments)) merged.addendum.acknowledgments = [];
    return merged;
  } catch {
    return structuredClone(initialState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function bindUI() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  document.getElementById("seedDataBtn").addEventListener("click", seedData);
  document.getElementById("addWeeklyTaskBtn").addEventListener("click", showAddTaskDialog);
  document.getElementById("addDisciplineBtn").addEventListener("click", showDisciplineDialog);
  document.getElementById("archiveCompletedDisciplineBtn").addEventListener("click", archiveCompletedDiscipline);
  document.getElementById("logCheckCallBtn").addEventListener("click", showCheckCallDialog);
  document.getElementById("logCheckCallActivityBtn").addEventListener("click", showCheckCallActivityDialog);
  document.getElementById("addSafetyPendingBtn").addEventListener("click", showAddSafetyPendingDialog);
  document.getElementById("addComplianceCaseBtn").addEventListener("click", showAddComplianceCaseDialog);
  document.getElementById("addEmpathyReportBtn").addEventListener("click", showAddEmpathyDialog);
  document.getElementById("archiveResolvedEmpathyBtn").addEventListener("click", archiveResolvedEmpathyReports);
  document.getElementById("addAddendumAckBtn").addEventListener("click", showAddAddendumAckDialog);
  document.getElementById("saveSamsaraTokenBtn").addEventListener("click", saveSamsaraToken);
  document.getElementById("syncSamsaraBtn").addEventListener("click", syncSamsaraDrivers);
  document.getElementById("importCsvBtn").addEventListener("click", () => document.getElementById("csvInput").click());
  document.getElementById("importCheckCallWorkbookBtn").addEventListener("click", () => document.getElementById("checkCallWorkbookInput").click());
  document.getElementById("importSafetyVideosBtn").addEventListener("click", () => document.getElementById("safetyVideosInput").click());
  document.getElementById("importComplianceBtn").addEventListener("click", () => document.getElementById("complianceInput").click());
  document.getElementById("importAddendumBtn").addEventListener("click", () => document.getElementById("addendumInput").click());
  document.getElementById("dedupeDriversBtn").addEventListener("click", dedupeDriverData);
  document.getElementById("csvInput").addEventListener("change", importCsvFile);
  document.getElementById("checkCallWorkbookInput").addEventListener("change", importCheckCallWorkbook);
  document.getElementById("safetyVideosInput").addEventListener("change", importSafetyVideosWorkbook);
  document.getElementById("complianceInput").addEventListener("change", importComplianceWorkbook);
  document.getElementById("addendumInput").addEventListener("change", importAddendumDocx);
  document.getElementById("videoTeamFilter").addEventListener("change", (e) => {
    safetyVideosView.team = e.target.value;
    renderSafetyVideos();
  });
  document.getElementById("videoPendingFilter").addEventListener("change", (e) => {
    safetyVideosView.minPending = Number(e.target.value || 0);
    renderSafetyVideos();
  });
  document.getElementById("videoHideCompleted").addEventListener("change", (e) => {
    safetyVideosView.hideCompleted = e.target.value === "yes";
    renderSafetyVideos();
  });
  document.getElementById("weeklyBatchSelect").addEventListener("change", (e) => {
    selectedWeeklyBatchIndex = Number(e.target.value || 0);
    renderCheckCallsTable();
  });
}

function switchTab(target) {
  document.querySelectorAll(".tab").forEach((el) => {
    el.classList.toggle("active", el.dataset.tab === target);
  });
  document.querySelectorAll(".tab-panel").forEach((el) => {
    el.classList.toggle("active", el.id === target);
  });
}

function mondayStamp(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

function runWeeklyResetIfNeeded() {
  const currentStamp = mondayStamp(new Date());
  const lastReset = localStorage.getItem("fleet_safety_last_reset_monday");
  if (lastReset === currentStamp) return;

  state.weeklyTasks = state.weeklyTasks.map((task) => ({ ...task, completed: false }));
  localStorage.setItem("fleet_safety_last_reset_monday", currentStamp);
  saveState();
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const then = new Date(dateStr);
  const now = new Date();
  const ms = now.setHours(0, 0, 0, 0) - then.setHours(0, 0, 0, 0);
  return Math.floor(ms / 86400000);
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const then = new Date(dateStr);
  const now = new Date();
  const ms = then.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0);
  return Math.ceil(ms / 86400000);
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function escAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function statusPill(status) {
  const cls = status === "Active" ? "green" : status === "Probation" ? "yellow" : "red";
  return `<span class="pill ${cls}">${status}</span>`;
}

function priorityPill(days) {
  if (days >= 7) return `<span class="pill red">Urgent</span>`;
  if (days >= 4) return `<span class="pill yellow">Watch</span>`;
  return `<span class="pill green">Current</span>`;
}

function empathyStatusPill(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("resolved")) return `<span class="pill green">Resolved</span>`;
  if (s.includes("escalated")) return `<span class="pill red">Escalated</span>`;
  if (s.includes("progress")) return `<span class="pill yellow">In Progress</span>`;
  return `<span class="pill yellow">Open</span>`;
}

function renderAll() {
  renderKPIs();
  renderWeeklyTable();
  renderDisciplineTable();
  renderCheckCallsTable();
  renderKwenTrackerTable();
  renderComplianceChecks();
  renderEmpathyReports();
  renderAddendumSection();
  renderSafetyVideos();
  renderOverviewLists();
}

function renderKPIs() {
  const suspended = state.discipline.filter((d) => d.status === "Suspended" && daysUntil(d.endDate) >= 0).length;
  const probation = state.discipline.filter((d) => d.status === "Probation").length;
  const weeklyDone = state.weeklyTasks.filter((t) => t.completed).length;
  const staleCalls = state.checkCalls.filter((c) => daysSince(c.lastCheckCall) >= 7).length;

  const kpis = [
    { label: "Drivers", value: state.drivers.length || state.checkCalls.length || state.discipline.length },
    { label: "Weekly Tasks Done", value: `${weeklyDone}/${state.weeklyTasks.length}` },
    { label: "Probation", value: probation },
    { label: "Suspended", value: suspended },
    { label: "Stale Calls (7+ Days)", value: staleCalls }
  ];

  const el = document.getElementById("kpiGrid");
  el.innerHTML = kpis
    .map((k) => `<div class="kpi"><h4>${k.label}</h4><p>${k.value}</p></div>`)
    .join("");
}

function renderWeeklyTable() {
  const body = document.getElementById("weeklyTableBody");
  body.innerHTML = state.weeklyTasks
    .map(
      (task) => `
      <tr>
        <td><input type="checkbox" data-task-id="${task.id}" ${task.completed ? "checked" : ""}></td>
        <td>${task.name}</td>
        <td>${task.owner}</td>
        <td>${task.lastCompletedAt || "-"}</td>
        <td><button class="btn ghost mini" data-action="weekly-remove" data-id="${task.id}">Remove</button></td>
      </tr>
    `
    )
    .join("");

  body.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.addEventListener("change", () => {
      const task = state.weeklyTasks.find((t) => t.id === input.dataset.taskId);
      if (!task) return;
      task.completed = input.checked;
      task.lastCompletedAt = input.checked ? new Date().toISOString().slice(0, 10) : task.lastCompletedAt;
      saveState();
      renderAll();
    });
  });

  body.querySelectorAll("[data-action='weekly-remove']").forEach((el) => {
    el.addEventListener("click", () => {
      state.weeklyTasks = state.weeklyTasks.filter((t) => t.id !== el.dataset.id);
      saveState();
      renderAll();
      setSyncStatus("Weekly task removed.");
    });
  });
}

function renderDisciplineTable() {
  const body = document.getElementById("disciplineTableBody");
  const historyBody = document.getElementById("disciplineHistoryBody");
  const rows = state.discipline
    .slice()
    .sort((a, b) => (daysUntil(a.endDate) ?? 9999) - (daysUntil(b.endDate) ?? 9999));
  body.innerHTML = rows
    .map((d) => {
      const remaining = daysUntil(d.endDate);
      const daysLeft = remaining === null ? "-" : remaining < 0 ? "Complete" : remaining;
      const done = Boolean(d.completed);
      return `
      <tr>
        <td>${d.driver}</td>
        <td>${levelLabels[d.level] || "Custom"}</td>
        <td>${statusPill(d.status)}</td>
        <td>${d.startDate || "-"}</td>
        <td>${d.endDate || "-"}</td>
        <td>${daysLeft}</td>
        <td><input type="checkbox" class="cell-checkbox" data-action="discipline-complete" data-id="${d.id}" ${done ? "checked" : ""}></td>
        <td>
          <div class="table-actions">
            <button class="btn ghost mini" data-action="discipline-archive" data-id="${d.id}">Archive</button>
            <button class="btn ghost mini" data-action="discipline-remove" data-id="${d.id}">Remove</button>
          </div>
        </td>
      </tr>
    `;
    })
    .join("");
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="8" class="empty-muted">No active discipline cases.</td></tr>`;
  }

  body.querySelectorAll("[data-action='discipline-complete']").forEach((el) => {
    el.addEventListener("change", () => toggleDisciplineCompleted(el.dataset.id, el.checked));
  });
  body.querySelectorAll("[data-action='discipline-archive']").forEach((el) => {
    el.addEventListener("click", () => archiveDisciplineCase(el.dataset.id, "Manual archive"));
  });
  body.querySelectorAll("[data-action='discipline-remove']").forEach((el) => {
    el.addEventListener("click", () => removeDisciplineCase(el.dataset.id));
  });

  const historyRows = state.disciplineHistory
    .slice()
    .sort((a, b) => String(b.archivedAt || "").localeCompare(String(a.archivedAt || "")));
  historyBody.innerHTML = historyRows.length
    ? historyRows
        .map(
          (h) => `<tr>
            <td>${h.driver}</td>
            <td>${levelLabels[h.level] || "Custom"}</td>
            <td>${statusPill(h.status)}</td>
            <td>${h.startDate || "-"}</td>
            <td>${h.endDate || "-"}</td>
            <td>${h.archivedAt || "-"}</td>
            <td>${h.archiveReason || "-"}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="7" class="empty-muted">No archived discipline records yet.</td></tr>`;
}

function renderCheckCallsTable() {
  const body = document.getElementById("checkCallTableBody");
  const weeklyBody = document.getElementById("weeklyCheckCallBody");
  const weekSelect = document.getElementById("weeklyBatchSelect");
  if (!body || !weeklyBody || !weekSelect) return;
  const importedAt = state.checkCallOps?.importedAt;
  if (importedAt) {
    setCheckCallOpsStatus(`Last check call workbook import: ${new Date(importedAt).toLocaleString()}`);
  }

  const rows = state.kwenTracker.length
    ? state.kwenTracker.slice()
    : state.checkCalls.map((c) => ({
        id: c.id,
        driver: c.driver,
        lastCheckCall: c.lastCheckCall,
        executedBy: c.lastCaller || "",
        daysPassed: daysSince(c.lastCheckCall),
        status: (daysSince(c.lastCheckCall) ?? 0) >= 7 ? "HIGH PRIORITY" : "CURRENT"
      }));

  const sortedRows = rows
    .slice()
    .sort((a, b) => {
      const aDays = Number.isFinite(a.daysPassed) ? a.daysPassed : daysSince(a.lastCheckCall) ?? -1;
      const bDays = Number.isFinite(b.daysPassed) ? b.daysPassed : daysSince(b.lastCheckCall) ?? -1;
      return bDays - aDays;
    });

  body.innerHTML = sortedRows
    .map((row) => {
      const ds = Number.isFinite(row.daysPassed) ? row.daysPassed : daysSince(row.lastCheckCall);
      return `
      <tr>
        <td>${row.driver}</td>
        <td>${row.lastCheckCall || "-"}</td>
        <td>${row.executedBy || "-"}</td>
        <td>${ds ?? "-"}</td>
        <td>${trackerStatusPill(row.status || (ds === null ? "Current" : ds >= 7 ? "HIGH PRIORITY" : "Current"))}</td>
        <td>
          <div class="table-actions">
            <button class="btn ghost mini" data-action="checkcall-log" data-id="${row.id}">Log Today</button>
            <button class="btn ghost mini" data-action="checkcall-remove" data-id="${row.id}">Remove</button>
          </div>
        </td>
      </tr>
    `;
    })
    .join("");
  if (!sortedRows.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty-muted">No check calls logged yet.</td></tr>`;
  }

  body.querySelectorAll("[data-action='checkcall-log']").forEach((el) => {
    el.addEventListener("click", () => logCheckCallTodayById(el.dataset.id));
  });
  body.querySelectorAll("[data-action='checkcall-remove']").forEach((el) => {
    el.addEventListener("click", () => removeCheckCallById(el.dataset.id));
  });

  const batches = Array.isArray(state.checkCallOps?.weeklyBatches) ? state.checkCallOps.weeklyBatches : [];
  weekSelect.innerHTML = batches.length
    ? batches
        .map((b, i) => `<option value="${i}" ${i === selectedWeeklyBatchIndex ? "selected" : ""}>${b.label || `Week ${i + 1}`}</option>`)
        .join("")
    : `<option value="0">No weekly count data</option>`;
  if (selectedWeeklyBatchIndex >= batches.length) selectedWeeklyBatchIndex = 0;

  const active = batches[selectedWeeklyBatchIndex];
  if (!active || !Array.isArray(active.agents) || !active.agents.length) {
    weeklyBody.innerHTML = `<tr><td colspan="10" class="empty-muted">Import Check Call Workbook to load weekly call count.</td></tr>`;
    return;
  }
  const weekStart = active.weekStart || "";
  const weekEnd = active.weekEnd || "";
  const weekCalls = (state.callActivity || []).filter((a) => {
    if (!a.date) return false;
    if (weekStart && a.date < weekStart) return false;
    if (weekEnd && a.date > weekEnd) return false;
    return true;
  });

  weeklyBody.innerHTML = active.agents
    .slice()
    .sort((a, b) => Number(b.total || 0) - Number(a.total || 0))
    .map((agent) => {
      const daily = agent.daily || [];
      const driversCalled = [...new Set(weekCalls.filter((c) => normalizeNameKey(c.caller) === normalizeNameKey(agent.name)).map((c) => c.driver))]
        .sort((a, b) => a.localeCompare(b));
      return `<tr>
        <td>${agent.name}</td>
        <td>${daily[0] ?? "-"}</td>
        <td>${daily[1] ?? "-"}</td>
        <td>${daily[2] ?? "-"}</td>
        <td>${daily[3] ?? "-"}</td>
        <td>${daily[4] ?? "-"}</td>
        <td>${daily[5] ?? "-"}</td>
        <td>${daily[6] ?? "-"}</td>
        <td><strong>${agent.total ?? "-"}</strong></td>
        <td>${driversCalled.length ? driversCalled.map((d) => `<span class="note-chip">${d}</span>`).join(" ") : '<span class="empty-muted">No call activity logged</span>'}</td>
      </tr>`;
    })
    .join("");
}

function trackerStatusPill(status) {
  const normalized = normalizeHeader(status);
  if (normalized.includes("high priority")) return `<span class="pill red">${status}</span>`;
  if (normalized.includes("watch")) return `<span class="pill yellow">${status}</span>`;
  return `<span class="pill green">${status || "Current"}</span>`;
}

function renderKwenTrackerTable() {
  const body = document.getElementById("kwenTrackerTableBody");
  if (!body) return;

  const rows = state.kwenTracker
    .slice()
    .sort((a, b) => {
      const aDays = Number.isFinite(a.daysPassed) ? a.daysPassed : daysSince(a.lastCheckCall) ?? -1;
      const bDays = Number.isFinite(b.daysPassed) ? b.daysPassed : daysSince(b.lastCheckCall) ?? -1;
      return bDays - aDays;
    });

  body.innerHTML = rows.length
    ? rows
        .map((row) => {
          const days = Number.isFinite(row.daysPassed) ? row.daysPassed : daysSince(row.lastCheckCall);
          return `
      <tr>
        <td>${row.driver}</td>
        <td>${row.lastCheckCall || "-"}</td>
        <td>${row.executedBy || "-"}</td>
        <td>${days ?? "-"}</td>
        <td>${trackerStatusPill(row.status || "Current")}</td>
        <td>
          <div class="table-actions">
            <button class="btn ghost mini" data-action="tracker-log" data-id="${row.id}">Log Call</button>
            <button class="btn ghost mini" data-action="tracker-remove" data-id="${row.id}">Remove</button>
          </div>
        </td>
      </tr>
    `;
        })
        .join("")
    : `<tr><td colspan="6">No tracker rows imported yet.</td></tr>`;

  body.querySelectorAll("[data-action='tracker-log']").forEach((el) => {
    el.addEventListener("click", () => logTrackerCallById(el.dataset.id));
  });
  body.querySelectorAll("[data-action='tracker-remove']").forEach((el) => {
    el.addEventListener("click", () => removeTrackerRowById(el.dataset.id));
  });
}

function setComplianceStatus(message) {
  const el = document.getElementById("complianceStatus");
  if (el) el.textContent = message;
}

function renderComplianceChecks() {
  const kpiEl = document.getElementById("complianceKpiGrid");
  const caseBody = document.getElementById("complianceCaseBody");
  const repeatBody = document.getElementById("complianceRepeatBody");
  const metricList = document.getElementById("complianceMetricList");
  if (!kpiEl || !caseBody || !repeatBody || !metricList) return;

  const cases = Array.isArray(state.compliance?.cases) ? state.compliance.cases : [];
  const repeat = Array.isArray(state.compliance?.repeatOffenders) ? state.compliance.repeatOffenders : [];
  const metrics = Array.isArray(state.compliance?.executiveMetrics) ? state.compliance.executiveMetrics : [];
  const importedAtText = state.compliance?.importedAt ? new Date(state.compliance.importedAt).toLocaleString() : "Not imported yet";
  setComplianceStatus(`Source: Driver_Safety_Compliance_Analysis.xlsx. Last import: ${importedAtText}`);

  const openCases = cases.filter((c) => !c.completed).length;
  const completedCases = cases.filter((c) => c.completed).length;
  const highPriority = repeat.length;
  const kpis = [
    { label: "Total Cases", value: cases.length },
    { label: "Open Cases", value: openCases },
    { label: "Completed Cases", value: completedCases },
    { label: "Repeat Offenders", value: highPriority },
    { label: "Follow Up Required", value: cases.filter((c) => c.needsFollowUp).length }
  ];
  kpiEl.innerHTML = kpis.map((k) => `<div class="kpi"><h4>${k.label}</h4><p>${k.value}</p></div>`).join("");
  metricList.innerHTML = metrics.length
    ? metrics.map((m) => `<div class="list-row"><span>${m.label}</span><strong>${m.value}</strong></div>`).join("")
    : `<div class="list-row"><span class="empty-muted">No executive summary metrics imported.</span><strong>-</strong></div>`;

  caseBody.innerHTML = cases.length
    ? cases
        .slice()
        .sort((a, b) => String(b.reportDate || "").localeCompare(String(a.reportDate || "")))
        .map((c) => {
          const complianceDone = c.completed ? `<span class="pill green">Complete</span>` : `<span class="pill yellow">Pending</span>`;
          return `<tr>
            <td>${c.driver || "-"}</td>
            <td>${c.caseNo || "-"}</td>
            <td>${c.reportDate || "-"}</td>
            <td>${c.nature || "-"}</td>
            <td>${complianceDone}</td>
            <td>
              <div class="table-actions">
                <input type="checkbox" class="cell-checkbox" data-action="compliance-done" data-id="${c.id}" ${c.completed ? "checked" : ""} title="Mark complete">
                <button class="btn ghost mini" data-action="compliance-checkcall" data-id="${c.id}">Log Check Call</button>
                <button class="btn ghost mini" data-action="compliance-remove" data-id="${c.id}">Remove</button>
              </div>
            </td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="6" class="empty-muted">No compliance cases loaded.</td></tr>`;

  repeatBody.innerHTML = repeat.length
    ? repeat
        .map(
          (r) => `<tr>
            <td>${r.driver || "-"}</td>
            <td>${r.totalCases || "-"}</td>
            <td>${r.latestIncident || "-"}</td>
            <td>${r.incidentTypes || "-"}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="4" class="empty-muted">No repeat offender records.</td></tr>`;

  caseBody.querySelectorAll("[data-action='compliance-done']").forEach((el) => {
    el.addEventListener("change", () => toggleComplianceCaseCompleted(el.dataset.id, el.checked));
  });
  caseBody.querySelectorAll("[data-action='compliance-checkcall']").forEach((el) => {
    el.addEventListener("click", () => logComplianceCaseCheckCall(el.dataset.id));
  });
  caseBody.querySelectorAll("[data-action='compliance-remove']").forEach((el) => {
    el.addEventListener("click", () => removeComplianceCase(el.dataset.id));
  });
}

function renderEmpathyReports() {
  const activeBody = document.getElementById("empathyActiveBody");
  const historyBody = document.getElementById("empathyHistoryBody");
  if (!activeBody || !historyBody) return;

  const active = Array.isArray(state.empathy?.active) ? state.empathy.active : [];
  const history = Array.isArray(state.empathy?.history) ? state.empathy.history : [];
  activeBody.innerHTML = active.length
    ? active
        .slice()
        .sort((a, b) => String(b.dateReported || "").localeCompare(String(a.dateReported || "")))
        .map(
          (r) => `<tr>
            <td>${r.driver || "-"}</td>
            <td>${r.dateReported || "-"}</td>
            <td>${r.reportedBy || "-"}</td>
            <td>${r.issue || "-"}</td>
            <td>${r.managerOwner || "-"}</td>
            <td>${empathyStatusPill(r.status || "Open")}</td>
            <td>${r.solution || "-"}</td>
            <td>
              <div class="table-actions">
                <button class="btn ghost mini" data-action="empathy-edit" data-id="${r.id}">Update</button>
                <button class="btn ghost mini" data-action="empathy-resolve" data-id="${r.id}">Resolve</button>
                <button class="btn ghost mini" data-action="empathy-remove" data-id="${r.id}">Remove</button>
              </div>
            </td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="8" class="empty-muted">No empathy reports yet.</td></tr>`;

  historyBody.innerHTML = history.length
    ? history
        .slice()
        .sort((a, b) => String(b.archivedAt || "").localeCompare(String(a.archivedAt || "")))
        .map(
          (h) => `<tr>
            <td>${h.driver || "-"}</td>
            <td>${h.issue || "-"}</td>
            <td>${h.solution || "-"}</td>
            <td>${h.dateReported || "-"}</td>
            <td>${h.dateResolved || "-"}</td>
            <td>${h.archivedAt || "-"}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="6" class="empty-muted">No empathy history yet.</td></tr>`;

  activeBody.querySelectorAll("[data-action='empathy-edit']").forEach((el) => {
    el.addEventListener("click", () => showEditEmpathyDialog(el.dataset.id));
  });
  activeBody.querySelectorAll("[data-action='empathy-resolve']").forEach((el) => {
    el.addEventListener("click", () => resolveEmpathyReport(el.dataset.id));
  });
  activeBody.querySelectorAll("[data-action='empathy-remove']").forEach((el) => {
    el.addEventListener("click", () => removeEmpathyReport(el.dataset.id));
  });
}

function setAddendumStatus(message) {
  const el = document.getElementById("addendumStatus");
  if (el) el.textContent = message;
}

function extractAddendumSections(paragraphs) {
  const sections = [];
  paragraphs.forEach((p) => {
    const text = String(p || "").trim();
    if (!text) return;
    const headingMatch = text.match(/^([A-Z]\.|\b[A-Z][0-9]\.|\b[A-Z]\d\b|Step\b|Report Section\b)/);
    if (headingMatch || /^([A-Z][A-Za-z\s&/,-]{5,80})$/.test(text)) {
      sections.push({ title: text, body: "" });
    } else if (sections.length) {
      const current = sections[sections.length - 1];
      if (current.body.length < 380) {
        current.body += (current.body ? " " : "") + text;
      }
    }
  });
  return sections.slice(0, 20);
}

function renderAddendumSection() {
  const kpiEl = document.getElementById("addendumKpiGrid");
  const sectionsEl = document.getElementById("addendumSections");
  const ackBody = document.getElementById("addendumAckBody");
  if (!kpiEl || !sectionsEl || !ackBody) return;

  const paragraphs = Array.isArray(state.addendum?.paragraphs) ? state.addendum.paragraphs : [];
  const acks = Array.isArray(state.addendum?.acknowledgments) ? state.addendum.acknowledgments : [];
  const sections = extractAddendumSections(paragraphs);
  const importedAtText = state.addendum?.importedAt ? new Date(state.addendum.importedAt).toLocaleString() : "Not imported yet";
  setAddendumStatus(`Source: Fleet_Safety_Addendum.docx. Last import: ${importedAtText}`);

  const kpis = [
    { label: "Paragraphs Loaded", value: paragraphs.length },
    { label: "Sections Parsed", value: sections.length },
    { label: "Acknowledgments", value: acks.length },
    { label: "Pending Acks", value: Math.max(0, state.drivers.length - acks.length) }
  ];
  kpiEl.innerHTML = kpis.map((k) => `<div class="kpi"><h4>${k.label}</h4><p>${k.value}</p></div>`).join("");

  sectionsEl.innerHTML = sections.length
    ? sections
        .map((s) => `<div class="section-list"><h4>${s.title}</h4><p>${s.body || "Policy section content loaded."}</p></div>`)
        .join("")
    : `<div class="section-list"><p class="empty-muted">No addendum sections loaded.</p></div>`;

  ackBody.innerHTML = acks.length
    ? acks
        .slice()
        .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
        .map(
          (a) => `<tr>
            <td>${a.name || "-"}</td>
            <td>${a.role || "-"}</td>
            <td>${a.date || "-"}</td>
            <td>${a.notes || "-"}</td>
            <td><button class="btn ghost mini" data-action="ack-remove" data-id="${a.id}">Remove</button></td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="5" class="empty-muted">No acknowledgments recorded.</td></tr>`;

  ackBody.querySelectorAll("[data-action='ack-remove']").forEach((el) => {
    el.addEventListener("click", () => removeAddendumAck(el.dataset.id));
  });
}

function setSafetyVideosStatus(message) {
  const el = document.getElementById("safetyVideosStatus");
  if (el) el.textContent = message;
}

function renderSafetyVideos() {
  const pending = Array.isArray(state.safetyVideos?.pending) ? state.safetyVideos.pending : [];
  const audit = Array.isArray(state.safetyVideos?.courseAudit) ? state.safetyVideos.courseAudit : [];
  if (!Array.isArray(state.safetyVideos?.followUps)) state.safetyVideos.followUps = [];
  const kpiEl = document.getElementById("videoKpiGrid");
  const pendingBody = document.getElementById("videoPendingBody");
  const auditBody = document.getElementById("videoCourseAuditBody");
  if (!kpiEl || !pendingBody || !auditBody) return;

  const importedAtText = state.safetyVideos?.importedAt
    ? new Date(state.safetyVideos.importedAt).toLocaleString()
    : "Not imported yet";
  setSafetyVideosStatus(`Source: NEW SAFETY INITIAVE VIDEOS workbook. Last import: ${importedAtText}`);

  const otrPending = pending.filter((p) => p.team === "OTR").length;
  const ag4Pending = pending.filter((p) => p.team === "AG4").length;
  const highBacklog = pending.filter((p) => Number(p.pendingCourses) >= 6).length;
  const calledDone = state.safetyVideos.followUps.filter((f) => f.called).length;
  const kpis = [
    { label: "Pending Drivers", value: pending.length },
    { label: "OTR Pending", value: otrPending },
    { label: "AG4 Pending", value: ag4Pending },
    { label: "High Backlog (6+)", value: highBacklog },
    { label: "Course Audits", value: audit.length },
    { label: "Follow Ups Called", value: calledDone }
  ];
  kpiEl.innerHTML = kpis.map((k) => `<div class="kpi"><h4>${k.label}</h4><p>${k.value}</p></div>`).join("");

  const filteredPending = pending
    .filter((p) => (safetyVideosView.team === "all" ? true : p.team === safetyVideosView.team))
    .filter((p) => Number(p.pendingCourses) >= safetyVideosView.minPending)
    .filter((p) => {
      if (!safetyVideosView.hideCompleted) return true;
      const fu = getSafetyFollowUp(p, false);
      return !fu || !fu.called;
    });

  pendingBody.innerHTML = filteredPending.length
    ? filteredPending
        .slice()
        .sort((a, b) => Number(b.pendingCourses) - Number(a.pendingCourses) || String(a.driver).localeCompare(String(b.driver)))
        .map((r) => {
          const fu = getSafetyFollowUp(r, true);
          return `<tr>
            <td>${r.driver}</td>
            <td>${r.team}</td>
            <td><span class="pill ${Number(r.pendingCourses) >= 6 ? "red" : Number(r.pendingCourses) >= 4 ? "yellow" : "green"}">${r.pendingCourses}</span></td>
            <td>${r.email || "-"}</td>
            <td><input type="checkbox" class="cell-checkbox" data-action="video-called" data-key="${fu.key}" ${fu.called ? "checked" : ""}></td>
            <td>${fu.lastCalled || "-"}</td>
            <td><input type="date" value="${fu.nextFollowUp || ""}" data-action="video-next" data-key="${fu.key}"></td>
            <td>
              <div class="table-actions">
                <button class="btn ghost mini" data-action="video-log-call" data-key="${fu.key}">Log Call</button>
                <button class="btn ghost mini" data-action="video-remove-driver" data-key="${fu.key}">Remove</button>
              </div>
            </td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="8">No pending drivers match the current filters.</td></tr>`;

  auditBody.innerHTML = audit.length
    ? audit
        .map(
          (r) => `<tr>
            <td>${r.team}</td>
            <td>${r.course}</td>
            <td>${r.summary || "-"}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="3">No completion audit rows imported.</td></tr>`;

  pendingBody.querySelectorAll("[data-action='video-called']").forEach((el) => {
    el.addEventListener("change", () => toggleSafetyVideoCalled(el.dataset.key, el.checked));
  });
  pendingBody.querySelectorAll("[data-action='video-next']").forEach((el) => {
    el.addEventListener("change", () => updateSafetyVideoNextFollowUp(el.dataset.key, el.value));
  });
  pendingBody.querySelectorAll("[data-action='video-log-call']").forEach((el) => {
    el.addEventListener("click", () => logSafetyVideoCall(el.dataset.key));
  });
  pendingBody.querySelectorAll("[data-action='video-remove-driver']").forEach((el) => {
    el.addEventListener("click", () => removeSafetyVideoPendingDriver(el.dataset.key));
  });
}

function renderOverviewLists() {
  const bottomDrivers = [...state.drivers]
    .sort((a, b) => a.safetyScore - b.safetyScore)
    .slice(0, 8);
  const bottomEl = document.getElementById("bottomDrivers");
  bottomEl.innerHTML = bottomDrivers.length
    ? bottomDrivers
        .map(
          (d) => `<div class="list-row"><span>${d.name}</span><strong>${d.safetyScore}</strong></div>`
        )
        .join("")
    : `<div class="list-row"><span>No scores yet.</span><strong>-</strong></div>`;

  const priority = [...state.checkCalls]
    .sort((a, b) => (daysSince(b.lastCheckCall) ?? 0) - (daysSince(a.lastCheckCall) ?? 0))
    .slice(0, 8);
  const callEl = document.getElementById("callPriority");
  callEl.innerHTML = priority.length
    ? priority
        .map((r) => {
          const ds = daysSince(r.lastCheckCall);
          return `<div class="list-row"><span>${r.driver}</span><strong>${ds ?? "-"}d</strong></div>`;
        })
        .join("")
    : `<div class="list-row"><span>No check calls yet.</span><strong>-</strong></div>`;
}

function showAddTaskDialog() {
  openDialog({
    title: "Add Weekly Task",
    fields: [
      { id: "taskName", label: "Task", type: "text", required: true },
      { id: "taskOwner", label: "Owner", type: "text", required: true }
    ],
    onSubmit(values) {
      state.weeklyTasks.push({
        id: crypto.randomUUID(),
        name: values.taskName,
        owner: values.taskOwner,
        completed: false,
        lastCompletedAt: null
      });
      saveState();
      renderAll();
    }
  });
}

function showDisciplineDialog() {
  openDialog({
    title: "Add Discipline Case",
    fields: [
      { id: "driver", label: "Driver", type: "text", required: true },
      { id: "level", label: "Level", type: "select", options: ["1", "2", "3"], required: true },
      { id: "status", label: "Status", type: "select", options: ["Active", "Probation", "Suspended"], required: true },
      { id: "startDate", label: "Start Date", type: "date", required: true },
      { id: "endDate", label: "End Date", type: "date", required: false }
    ],
    onSubmit(values) {
      upsertDriver(values.driver, null);
      upsertDiscipline(values.driver, Number(values.level), values.status, values.startDate, values.endDate || null);
      saveState();
      renderAll();
    }
  });
}

function showCheckCallDialog() {
  openDialog({
    title: "Log Check Call",
    fields: [
      { id: "driver", label: "Driver", type: "text", required: true },
      { id: "lastCheckCall", label: "Check Call Date", type: "date", required: true },
      { id: "calledBy", label: "FMT/FMTM", type: "text", required: false, value: "Safety Team" }
    ],
    onSubmit(values) {
      upsertDriver(values.driver, null);
      upsertCheckCall(values.driver, values.lastCheckCall, values.calledBy || "Safety Team");
      upsertKwenTracker(values.driver, values.lastCheckCall, values.calledBy || "Safety Team", 0, "Current");
      addCallActivity(values.driver, values.calledBy || "Safety Team", values.lastCheckCall);
      saveState();
      renderAll();
    }
  });
}

function showCheckCallActivityDialog() {
  openDialog({
    title: "Log Weekly Caller Activity",
    fields: [
      { id: "driver", label: "Driver", type: "text", required: true },
      { id: "caller", label: "FMT/FMTM", type: "text", required: true },
      { id: "date", label: "Call Date", type: "date", required: true }
    ],
    onSubmit(values) {
      addCallActivity(values.driver, values.caller, values.date || todayYmd());
      upsertDriver(values.driver, null);
      upsertCheckCall(values.driver, values.date || todayYmd(), values.caller);
      upsertKwenTracker(values.driver, values.date || todayYmd(), values.caller, 0, "Current");
      saveState();
      renderAll();
      setSyncStatus(`Caller activity logged: ${values.caller} -> ${values.driver}.`);
    }
  });
}

function showAddSafetyPendingDialog() {
  openDialog({
    title: "Add Safety Video Follow Up Driver",
    fields: [
      { id: "driver", label: "Driver", type: "text", required: true },
      { id: "team", label: "Team", type: "select", options: ["OTR", "AG4"], required: true },
      { id: "pendingCourses", label: "Pending Courses", type: "number", required: true },
      { id: "email", label: "Email", type: "text", required: false }
    ],
    onSubmit(values) {
      const driver = String(values.driver || "").trim();
      if (!driver) return;
      const team = values.team || "OTR";
      const pendingCourses = Math.max(0, Number(values.pendingCourses || 0));
      const key = safetyVideoKey(driver, team);
      const existing = state.safetyVideos.pending.find((p) => safetyVideoKey(p.driver, p.team) === key);
      const payload = {
        team,
        driver,
        email: String(values.email || "").trim(),
        pendingCourses
      };
      if (existing) Object.assign(existing, payload);
      else state.safetyVideos.pending.push(payload);
      upsertDriver(driver, null);
      getSafetyFollowUp(payload, true);
      saveState();
      renderAll();
      setSyncStatus(`Safety follow-up driver ${existing ? "updated" : "added"}.`);
    }
  });
}

function showAddComplianceCaseDialog() {
  openDialog({
    title: "Add Compliance Case",
    fields: [
      { id: "driver", label: "Driver", type: "text", required: true },
      { id: "caseNo", label: "Case #", type: "text", required: true },
      { id: "reportDate", label: "Report Date", type: "date", required: true },
      { id: "nature", label: "Nature", type: "text", required: true },
      { id: "description", label: "Description", type: "text", required: false },
      { id: "reporter", label: "Reporter", type: "text", required: false }
    ],
    onSubmit(values) {
      const rec = {
        id: crypto.randomUUID(),
        driver: values.driver,
        caseNo: values.caseNo,
        reportDate: values.reportDate || todayYmd(),
        nature: values.nature,
        description: values.description || "",
        reporter: values.reporter || "",
        completed: false,
        needsFollowUp: true
      };
      state.compliance.cases.push(rec);
      upsertDriver(values.driver, null);
      saveState();
      renderAll();
      setSyncStatus(`Compliance case ${rec.caseNo} added for ${rec.driver}.`);
    }
  });
}

function toggleComplianceCaseCompleted(id, checked) {
  const rec = state.compliance.cases.find((c) => c.id === id);
  if (!rec) return;
  rec.completed = checked;
  rec.completedAt = checked ? todayYmd() : null;
  rec.needsFollowUp = !checked;
  saveState();
  renderAll();
}

function logComplianceCaseCheckCall(id) {
  const rec = state.compliance.cases.find((c) => c.id === id);
  if (!rec) return;
  const today = todayYmd();
  upsertCheckCall(rec.driver, today, "Safety Team");
  upsertKwenTracker(rec.driver, today, "Safety Team", 0, "Current");
  addCallActivity(rec.driver, "Safety Team", today);
  rec.lastCheckCall = today;
  rec.needsFollowUp = false;
  saveState();
  renderAll();
  setSyncStatus(`Compliance check call logged for ${rec.driver}.`);
}

function removeComplianceCase(id) {
  const idx = state.compliance.cases.findIndex((c) => c.id === id);
  if (idx < 0) return;
  const rec = state.compliance.cases[idx];
  state.compliance.cases.splice(idx, 1);
  saveState();
  renderAll();
  setSyncStatus(`Compliance case ${rec.caseNo || ""} removed.`);
}

function showAddEmpathyDialog() {
  openDialog({
    title: "Add Driver Empathy Report",
    fields: [
      { id: "driver", label: "Driver", type: "text", required: true },
      { id: "dateReported", label: "Date Reported", type: "date", required: true },
      { id: "reportedBy", label: "Reported By", type: "text", required: true },
      { id: "issue", label: "Issue", type: "text", required: true },
      { id: "managerOwner", label: "Manager Owner", type: "text", required: false },
      { id: "status", label: "Status", type: "select", options: ["Open", "In Progress", "Escalated", "Resolved"], required: true },
      { id: "solution", label: "Current Solution / Notes", type: "text", required: false }
    ],
    onSubmit(values) {
      const rec = {
        id: crypto.randomUUID(),
        driver: values.driver,
        dateReported: values.dateReported || todayYmd(),
        reportedBy: values.reportedBy,
        issue: values.issue,
        managerOwner: values.managerOwner || "",
        status: values.status || "Open",
        solution: values.solution || "",
        dateResolved: null
      };
      state.empathy.active.push(rec);
      upsertDriver(values.driver, null);
      saveState();
      renderAll();
      setSyncStatus(`Empathy report added for ${rec.driver}.`);
    }
  });
}

function showEditEmpathyDialog(id) {
  const rec = state.empathy.active.find((r) => r.id === id);
  if (!rec) return;
  openDialog({
    title: "Update Empathy Report",
    fields: [
      { id: "managerOwner", label: "Manager Owner", type: "text", required: false, value: rec.managerOwner || "" },
      { id: "status", label: "Status", type: "select", options: ["Open", "In Progress", "Escalated", "Resolved"], required: true, value: rec.status || "Open" },
      { id: "solution", label: "Solution / Update", type: "text", required: false, value: rec.solution || "" }
    ],
    onSubmit(values) {
      rec.managerOwner = values.managerOwner || rec.managerOwner;
      rec.status = values.status || rec.status;
      rec.solution = values.solution || rec.solution;
      saveState();
      renderAll();
      setSyncStatus(`Empathy report updated for ${rec.driver}.`);
    }
  });
}

function resolveEmpathyReport(id) {
  const idx = state.empathy.active.findIndex((r) => r.id === id);
  if (idx < 0) return;
  const rec = state.empathy.active[idx];
  rec.status = "Resolved";
  rec.dateResolved = todayYmd();
  state.empathy.history.push({
    ...rec,
    archivedAt: todayYmd()
  });
  state.empathy.active.splice(idx, 1);
  saveState();
  renderAll();
  setSyncStatus(`Empathy report resolved for ${rec.driver}.`);
}

function removeEmpathyReport(id) {
  state.empathy.active = state.empathy.active.filter((r) => r.id !== id);
  saveState();
  renderAll();
  setSyncStatus("Empathy report removed.");
}

function archiveResolvedEmpathyReports() {
  const resolved = state.empathy.active.filter((r) => String(r.status || "").toLowerCase().includes("resolved"));
  if (!resolved.length) {
    setSyncStatus("No empathy reports ready to archive.");
    return;
  }
  const ids = new Set(resolved.map((r) => r.id));
  resolved.forEach((r) => {
    state.empathy.history.push({
      ...r,
      dateResolved: r.dateResolved || todayYmd(),
      archivedAt: todayYmd()
    });
  });
  state.empathy.active = state.empathy.active.filter((r) => !ids.has(r.id));
  saveState();
  renderAll();
  setSyncStatus(`Archived ${resolved.length} empathy report(s).`);
}

function showAddAddendumAckDialog() {
  openDialog({
    title: "Add Addendum Acknowledgment",
    fields: [
      { id: "name", label: "Team Member", type: "text", required: true },
      { id: "role", label: "Role", type: "text", required: true },
      { id: "date", label: "Date", type: "date", required: true },
      { id: "notes", label: "Notes", type: "text", required: false }
    ],
    onSubmit(values) {
      state.addendum.acknowledgments.push({
        id: crypto.randomUUID(),
        name: values.name,
        role: values.role,
        date: values.date || todayYmd(),
        notes: values.notes || ""
      });
      saveState();
      renderAll();
      setSyncStatus(`Addendum acknowledgment recorded for ${values.name}.`);
    }
  });
}

function removeAddendumAck(id) {
  state.addendum.acknowledgments = state.addendum.acknowledgments.filter((a) => a.id !== id);
  saveState();
  renderAll();
  setSyncStatus("Acknowledgment removed.");
}

function toggleDisciplineCompleted(id, checked) {
  const rec = state.discipline.find((d) => d.id === id);
  if (!rec) return;
  rec.completed = checked;
  rec.completedAt = checked ? todayYmd() : null;
  saveState();
  renderAll();
}

function archiveDisciplineCase(id, reason = "Completed") {
  const idx = state.discipline.findIndex((d) => d.id === id);
  if (idx < 0) return;
  const rec = state.discipline[idx];
  state.disciplineHistory.push({
    ...rec,
    archivedAt: todayYmd(),
    archiveReason: reason
  });
  state.discipline.splice(idx, 1);
  saveState();
  renderAll();
  setSyncStatus(`Archived discipline case for ${rec.driver}.`);
}

function archiveCompletedDiscipline() {
  const toArchive = state.discipline.filter((d) => d.completed || (daysUntil(d.endDate) ?? 1) < 0);
  if (!toArchive.length) {
    setSyncStatus("No completed discipline cases to archive.");
    return;
  }
  const ids = new Set(toArchive.map((r) => r.id));
  toArchive.forEach((r) => {
    state.disciplineHistory.push({
      ...r,
      archivedAt: todayYmd(),
      archiveReason: r.completed ? "Marked complete" : "End date passed"
    });
  });
  state.discipline = state.discipline.filter((d) => !ids.has(d.id));
  saveState();
  renderAll();
  setSyncStatus(`Archived ${toArchive.length} completed discipline case(s).`);
}

function removeDisciplineCase(id) {
  const idx = state.discipline.findIndex((d) => d.id === id);
  if (idx < 0) return;
  const rec = state.discipline[idx];
  state.discipline.splice(idx, 1);
  saveState();
  renderAll();
  setSyncStatus(`Removed discipline case for ${rec.driver}.`);
}

function logCheckCallTodayById(id) {
  const rec = state.checkCalls.find((c) => c.id === id);
  const tracker = state.kwenTracker.find((r) => r.id === id);
  const driverName = rec?.driver || tracker?.driver;
  if (!driverName) return;
  const today = todayYmd();
  const caller = rec?.lastCaller || tracker?.executedBy || "Safety Team";
  if (rec) {
    rec.lastCheckCall = today;
    rec.lastCaller = caller;
  }
  if (tracker) {
    tracker.lastCheckCall = today;
    tracker.daysPassed = 0;
    tracker.executedBy = caller;
    tracker.status = "Current";
  }
  upsertCheckCall(driverName, today, caller);
  upsertKwenTracker(driverName, today, caller, 0, "Current");
  addCallActivity(driverName, caller, today);
  saveState();
  renderAll();
  setSyncStatus(`Logged check call for ${driverName}.`);
}

function removeCheckCallById(id) {
  const idx = state.checkCalls.findIndex((c) => c.id === id);
  const tIdx = state.kwenTracker.findIndex((r) => r.id === id);
  if (idx < 0 && tIdx < 0) return;
  const rec = idx >= 0 ? state.checkCalls[idx] : state.kwenTracker[tIdx];
  if (idx >= 0) state.checkCalls.splice(idx, 1);
  if (tIdx >= 0) state.kwenTracker.splice(tIdx, 1);
  saveState();
  renderAll();
  setSyncStatus(`Removed check call row for ${rec.driver}.`);
}

function logTrackerCallById(id) {
  const row = state.kwenTracker.find((r) => r.id === id);
  if (!row) return;
  const today = todayYmd();
  row.lastCheckCall = today;
  row.daysPassed = 0;
  row.executedBy = "Safety Team";
  row.status = "Current";
  upsertCheckCall(row.driver, today, row.executedBy || "Safety Team");
  addCallActivity(row.driver, row.executedBy || "Safety Team", today);
  saveState();
  renderAll();
  setSyncStatus(`Logged tracker check call for ${row.driver}.`);
}

function removeTrackerRowById(id) {
  const idx = state.kwenTracker.findIndex((r) => r.id === id);
  if (idx < 0) return;
  const row = state.kwenTracker[idx];
  state.kwenTracker.splice(idx, 1);
  saveState();
  renderAll();
  setSyncStatus(`Removed tracker row for ${row.driver}.`);
}

function safetyVideoKey(driver, team) {
  return `${normalizeNameKey(driver)}::${String(team || "").toUpperCase()}`;
}

function getSafetyFollowUp(row, createIfMissing = false) {
  const key = safetyVideoKey(row.driver, row.team);
  let rec = state.safetyVideos.followUps.find((f) => f.key === key);
  if (!rec && createIfMissing) {
    rec = {
      id: crypto.randomUUID(),
      key,
      driver: row.driver,
      team: row.team,
      called: false,
      lastCalled: null,
      nextFollowUp: null
    };
    state.safetyVideos.followUps.push(rec);
  }
  return rec;
}

function getSafetyFollowUpByKey(key) {
  return state.safetyVideos.followUps.find((f) => f.key === key);
}

function toggleSafetyVideoCalled(key, checked) {
  const rec = getSafetyFollowUpByKey(key);
  if (!rec) return;
  rec.called = checked;
  rec.lastCalled = checked ? todayYmd() : rec.lastCalled;
  if (checked) {
    upsertCheckCall(rec.driver, rec.lastCalled, "Safety Team");
    upsertKwenTracker(rec.driver, rec.lastCalled, "Safety Team", 0, "Current");
    addCallActivity(rec.driver, "Safety Team", rec.lastCalled);
  }
  saveState();
  renderAll();
}

function updateSafetyVideoNextFollowUp(key, value) {
  const rec = getSafetyFollowUpByKey(key);
  if (!rec) return;
  rec.nextFollowUp = value || null;
  saveState();
}

function logSafetyVideoCall(key) {
  const rec = getSafetyFollowUpByKey(key);
  if (!rec) return;
  const today = todayYmd();
  rec.called = true;
  rec.lastCalled = today;
  upsertCheckCall(rec.driver, today, "Safety Team");
  upsertKwenTracker(rec.driver, today, "Safety Team", 0, "Current");
  addCallActivity(rec.driver, "Safety Team", today);
  saveState();
  renderAll();
  setSyncStatus(`Logged safety video follow-up call for ${rec.driver}.`);
}

function removeSafetyVideoPendingDriver(key) {
  const idx = state.safetyVideos.pending.findIndex((p) => safetyVideoKey(p.driver, p.team) === key);
  if (idx < 0) return;
  const row = state.safetyVideos.pending[idx];
  state.safetyVideos.pending.splice(idx, 1);
  state.safetyVideos.followUps = state.safetyVideos.followUps.filter((f) => f.key !== key);
  saveState();
  renderAll();
  setSyncStatus(`Removed ${row.driver} from Safety Videos follow-up list.`);
}

function setCheckCallOpsStatus(message) {
  const el = document.getElementById("checkCallOpsStatus");
  if (el) el.textContent = message;
}

function addCallActivity(driver, caller, date) {
  const d = normalizeDateInput(date) || todayYmd();
  const canonicalDriver = resolveCanonicalDriverName(driver);
  const callerNorm = String(caller || "Safety Team").trim();
  const existing = (state.callActivity || []).find(
    (a) => normalizeNameKey(a.driver) === normalizeNameKey(canonicalDriver) && normalizeNameKey(a.caller) === normalizeNameKey(callerNorm) && a.date === d
  );
  if (existing) return existing;
  const activity = {
    id: crypto.randomUUID(),
    driver: canonicalDriver,
    caller: callerNorm,
    date: d
  };
  state.callActivity.push(activity);
  return activity;
}

function parseWeeklyCountSheet(rows) {
  const batches = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i] || [];
    const dayRow = rows[i - 1] || [];
    const hasDateRow =
      row.length >= 9 &&
      String(row[8] || "").toLowerCase().includes("total") &&
      [1, 2, 3, 4, 5, 6, 7].some((idx) => normalizeDateInput(row[idx]));
    if (!hasDateRow) {
      i += 1;
      continue;
    }

    const dayLabels = [1, 2, 3, 4, 5, 6, 7].map((idx) => ({
      name: String(dayRow[idx] || "").trim() || ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][idx - 1],
      date: normalizeDateInput(row[idx]) || ""
    }));
    const weekStart = dayLabels[0]?.date || "";
    const weekEnd = dayLabels[6]?.date || "";
    const label = weekStart && weekEnd ? `${weekStart} to ${weekEnd}` : `Week ${batches.length + 1}`;

    const agents = [];
    i += 1;
    while (i < rows.length) {
      const r = rows[i] || [];
      const maybeNext = r.length >= 9 && String(r[8] || "").toLowerCase().includes("total") && [1, 2, 3, 4, 5, 6, 7].some((idx) => normalizeDateInput(r[idx]));
      if (maybeNext) break;
      const name = String(r[0] || "").trim();
      if (!name) {
        i += 1;
        continue;
      }
      const daily = [1, 2, 3, 4, 5, 6, 7].map((idx) => {
        const raw = String(r[idx] ?? "").trim();
        if (!raw) return "";
        if (/^(off|absent)$/i.test(raw)) return raw.toUpperCase();
        const n = Number(raw);
        return Number.isFinite(n) ? String(n) : raw;
      });
      const t = Number(String(r[8] ?? "").trim());
      const total = Number.isFinite(t) ? t : daily.reduce((sum, d) => sum + (Number(d) || 0), 0);
      agents.push({ id: crypto.randomUUID(), name, daily, total });
      i += 1;
    }
    batches.push({
      id: crypto.randomUUID(),
      label,
      weekStart,
      weekEnd,
      dayLabels,
      agents
    });
  }
  return batches;
}

function openDialog({ title, fields, onSubmit }) {
  const dialog = document.getElementById("formDialog");
  const form = document.getElementById("formContent");

  form.innerHTML = `
    <h3>${title}</h3>
    ${fields
      .map((f) => {
        if (f.type === "select") {
          const selectedValue = f.value ?? "";
          return `
            <div class="form-row">
              <label for="${f.id}">${f.label}</label>
              <select id="${f.id}" ${f.required ? "required" : ""}>
                ${f.options.map((o) => `<option value="${o}" ${String(o) === String(selectedValue) ? "selected" : ""}>${o}</option>`).join("")}
              </select>
            </div>
          `;
        }
        const inputType = f.type || "text";
        const inputValue = f.value ?? "";
        return `
          <div class="form-row">
            <label for="${f.id}">${f.label}</label>
            <input id="${f.id}" type="${inputType}" value="${escAttr(inputValue)}" ${f.required ? "required" : ""} />
          </div>
        `;
      })
      .join("")}
    <div class="dialog-actions">
      <button class="btn ghost" value="cancel" formmethod="dialog">Cancel</button>
      <button class="btn" type="submit">Save</button>
    </div>
  `;

  form.onsubmit = (e) => {
    e.preventDefault();
    const values = {};
    fields.forEach((f) => {
      values[f.id] = document.getElementById(f.id).value;
    });
    onSubmit(values);
    dialog.close();
  };

  dialog.showModal();
}

function seedData() {
  state.drivers = [
    { id: crypto.randomUUID(), name: "Alex Carter", safetyScore: 71 },
    { id: crypto.randomUUID(), name: "Tony Reed", safetyScore: 64 },
    { id: crypto.randomUUID(), name: "Jasmine Lee", safetyScore: 83 },
    { id: crypto.randomUUID(), name: "Marco Ruiz", safetyScore: 59 },
    { id: crypto.randomUUID(), name: "Darius Kemp", safetyScore: 76 },
    { id: crypto.randomUUID(), name: "Mina Patel", safetyScore: 68 }
  ];

  state.checkCalls = [
    { id: crypto.randomUUID(), driver: "Alex Carter", lastCheckCall: daysAgoDate(2) },
    { id: crypto.randomUUID(), driver: "Tony Reed", lastCheckCall: daysAgoDate(7) },
    { id: crypto.randomUUID(), driver: "Jasmine Lee", lastCheckCall: daysAgoDate(5) },
    { id: crypto.randomUUID(), driver: "Marco Ruiz", lastCheckCall: daysAgoDate(10) }
  ];

  state.discipline = [
    {
      id: crypto.randomUUID(),
      driver: "Tony Reed",
      level: 3,
      status: "Suspended",
      startDate: daysAgoDate(2),
      endDate: daysAgoDate(-5)
    },
    {
      id: crypto.randomUUID(),
      driver: "Marco Ruiz",
      level: 2,
      status: "Probation",
      startDate: daysAgoDate(4),
      endDate: daysAgoDate(-10)
    }
  ];

  state.kwenTracker = [];
  state.disciplineHistory = [];
  state.checkCallOps = {
    importedAt: null,
    weeklyBatches: []
  };
  state.callActivity = [];
  state.compliance = {
    importedAt: null,
    executiveMetrics: [],
    cases: [],
    repeatOffenders: []
  };
  state.empathy = {
    active: [],
    history: []
  };
  state.addendum = {
    importedAt: null,
    paragraphs: [],
    acknowledgments: []
  };
  state.safetyVideos = {
    importedAt: null,
    pending: [],
    courseAudit: [],
    followUps: []
  };

  saveState();
  renderAll();
}

function daysAgoDate(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function loadSavedSettings() {
  const token = localStorage.getItem(SAMSARA_TOKEN_KEY) || "";
  const tokenInput = document.getElementById("samsaraToken");
  if (tokenInput) tokenInput.value = token;
}

function saveSamsaraToken() {
  const token = (document.getElementById("samsaraToken").value || "").trim();
  localStorage.setItem(SAMSARA_TOKEN_KEY, token);
  setSyncStatus(token ? "Samsara token saved." : "Samsara token cleared.");
}

function setSyncStatus(message) {
  const el = document.getElementById("syncStatus");
  if (!el) return;
  el.textContent = message;
}

function normalizeDateInput(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && value > 20000 && value < 70000) {
    const utcDays = Math.floor(value - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    return dateInfo.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (serial > 20000 && serial < 70000) {
      const utcDays = Math.floor(serial - 25569);
      const utcValue = utcDays * 86400;
      const dateInfo = new Date(utcValue * 1000);
      return dateInfo.toISOString().slice(0, 10);
    }
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cell += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (c === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (c !== "\r") cell += c;
  }
  if (cell.length || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

function findLikelyHeaderRow(rows) {
  const hints = ["driver", "name", "check", "call", "score", "discipline", "status", "date"];
  const limit = Math.min(rows.length, 20);
  let bestIdx = 0;
  let bestScore = -1;

  for (let i = 0; i < limit; i += 1) {
    const cells = (rows[i] || []).map(normalizeHeader).filter(Boolean);
    if (cells.length < 2) continue;
    let score = cells.length;
    cells.forEach((cell) => {
      hints.forEach((hint) => {
        if (cell.includes(hint)) score += 2;
      });
    });
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headerIdx = findLikelyHeaderRow(rows);
  const headers = (rows[headerIdx] || []).map(normalizeHeader);
  const objects = [];

  for (let i = headerIdx + 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    if (!row.some((v) => String(v ?? "").trim())) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      if (!h) return;
      obj[h] = row[idx] ?? "";
    });
    objects.push(obj);
  }
  return objects;
}

function scoreHeaderRow(headers) {
  const joined = headers.map(normalizeHeader).join(" | ");
  let score = headers.length;
  if (joined.includes("driver name")) score += 15;
  if (joined.includes("last check call")) score += 15;
  if (joined.includes("fmt fmtm who executed") || joined.includes("fmt")) score += 10;
  if (joined.includes("days passed since last check call")) score += 10;
  if (joined.includes("status")) score += 4;
  return score;
}

function pickBestWorksheetRows(workbook) {
  let bestRows = [];
  let bestScore = -1;
  workbook.SheetNames.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
    const headerIdx = findLikelyHeaderRow(rows);
    const headerRow = rows[headerIdx] || [];
    const score = scoreHeaderRow(headerRow);
    if (score > bestScore || (score === bestScore && rows.length > bestRows.length)) {
      bestScore = score;
      bestRows = rows;
    }
  });
  return bestRows;
}

function worksheetRows(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
}

function normalizePendingBucketLabel(value) {
  const text = String(value || "").trim();
  const m = text.match(/pending\s+(\d+)\s+courses?/i);
  if (!m) return null;
  return Number(m[1]);
}

function parseFollowUpSheet(rows, team) {
  if (!rows.length) return [];
  const header = rows[0] || [];
  const pendingCols = [];
  header.forEach((cell, idx) => {
    const pendingCount = normalizePendingBucketLabel(cell);
    if (Number.isFinite(pendingCount)) pendingCols.push({ idx, pendingCount });
  });
  if (!pendingCols.length) return [];

  const out = [];
  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r] || [];
    pendingCols.forEach(({ idx, pendingCount }) => {
      const driver = String(row[idx] || "").trim();
      if (!driver || /pending/i.test(driver)) return;
      const email = String(row[idx - 1] || "").trim();
      out.push({
        team,
        driver,
        email,
        pendingCourses: pendingCount
      });
    });
  }
  return out;
}

function parseCompletionAuditSheet(rows, team) {
  const out = [];
  let currentCourse = "";
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const first = String(row[0] || "").trim();
    if (first && /training\s+(video|course)/i.test(first)) {
      currentCourse = first;
      continue;
    }
    const second = String(row[1] || "").trim();
    const summary = String(row[6] || "").trim();
    if (/otr drivers assigned/i.test(second) && summary) {
      out.push({
        team,
        course: currentCourse || "Training Course",
        summary
      });
    }
  }
  return out;
}

function pickValue(obj, keys) {
  const normalizedEntries = Object.entries(obj).map(([k, v]) => [normalizeHeader(k), v]);
  const keySet = new Set(normalizedEntries.map(([k]) => k));

  for (const key of keys) {
    const nk = normalizeHeader(key);
    if (obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== "") {
      return String(obj[key]).trim();
    }
    if (keySet.has(nk)) {
      const val = normalizedEntries.find(([k]) => k === nk)?.[1];
      if (val !== undefined && val !== null && String(val).trim() !== "") return String(val).trim();
    }
    const contains = normalizedEntries.find(([k, v]) => k.includes(nk) && String(v ?? "").trim() !== "");
    if (contains) {
      return String(contains[1]).trim();
    }
  }
  return "";
}

function normalizeNameKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findByDriverNameKey(list, key, accessor) {
  return list.find((item) => normalizeNameKey(accessor(item)) === key);
}

function resolveCanonicalDriverName(name) {
  const key = normalizeNameKey(name);
  if (!key) return "";
  const fromDrivers = findByDriverNameKey(state.drivers, key, (d) => d.name);
  if (fromDrivers) return fromDrivers.name;
  const fromCalls = findByDriverNameKey(state.checkCalls, key, (d) => d.driver);
  if (fromCalls) return fromCalls.driver;
  const fromDiscipline = findByDriverNameKey(state.discipline, key, (d) => d.driver);
  if (fromDiscipline) return fromDiscipline.driver;
  const fromTracker = findByDriverNameKey(state.kwenTracker, key, (d) => d.driver);
  if (fromTracker) return fromTracker.driver;
  return String(name || "").trim();
}

function isDisciplineStatus(value) {
  const normalized = normalizeHeader(value);
  return normalized === "active" || normalized === "probation" || normalized === "suspended";
}

function isValidDate(dateStr) {
  return Boolean(dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr));
}

function upsertDriver(name, safetyScore = null) {
  const rawName = String(name || "").trim();
  const key = normalizeNameKey(rawName);
  if (!key) return null;
  const existing = findByDriverNameKey(state.drivers, key, (d) => d.name);
  if (existing) {
    if (Number.isFinite(safetyScore)) existing.safetyScore = safetyScore;
    return { driver: existing, created: false };
  }
  const added = {
    id: crypto.randomUUID(),
    name: rawName,
    safetyScore: Number.isFinite(safetyScore) ? safetyScore : 0
  };
  state.drivers.push(added);
  return { driver: added, created: true };
}

function upsertCheckCall(driver, date, calledBy = "") {
  const canonicalDriver = resolveCanonicalDriverName(driver);
  if (!canonicalDriver || !date) return;
  const key = normalizeNameKey(canonicalDriver);
  const existing = findByDriverNameKey(state.checkCalls, key, (c) => c.driver);
  if (existing) {
    if (!existing.lastCheckCall || !isValidDate(existing.lastCheckCall) || new Date(date) >= new Date(existing.lastCheckCall)) {
      existing.lastCheckCall = date;
    }
    if (calledBy) existing.lastCaller = calledBy;
    existing.driver = canonicalDriver;
  } else {
    state.checkCalls.push({ id: crypto.randomUUID(), driver: canonicalDriver, lastCheckCall: date, lastCaller: calledBy || "" });
  }
}

function upsertDiscipline(driver, level, status, startDate, endDate) {
  const canonicalDriver = resolveCanonicalDriverName(driver);
  if (!canonicalDriver || !status) return;
  const key = normalizeNameKey(canonicalDriver);
  const existing = findByDriverNameKey(state.discipline, key, (d) => d.driver);
  const payload = {
    id: existing ? existing.id : crypto.randomUUID(),
    driver: canonicalDriver,
    level: Number.isFinite(level) ? level : 1,
    status,
    startDate: startDate || null,
    endDate: endDate || null
  };
  if (existing) {
    Object.assign(existing, payload);
  } else {
    state.discipline.push(payload);
  }
}

function upsertKwenTracker(driver, lastCheckCall, executedBy, daysPassed, status) {
  const canonicalDriver = resolveCanonicalDriverName(driver);
  if (!canonicalDriver) return;
  const key = normalizeNameKey(canonicalDriver);
  const existing = findByDriverNameKey(state.kwenTracker, key, (d) => d.driver);
  const numericDays = Number(daysPassed);
  const normalizedDays = Number.isFinite(numericDays) ? numericDays : null;
  const payload = {
    id: existing ? existing.id : crypto.randomUUID(),
    driver: canonicalDriver,
    lastCheckCall: lastCheckCall || existing?.lastCheckCall || null,
    executedBy: String(executedBy || existing?.executedBy || "").trim(),
    daysPassed: normalizedDays,
    status: String(status || existing?.status || "Current").trim()
  };
  if (existing) {
    const shouldUseNewDate =
      isValidDate(lastCheckCall) && (!isValidDate(existing.lastCheckCall) || new Date(lastCheckCall) >= new Date(existing.lastCheckCall));
    if (shouldUseNewDate) {
      existing.lastCheckCall = lastCheckCall;
      if (!Number.isFinite(payload.daysPassed)) existing.daysPassed = daysSince(lastCheckCall);
    }
    if (payload.executedBy) existing.executedBy = payload.executedBy;
    if (Number.isFinite(payload.daysPassed)) existing.daysPassed = payload.daysPassed;
    if (payload.status) existing.status = payload.status;
    existing.driver = canonicalDriver;
    return;
  }
  if (!Number.isFinite(payload.daysPassed) && isValidDate(payload.lastCheckCall)) {
    payload.daysPassed = daysSince(payload.lastCheckCall);
  }
  state.kwenTracker.push(payload);
}

function mergeListByNameKey(list, accessor, resolver) {
  const map = new Map();
  list.forEach((item) => {
    const key = normalizeNameKey(accessor(item));
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, item);
      return;
    }
    const existing = map.get(key);
    map.set(key, resolver(existing, item));
  });
  return [...map.values()];
}

function dedupeDriverData(options = {}) {
  const { silent = false } = options;
  const beforeCount =
    state.drivers.length +
    state.checkCalls.length +
    state.discipline.length +
    state.kwenTracker.length +
    (state.compliance?.cases?.length || 0) +
    (state.compliance?.repeatOffenders?.length || 0) +
    (state.empathy?.active?.length || 0) +
    (state.empathy?.history?.length || 0) +
    (state.callActivity?.length || 0) +
    (state.safetyVideos?.pending?.length || 0) +
    (state.safetyVideos?.followUps?.length || 0);

  state.drivers = mergeListByNameKey(state.drivers, (d) => d.name, (a, b) => {
    const scoreA = Number(a.safetyScore) || 0;
    const scoreB = Number(b.safetyScore) || 0;
    if (scoreB > scoreA) return { ...a, ...b, name: a.name || b.name };
    return { ...b, ...a, name: a.name || b.name };
  });

  state.checkCalls = mergeListByNameKey(state.checkCalls, (d) => d.driver, (a, b) => {
    const dateA = normalizeDateInput(a.lastCheckCall);
    const dateB = normalizeDateInput(b.lastCheckCall);
    const keepB = isValidDate(dateB) && (!isValidDate(dateA) || new Date(dateB) > new Date(dateA));
    return keepB ? { ...a, ...b } : { ...b, ...a };
  }).map((c) => ({ ...c, driver: resolveCanonicalDriverName(c.driver) }));

  state.discipline = mergeListByNameKey(state.discipline, (d) => d.driver, (a, b) => {
    const dateA = normalizeDateInput(a.startDate);
    const dateB = normalizeDateInput(b.startDate);
    const keepB = isValidDate(dateB) && (!isValidDate(dateA) || new Date(dateB) > new Date(dateA));
    return keepB ? { ...a, ...b } : { ...b, ...a };
  }).map((d) => ({ ...d, driver: resolveCanonicalDriverName(d.driver) }));

  state.kwenTracker = mergeListByNameKey(state.kwenTracker, (d) => d.driver, (a, b) => {
    const dateA = normalizeDateInput(a.lastCheckCall);
    const dateB = normalizeDateInput(b.lastCheckCall);
    const keepB = isValidDate(dateB) && (!isValidDate(dateA) || new Date(dateB) > new Date(dateA));
    return keepB ? { ...a, ...b } : { ...b, ...a };
  }).map((row) => ({ ...row, driver: resolveCanonicalDriverName(row.driver) }));

  if (Array.isArray(state.safetyVideos?.pending)) {
    const dedupPending = [];
    const seenPending = new Set();
    state.safetyVideos.pending.forEach((p) => {
      const canonDriver = resolveCanonicalDriverName(p.driver);
      const key = safetyVideoKey(canonDriver, p.team);
      if (seenPending.has(key)) return;
      seenPending.add(key);
      dedupPending.push({ ...p, driver: canonDriver });
    });
    state.safetyVideos.pending = dedupPending;
  }

  if (Array.isArray(state.safetyVideos?.followUps)) {
    const dedupFollow = [];
    const seenFollow = new Set();
    state.safetyVideos.followUps.forEach((f) => {
      const canonDriver = resolveCanonicalDriverName(f.driver);
      const key = safetyVideoKey(canonDriver, f.team);
      if (seenFollow.has(key)) return;
      seenFollow.add(key);
      dedupFollow.push({ ...f, driver: canonDriver, key });
    });
    state.safetyVideos.followUps = dedupFollow;
  }

  if (Array.isArray(state.compliance?.cases)) {
    state.compliance.cases = state.compliance.cases.map((c) => ({ ...c, driver: resolveCanonicalDriverName(c.driver) }));
  }
  if (Array.isArray(state.compliance?.repeatOffenders)) {
    state.compliance.repeatOffenders = state.compliance.repeatOffenders.map((r) => ({ ...r, driver: resolveCanonicalDriverName(r.driver) }));
  }
  if (Array.isArray(state.empathy?.active)) {
    state.empathy.active = state.empathy.active.map((r) => ({ ...r, driver: resolveCanonicalDriverName(r.driver) }));
  }
  if (Array.isArray(state.empathy?.history)) {
    state.empathy.history = state.empathy.history.map((r) => ({ ...r, driver: resolveCanonicalDriverName(r.driver) }));
  }
  if (Array.isArray(state.callActivity)) {
    state.callActivity = state.callActivity.map((c) => ({ ...c, driver: resolveCanonicalDriverName(c.driver) }));
  }

  const afterCount =
    state.drivers.length +
    state.checkCalls.length +
    state.discipline.length +
    state.kwenTracker.length +
    (state.compliance?.cases?.length || 0) +
    (state.compliance?.repeatOffenders?.length || 0) +
    (state.empathy?.active?.length || 0) +
    (state.empathy?.history?.length || 0) +
    (state.callActivity?.length || 0) +
    (state.safetyVideos?.pending?.length || 0) +
    (state.safetyVideos?.followUps?.length || 0);
  const merged = Math.max(0, beforeCount - afterCount);

  if (!silent) {
    saveState();
    renderAll();
    setSyncStatus(`Deduplication complete. Merged ${merged} duplicate records across drivers, calls, discipline, and tracker rows.`);
  }
  return { merged };
}

async function importCsvFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    const lowerName = file.name.toLowerCase();
    let records = [];

    if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
      if (typeof XLSX === "undefined") {
        setSyncStatus("Excel parser not loaded. Refresh page and try again.");
        return;
      }
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const bestSheetRows = pickBestWorksheetRows(workbook);
      records = rowsToObjects(bestSheetRows);
    } else {
      const text = await file.text();
      const rows = parseCsv(text);
      records = rowsToObjects(rows);
    }

    if (!records.length) {
      setSyncStatus("Import failed: no data rows found.");
      return;
    }
    let importedRows = 0;
    let importedDrivers = 0;
    let importedCalls = 0;
    let importedDiscipline = 0;

    for (const record of records) {
      const name = pickValue(record, ["driver name", "driver", "name", "employee", "driver/employee"]);
      if (!name) continue;
      importedRows += 1;

      const scoreRaw = pickValue(record, ["safety score", "score", "samsara score"]);
      const safetyScore = Number(scoreRaw);
      const driverResult = upsertDriver(name, Number.isFinite(safetyScore) ? safetyScore : null);
      if (driverResult?.created) importedDrivers += 1;

      const lastCall = normalizeDateInput(
        pickValue(record, [
          "last check call date",
          "last check call",
          "last_check_call",
          "check call date",
          "last call",
          "last called",
          "date last called"
        ])
      );
      const daysPassedRaw = pickValue(record, ["days passed since last check call", "days passed", "days since"]);
      const executedBy = pickValue(record, ["fmt/fmtm who executed", "fmt fmtm who executed", "fmt", "fmtm", "who executed"]);
      const statusRaw = pickValue(record, ["status", "priority", "call status", "discipline status", "disciplinary status"]);
      upsertKwenTracker(name, lastCall, executedBy, daysPassedRaw, statusRaw || "Current");

      if (lastCall) {
        upsertCheckCall(name, lastCall);
        importedCalls += 1;
      }

      const levelText = pickValue(record, ["discipline level", "level", "disciplinary level"]);
      const levelMatch = levelText.match(/\d+/);
      const levelRaw = Number(levelMatch ? levelMatch[0] : levelText);
      const disciplineStatusRaw = pickValue(record, ["discipline status", "disciplinary status"]);
      const status = disciplineStatusRaw || (isDisciplineStatus(statusRaw) ? statusRaw : "");
      const startDate = normalizeDateInput(pickValue(record, ["discipline start", "start date", "start"]));
      const endDate = normalizeDateInput(pickValue(record, ["discipline end", "end date", "end"]));
      if (isDisciplineStatus(status)) {
        upsertDiscipline(name, levelRaw, status, startDate, endDate);
        importedDiscipline += 1;
      }
    }

    const dedupeCounts = dedupeDriverData({ silent: true });

    saveState();
    renderAll();
    setSyncStatus(
      `Import complete. Rows: ${importedRows}, new drivers: ${importedDrivers}, check calls: ${importedCalls}, discipline updates: ${importedDiscipline}, duplicates merged: ${dedupeCounts.merged}.`
    );
  } catch (error) {
    setSyncStatus(`Import failed: ${error.message || "unknown error"}`);
  } finally {
    event.target.value = "";
  }
}

async function importCheckCallWorkbook(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    const lowerName = file.name.toLowerCase();
    if (!(lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls"))) {
      setSyncStatus("Check call import requires an .xlsx/.xls workbook.");
      return;
    }
    if (typeof XLSX === "undefined") {
      setSyncStatus("Excel parser not loaded. Refresh page and try again.");
      return;
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const freqSheet = workbook.Sheets["Driver Check Call Frequency"];
    const weeklySheet = workbook.Sheets["WEEKLY CHECK CALL COUNT"];
    if (!freqSheet) {
      setSyncStatus("Workbook missing 'Driver Check Call Frequency' sheet.");
      return;
    }

    const freqRows = XLSX.utils.sheet_to_json(freqSheet, { defval: "" });
    let importedDrivers = 0;
    let importedCalls = 0;
    let importedFreq = 0;

    freqRows.forEach((row) => {
      const name = String(row["Driver Name:"] || row["Driver Name"] || "").trim();
      if (!name) return;
      const lastCheckCall = normalizeDateInput(row["Last Check Call Date"]);
      const calledBy = String(row["FMT/FMTM who executed"] || "").trim();
      const daysRaw = Number(row["Days passed since last check call"]);
      const status = String(row["Status"] || "").trim() || (Number.isFinite(daysRaw) && daysRaw >= 7 ? "HIGH PRIORITY" : "Current");
      const before = state.drivers.length;
      upsertDriver(name, null);
      if (state.drivers.length > before) importedDrivers += 1;
      if (lastCheckCall) {
        upsertCheckCall(name, lastCheckCall, calledBy);
        if (calledBy) addCallActivity(name, calledBy, lastCheckCall);
        importedCalls += 1;
      }
      upsertKwenTracker(name, lastCheckCall, calledBy, Number.isFinite(daysRaw) ? daysRaw : "", status);
      importedFreq += 1;
    });

    let weeklyBatches = [];
    if (weeklySheet) {
      const weeklyRows = XLSX.utils.sheet_to_json(weeklySheet, { header: 1, defval: "" });
      weeklyBatches = parseWeeklyCountSheet(weeklyRows);
    }
    state.checkCallOps = {
      importedAt: new Date().toISOString(),
      weeklyBatches
    };
    selectedWeeklyBatchIndex = 0;
    dedupeDriverData({ silent: true });
    saveState();
    renderAll();
    const importedAtText = state.checkCallOps.importedAt ? new Date(state.checkCallOps.importedAt).toLocaleString() : "";
    setCheckCallOpsStatus(
      `Check call workbook import complete (${importedAtText}). Frequency rows: ${importedFreq}, new drivers: ${importedDrivers}, call updates: ${importedCalls}, weekly sets: ${weeklyBatches.length}.`
    );
    setSyncStatus("Check call workbook imported successfully.");
  } catch (error) {
    setSyncStatus(`Check call workbook import failed: ${error.message || "unknown error"}`);
  } finally {
    event.target.value = "";
  }
}

async function importSafetyVideosWorkbook(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    const lowerName = file.name.toLowerCase();
    if (!(lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls"))) {
      setSyncStatus("Safety video import requires an .xlsx/.xls workbook.");
      return;
    }
    if (typeof XLSX === "undefined") {
      setSyncStatus("Excel parser not loaded. Refresh page and try again.");
      return;
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const otrRows = worksheetRows(workbook, "OTR - Follow Up");
    const ag4Rows = worksheetRows(workbook, "AG4 - Follow Up");
    const ajgAuditRows = worksheetRows(workbook, "(AJG) Completion Auditing");
    const ag4AuditRows = worksheetRows(workbook, "(AG4) Completion Auditing");

    const pendingRaw = [...parseFollowUpSheet(otrRows, "OTR"), ...parseFollowUpSheet(ag4Rows, "AG4")];
    const pendingMap = new Map();
    pendingRaw.forEach((row) => {
      const key = `${normalizeNameKey(row.driver)}::${row.team}`;
      if (!key.startsWith("::")) pendingMap.set(key, row);
      upsertDriver(row.driver, null);
    });
    const pending = [...pendingMap.values()];

    const courseAudit = [
      ...parseCompletionAuditSheet(ajgAuditRows, "AJG"),
      ...parseCompletionAuditSheet(ag4AuditRows, "AG4")
    ];

    const oldFollowUps = Array.isArray(state.safetyVideos?.followUps) ? state.safetyVideos.followUps : [];
    const followMap = new Map(oldFollowUps.map((f) => [f.key, f]));
    const followUps = pending.map((row) => {
      const key = safetyVideoKey(row.driver, row.team);
      const existing = followMap.get(key);
      return (
        existing || {
          id: crypto.randomUUID(),
          key,
          driver: row.driver,
          team: row.team,
          called: false,
          lastCalled: null,
          nextFollowUp: null
        }
      );
    });

    state.safetyVideos = {
      importedAt: new Date().toISOString(),
      pending,
      courseAudit,
      followUps
    };
    dedupeDriverData({ silent: true });

    saveState();
    renderAll();
    setSyncStatus(
      `Safety videos import complete. Pending drivers: ${pending.length}, course audits: ${courseAudit.length}.`
    );
  } catch (error) {
    setSyncStatus(`Safety videos import failed: ${error.message || "unknown error"}`);
  } finally {
    event.target.value = "";
  }
}

function asRowArray(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
}

function asObjectRows(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

function formatSheetDate(value) {
  const d = normalizeDateInput(value);
  return d || String(value || "").trim();
}

async function importComplianceWorkbook(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    const lowerName = file.name.toLowerCase();
    if (!(lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls"))) {
      setSyncStatus("Compliance import requires an .xlsx/.xls workbook.");
      return;
    }
    if (typeof XLSX === "undefined") {
      setSyncStatus("Excel parser not loaded. Refresh page and try again.");
      return;
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const summaryRows = asRowArray(workbook.Sheets["Executive Summary"] || workbook.Sheets[workbook.SheetNames[0]]);
    const allCaseRows = asObjectRows(workbook.Sheets["All Driver Cases"] || workbook.Sheets[workbook.SheetNames[1]]);
    const repeatRows = asObjectRows(workbook.Sheets["Repeat Offenders - Priority"] || workbook.Sheets[workbook.SheetNames[2]]);

    const executiveMetrics = [];
    summaryRows.forEach((r) => {
      const k = String(r[0] || "").trim();
      const v = String(r[1] || "").trim();
      if (k && v && !k.toLowerCase().includes("category")) executiveMetrics.push({ label: k, value: v });
    });

    const existingMap = new Map((state.compliance.cases || []).map((c) => [String(c.caseNo || "").toLowerCase(), c]));
    const parsedCases = [];
    allCaseRows.forEach((r) => {
      const driver = String(r["Driver Name"] || "").trim();
      const caseNo = String(r["Case #"] || "").trim();
      if (!driver || !caseNo) return;
      const existing = existingMap.get(caseNo.toLowerCase());
      const payload = {
        id: existing?.id || crypto.randomUUID(),
        driver,
        caseNo,
        reportDate: formatSheetDate(r["Report Date"]),
        incidentDate: formatSheetDate(r["Incident Date"]),
        nature: String(r["Nature"] || "").trim(),
        description: String(r["Description"] || "").trim(),
        reporter: String(r["Reporter"] || "").trim(),
        vehicle: String(r["Vehicle"] || "").trim(),
        actionsTaken: String(r["Actions Taken"] || "").trim(),
        notes: String(r["Notes"] || "").trim(),
        completed: Boolean(existing?.completed),
        completedAt: existing?.completedAt || null,
        needsFollowUp: existing ? !existing.completed : true,
        lastCheckCall: existing?.lastCheckCall || null
      };
      parsedCases.push(payload);
      upsertDriver(driver, null);
    });

    const repeatOffenders = repeatRows
      .map((r) => ({
        id: crypto.randomUUID(),
        driver: String(r["Driver Name"] || "").trim(),
        totalCases: Number(r["Total Cases"] || 0) || 0,
        firstIncident: formatSheetDate(r["First Incident"]),
        latestIncident: formatSheetDate(r["Latest Incident"]),
        incidentTypes: String(r["Incident Types"] || "").trim(),
        summary: String(r["Summary"] || "").trim()
      }))
      .filter((r) => r.driver);

    state.compliance = {
      importedAt: new Date().toISOString(),
      executiveMetrics,
      cases: parsedCases,
      repeatOffenders
    };
    dedupeDriverData({ silent: true });

    saveState();
    renderAll();
    setSyncStatus(`Compliance import complete. Cases: ${parsedCases.length}, repeat offenders: ${repeatOffenders.length}.`);
  } catch (error) {
    setSyncStatus(`Compliance import failed: ${error.message || "unknown error"}`);
  } finally {
    event.target.value = "";
  }
}

async function importAddendumDocx(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".docx")) {
      setSyncStatus("Addendum import requires a .docx file.");
      return;
    }
    if (typeof mammoth === "undefined") {
      setSyncStatus("DOCX parser not loaded. Refresh page and try again.");
      return;
    }

    const buffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    const paragraphs = String(result.value || "")
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean);

    state.addendum = {
      ...state.addendum,
      importedAt: new Date().toISOString(),
      paragraphs
    };
    saveState();
    renderAll();
    setSyncStatus(`Addendum import complete. Paragraphs loaded: ${paragraphs.length}.`);
  } catch (error) {
    setSyncStatus(`Addendum import failed: ${error.message || "unknown error"}`);
  } finally {
    event.target.value = "";
  }
}

async function syncSamsaraDrivers() {
  const token = (document.getElementById("samsaraToken").value || "").trim();
  if (!token) {
    setSyncStatus("Add a Samsara API token first.");
    return;
  }

  setSyncStatus("Syncing drivers from Samsara...");
  let drivers;
  try {
    const response = await fetch("/api/samsara/drivers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    drivers = Array.isArray(payload.drivers) ? payload.drivers : [];
  } catch (error) {
    setSyncStatus(`Samsara sync failed: ${error.message || "proxy request error"}.`);
    return;
  }

  let added = 0;
  drivers.forEach((d) => {
    const name = d.name || d.driverName || d.username || "";
    if (!name) return;
    const score = Number(d.safetyScore ?? d.safety_score ?? d.score);
    const result = upsertDriver(name, Number.isFinite(score) ? score : null);
    if (result?.created) added += 1;
  });

  dedupeDriverData({ silent: true });

  saveState();
  renderAll();
  setSyncStatus(`Samsara sync complete. Retrieved: ${drivers.length}, new drivers added: ${added}.`);
}
