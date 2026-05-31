let isSidebarCollapsed = false;
let activeInterval = null;
let programsList = [];
let selectedWeekRow = 3;
let selectedTerm = "Select Term"; // UI text
let selectedTermId = null; // ✅ real nstp_term.id from DB
let selectedTermLabel = ""; // optional, for display
const now = new Date();
let selectedDate = now.getDate();
let isCalendarOpen = false;
let isTermDropdownOpen = false;
let selectedSectionFilter = "All"; // "All" or "A".."Z"
let selectedProgramFilter = "All"; // "All" or "ROTC"/"CWTS"/etc
// store DB terms
let reportTerms = [];
const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

let selectedYear = now.getFullYear();
let selectedMonthIndex = now.getMonth(); // 0-11

let currentPage = 1;
let rowsPerPage = 10;
let searchTermValue = "";

// Database logic
let reportRows = []; // aggregated per student (what table uses)
let reportMeta = {
  // totals for stats cards
  present: 0,
  late: 0,
  earlyOut: 0,
  absent: 0,
  excused: 0,
  totalMarks: 0,
};

function isReportVisible() {
  const statsContainer = document.getElementById("stats-container");
  const tableCard = document.getElementById("table-card");
  return !!(
    statsContainer &&
    tableCard &&
    !statsContainer.classList.contains("hidden") &&
    !tableCard.classList.contains("hidden")
  );
}
window.isReportVisible = isReportVisible;
// async function loadPrograms() {
//   try {
//     const res = await fetch("/api/report/programs", { credentials: "include" });
//     if (!res.ok) throw new Error("Failed to load programs");
//     const data = await res.json().catch(() => ({}));

//     // support {programs:[...]} OR direct array
//     const list = Array.isArray(data)
//       ? data
//       : Array.isArray(data.programs)
//         ? data.programs
//         : [];

//     // normalize to array of names
//     programsList = list
//       .map((p) => (typeof p === "string" ? p : p.program_name || p.name || ""))
//       .map((s) => String(s || "").trim())
//       .filter(Boolean);

//     // unique + sort
//     programsList = Array.from(new Set(programsList)).sort((a, b) =>
//       a.localeCompare(b),
//     );
//   } catch (e) {
//     console.warn("loadPrograms failed, fallback to reportRows:", e.message);

//     // fallback: build from reportRows if API fails
//     const set = new Set();
//     for (const s of reportRows || []) {
//       const p = String(s.prog || "").trim();
//       if (p) set.add(p);
//     }
//     programsList = Array.from(set).sort((a, b) => a.localeCompare(b));
//   }

//   renderProgramDropdown(); // render after load
// }
// window.loadPrograms = loadPrograms;
function renderProgramDropdown() {
  const cont = document.getElementById("program-list-container");
  if (!cont) return;

  // Build buttons
  cont.innerHTML = "";

  const makeBtn = (label) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "w-full text-center py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 border border-slate-50 rounded-lg";
    btn.textContent = label;
    btn.dataset.value = label;
    return btn;
  };

  cont.appendChild(makeBtn("All"));

  for (const p of programsList || []) {
    cont.appendChild(makeBtn(p));
  }

  // ✅ IMPORTANT: stop clicks from bubbling to window.onclick (which closes stuff)
  cont.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const btn = ev.target.closest("button[data-value]");
    if (!btn) return;

    selectOption("program", btn.dataset.value);
  });
}
window.renderProgramDropdown = renderProgramDropdown;
function simpleModal(title, msg) {
  openModal(
    `
    <div class="p-10 text-center">
      <h2 class="text-xl font-black text-darkCyan-950 mb-2 uppercase">${title}</h2>
      <p class="text-slate-500 text-sm mb-8">${msg}</p>
      <button onclick="closeModal()" class="w-full py-4 bg-darkCyan-950 text-white rounded-2xl font-black uppercase tracking-widest text-[10px]">
        Close
      </button>
    </div>
  `,
    "max-w-lg",
  );
}
window.simpleModal = simpleModal;

function openModal(html, maxClass = "max-w-lg") {
  const overlay = document.getElementById("modal-overlay");
  const container = document.getElementById("modal-container");
  if (!overlay || !container) return;

  // reset sizing classes
  container.classList.remove("max-w-lg", "max-w-2xl", "max-w-5xl");
  container.classList.add(maxClass);

  // set initial anim state
  container.classList.add("scale-95", "opacity-0");
  container.classList.remove("scale-100", "opacity-100");

  container.innerHTML = html;
  overlay.classList.remove("hidden");

  // animate in
  requestAnimationFrame(() => {
    container.classList.replace("scale-95", "scale-100");
    container.classList.replace("opacity-0", "opacity-100");
  });
}
function confirmLogout() {
  const modal = document.getElementById("logoutModal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

const logoutModal = document.getElementById("logoutModal");
const btnCancelLogout = document.getElementById("btnCancelLogout");
const btnConfirmLogout = document.getElementById("btnConfirmLogout");
const btnCloseModal = document.getElementById("btnCloseModal");

function closeLogoutModal() {
  logoutModal.classList.add("hidden");
  logoutModal.classList.remove("flex");
}

btnCancelLogout.onclick = closeLogoutModal;
btnCloseModal.onclick = closeLogoutModal;

btnConfirmLogout.onclick = function () {
  doLogout();
  // clear session if needed
  localStorage.removeItem("token");

  // redirect
  window.location.href = "../MT_login/MT_login.html";
};

function ensureActiveTermSelected() {
  if (selectedTermId) return;

  const toBoolActive = (v) => {
    if (v === true) return true;
    if (v === 1) return true;
    const s = String(v ?? "")
      .toLowerCase()
      .trim();
    return s === "1" || s === "true" || s === "yes" || s === "active";
  };

  const active =
    reportTerms.find((t) => toBoolActive(t.is_active)) ||
    reportTerms[0] ||
    null;
  if (!active) return;

  const tid =
    Number(active.term_id ?? active.id ?? active.nstp_term_id ?? 0) || null;
  const label =
    active.label ||
    `${active.semester || active.nstp_semester || "Semester"}, ${active.year || active.nstp_year || ""}`.trim();

  selectedTermId = tid;
  selectedTerm = label || "Select Term";
  selectedTermLabel = selectedTerm;
}

async function doLogout() {
  try {
    await fetch("/api/nstp/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch (e) {
    console.warn("Logout request failed:", e);
  } finally {
    try {
      localStorage.removeItem("backupUser");
      localStorage.removeItem("loggedUser");
      localStorage.removeItem("nstp_school_id");
      localStorage.removeItem("nstp_attendance_last_date_ui");
      localStorage.removeItem("mt_sidebar_expanded");
      localStorage.removeItem("token");
      sessionStorage.clear();
    } catch (e) {
      console.warn("Storage cleanup failed:", e);
    }

    closeLogoutModal();
    window.location.href = "../MT_login/MT_login.html";
  }
}
function mapStatusLabel(status) {
  const s = (status || "").toLowerCase().trim();

  if (s === "green") return "Present";
  if (s === "yellow") return "Late";
  if (s === "red") return "Absent";
  if (s === "gray") return "Excused";
  if (s === "blue") return "Early Out";

  return "-";
}
// async function loadReportTerms() {
//   const res = await fetch("/api/report/terms", { credentials: "include" });
//   if (!res.ok) {
//     const msg = await res.text().catch(() => "");
//     throw new Error(msg || "Failed to load report terms");
//   }

//   const data = await res.json().catch(() => ({}));

//   // ✅ support {terms:[...]} OR direct array
//   const list = Array.isArray(data)
//     ? data
//     : Array.isArray(data.terms)
//       ? data.terms
//       : [];
//   reportTerms = list;

//   // helpers
//   const toBoolActive = (v) => {
//     if (v === true) return true;
//     if (v === 1) return true;
//     const s = String(v ?? "")
//       .toLowerCase()
//       .trim();
//     return s === "1" || s === "true" || s === "yes" || s === "active";
//   };

//   const getTid = (t) =>
//     Number(t?.term_id ?? t?.id ?? t?.nstp_term_id ?? 0) || null;

//   const getLabel = (t) =>
//     t?.label ||
//     `${t?.semester || t?.nstp_semester || "Semester"}, ${t?.year || t?.nstp_year || ""}`.trim();

//   // ✅ choose active first, else first item
//   const active =
//     reportTerms.find((t) => toBoolActive(t.is_active)) ||
//     reportTerms[0] ||
//     null;

//   if (active) {
//     selectedTermId = getTid(active);
//     selectedTerm = getLabel(active) || "Select Term";
//     selectedTermLabel = selectedTerm;
//   }

//   return reportTerms;
// }
function renderStats() {
  const statsContainer = document.getElementById("stats-container");
  if (!statsContainer) return;

  // you can keep icons/HTML, just swap values:
  statsContainer.innerHTML = `
    <div onclick="openStatsModal('Early Out')" class="stat-card clickable-stat bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm relative">
  <div class="flex justify-between items-start mb-2">
    <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Early Out</span>
    <div class="w-8 h-8 bg-sky-50 rounded-lg flex items-center justify-center text-sky-600 shadow-sm">
      <i class="fa-solid fa-person-hiking"></i>
    </div>
  </div>
  <p class="text-3xl font-black text-slate-800">${reportMeta.earlyOut}</p>
  <p class="text-[9px] text-slate-400 font-bold mt-2">Computed from In/Out rules</p>
</div>

    <div onclick="openStatsModal('Present')" class="stat-card clickable-stat bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
      <div class="flex justify-between items-start mb-2">
        <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Present</span>
        <div class="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600 shadow-sm">
          <i class="fa-solid fa-user-check"></i>
        </div>
      </div>
      <p class="text-3xl font-black text-slate-800">${reportMeta.present}</p>
    </div>

    <div onclick="openStatsModal('Late')" class="stat-card clickable-stat bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
      <div class="flex justify-between items-start mb-2">
        <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Lates</span>
        <div class="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center text-amber-500 shadow-sm">
          <i class="fa-solid fa-clock-rotate-left"></i>
        </div>
      </div>
      <p class="text-3xl font-black text-slate-800">${reportMeta.late}</p>
    </div>

    <div onclick="openStatsModal('Excused')" class="stat-card clickable-stat bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
      <div class="flex justify-between items-start mb-2">
        <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Excused</span>
        <div class="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600 shadow-sm">
          <i class="fa-solid fa-handshake"></i>
        </div>
      </div>
      <p class="text-3xl font-black text-slate-800">${reportMeta.excused}</p>
    </div>

    <div onclick="openStatsModal('Absent')" class="stat-card clickable-stat bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
      <div class="flex justify-between items-start mb-2">
        <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Absent</span>
        <div class="w-8 h-8 bg-rose-50 rounded-lg flex items-center justify-center text-rose-600 shadow-sm">
          <i class="fa-solid fa-user-xmark"></i>
        </div>
      </div>
      <p class="text-3xl font-black text-slate-800">${reportMeta.absent}</p>
    </div>
  `;
}

// async function fetchReportFromDB() {
//   if (!activeInterval) return;

//   const params = new URLSearchParams();
//   params.set("interval", activeInterval);

//   if (activeInterval === "day") {
//     const mm = String(selectedMonthIndex + 1).padStart(2, "0");
//     const dd = String(selectedDate).padStart(2, "0");
//     const iso = `${selectedYear}-${mm}-${dd}`;
//     params.set("date", iso);
//   } else if (activeInterval === "weekly") {
//     params.set("year", String(selectedYear));
//     params.set("month", String(selectedMonthIndex + 1)); // 1-12
//     params.set("weekRow", String(selectedWeekRow));
//   } else if (activeInterval === "semester") {
//     if (!selectedTermId) {
//       simpleModal("Missing Term", "Please select a term first.");
//       return;
//     }
//     params.set("term_id", String(selectedTermId));
//   }

//   const res = await fetch(`/api/report/attendance?${params.toString()}`, {
//     credentials: "include",
//     headers: { Accept: "application/json" },
//   });

//   if (!res.ok) throw new Error("Failed to fetch report");

//   const data = await res.json().catch(() => ({}));
//   const { rows } = buildAggregatedReport(data.logs || []);

//   // ✅ only load remarks in semester view
//   if (activeInterval === "semester" && selectedTermId) {
//     const remarkMap = await loadRemarksForTerm(selectedTermId);

//     for (const s of rows) {
//       const saved = remarkMap.get(String(s.id));
//       if (saved != null && String(saved).trim() !== "") {
//         s.rem = String(saved);
//       } else {
//         s.rem = s.rem || s.autoRem || "";
//       }
//     }
//   }

//   reportRows = rows;
//   currentPage = 1;

//   renderTable();
//   renderStats();
//   initProgramDropdownFromReportRows();
// }

const REPORT_ENDPOINTS = {
  remarks: (termId) =>
    `/api/report/remarks?term_id=${encodeURIComponent(termId)}`,
  saveRemark: (sid) => `/api/report/remarks/${encodeURIComponent(sid)}`,
};

async function loadRemarksForTerm(termId) {
  if (!termId) return new Map();

  const res = await fetch(REPORT_ENDPOINTS.remarks(termId), {
    credentials: "include",
  });
  if (!res.ok) return new Map();

  const data = await res.json().catch(() => ({}));

  // supports: { remarks: [...] } OR direct array
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data.remarks)
      ? data.remarks
      : [];

  const map = new Map();
  for (const r of list) {
    const sid = r.student_school_id || r.school_id || r.student_id || r.id;
    const remark = r.remark ?? r.rem ?? r.text ?? "";
    if (!sid) continue;
    map.set(String(sid), String(remark || ""));
  }
  return map;
}
function buildAggregatedReport(logs) {
  const byStudent = new Map();
  const seen = new Set(); // sid|date dedupe

  reportMeta = {
    present: 0,
    late: 0,
    earlyOut: 0,
    absent: 0,
    excused: 0,
    totalMarks: 0,
  };

  for (const r of logs) {
    const sid = r.student_school_id || r.school_id || r.student_id || r.id;
    const date = toISODateOnly(r.session_date);
    if (!sid || !date) continue;

    const dedupeKey = `${sid}|${date}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const fullName = `${r.last_name || ""}, ${r.first_name || ""}`.trim();

    if (!byStudent.has(String(sid))) {
      byStudent.set(String(sid), {
        id: String(sid),
        name: fullName,
        sec: r.section || "",
        prog: r.program_name || r.program || "",
        present: 0,
        late: 0,
        earlyOut: 0,
        absent: 0,
        excused: 0,
        rem: "", // admin remark (from DB)
        autoRem: "", // computed remark
        history: [],
      });
    }

    const s = byStudent.get(String(sid));
    const mark = computeSessionMark(r.in_status, r.out_status);

    s.history.push({
      date,
      mark,
      in_status: r.in_status,
      out_status: r.out_status,
      in_time: r.in_time,
      out_time: r.out_time,
    });

    if (mark === "present") s.present++;
    else if (mark === "late") s.late++;
    else if (mark === "early_out") s.earlyOut++;
    else if (mark === "excused") s.excused++;
    else s.absent++;

    reportMeta.totalMarks++;
    if (mark === "present") reportMeta.present++;
    else if (mark === "late") reportMeta.late++;
    else if (mark === "early_out") reportMeta.earlyOut++;
    else if (mark === "excused") reportMeta.excused++;
    else reportMeta.absent++;
  }

  const rows = Array.from(byStudent.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  // ✅ compute auto remark but DO NOT overwrite admin remark
  for (const s of rows) {
    s.autoRem = getStatusInfo(
      s.present,
      s.late,
      s.earlyOut,
      s.absent,
      s.excused,
    ).text;
    if (!String(s.rem || "").trim()) s.rem = s.autoRem;
  }

  return { rows };
}
function updateClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (document.getElementById("header-clock"))
    document.getElementById("header-clock").innerText = timeStr;
}
setInterval(updateClock, 1000);

function getCalendarMeta(year, monthIndex) {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate(); // last day of month
  const firstDow = new Date(year, monthIndex, 1).getDay(); // 0=Sun ... 6=Sat
  const totalCells = firstDow + daysInMonth;
  const rows = Math.ceil(totalCells / 7);
  return { daysInMonth, firstDow, rows };
}
window.getCalendarMeta = getCalendarMeta;
function updateHeaderDate() {
  const el = document.getElementById("header-date");
  if (!el) return;

  const now = new Date();

  // Example: "Mon, Mar 2, 2026"
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric",
  });

  el.innerText = dateStr;
}

// run once immediately
updateHeaderDate();

// update every minute (date changes at midnight anyway)
setInterval(updateHeaderDate, 60 * 1000);

/* =========================
   MODERN SIDEBAR (Dashboard-style) — REPORTS
========================= */
(function initModernSidebar() {
  const sidebar = document.getElementById("sidebar");
  const indicator = document.getElementById("indicator");
  const navItems = Array.from(document.querySelectorAll(".nav-item"));
  const btnToggle = document.getElementById("btnToggleSidebar");

  // Match your reports.html spacing
  const ITEM_HEIGHT = 52;
  const ITEM_GAP = 14;

  if (!sidebar || navItems.length === 0) {
    console.warn("Modern sidebar init skipped: missing #sidebar or .nav-item");
    return;
  }

  // ---------- state (persist) ----------
  let isSidebarExpanded = true; // default expanded
  try {
    const saved = localStorage.getItem("mt_sidebar_expanded");
    if (saved === "1") isSidebarExpanded = true;
    else if (saved === "0") isSidebarExpanded = false;
  } catch {}

  function applySidebarState() {
    sidebar.classList.toggle("expanded", isSidebarExpanded);
  }

  // ---------- indicator helpers ----------
  function getIndexOf(btn) {
    const di = Number(btn?.dataset?.index);
    if (!Number.isNaN(di)) return di;
    return Math.max(0, navItems.indexOf(btn));
  }

  function updateIndicatorByIndex(index) {
    if (!indicator) return;
    const topPosition = index * (ITEM_HEIGHT + ITEM_GAP);
    indicator.style.top = `${topPosition}px`;
  }

  function getActiveBtn() {
    // Prefer .active from HTML
    let activeBtn = navItems.find((b) => b.classList.contains("active"));

    // ✅ If none is marked active, default to "reports" for this page
    if (!activeBtn)
      activeBtn = navItems.find(
        (b) => (b.dataset.route || b.getAttribute("data-route")) === "reports",
      );
    if (!activeBtn) activeBtn = navItems[0];
    return activeBtn;
  }

  function moveIndicatorToActive() {
    const activeBtn = getActiveBtn();
    const idx = getIndexOf(activeBtn);
    updateIndicatorByIndex(idx);
  }

  function setActiveNav(targetBtn) {
    navItems.forEach((b) => b.classList.remove("active"));
    targetBtn.classList.add("active");
    moveIndicatorToActive();
  }

  // ---------- routing ----------
  const ROUTES = {
    dashboard: "../MT_dashboard/MT_dashboard.html",
    attendance: "../MT_attendance/MT_attendance.html",
    reports: "../MT_report/MT_report.html",
    settings: "../MT_settings/MT_settings.html",
  };

  function handleModernRoute(route) {
    const url = ROUTES[route];
    if (!url) return;
    window.location.href = url;
  }

  // ---------- init ----------
  applySidebarState();

  // align indicator after layout
  requestAnimationFrame(() => {
    const activeBtn = getActiveBtn();
    // ensure the default active is applied visually if HTML forgot "active"
    if (activeBtn && !activeBtn.classList.contains("active"))
      activeBtn.classList.add("active");
    moveIndicatorToActive();
  });

  // toggle expand/collapse
  if (btnToggle) {
    btnToggle.addEventListener("click", (e) => {
      e.preventDefault();
      isSidebarExpanded = !isSidebarExpanded;
      try {
        localStorage.setItem(
          "mt_sidebar_expanded",
          isSidebarExpanded ? "1" : "0",
        );
      } catch {}
      applySidebarState();
      moveIndicatorToActive();
    });
  }

  // nav clicks
  navItems.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      setActiveNav(btn);

      const route = btn.dataset.route || btn.getAttribute("data-route") || "";
      handleModernRoute(route);
    });
  });

  // keep aligned on resize
  window.addEventListener("resize", () => moveIndicatorToActive());
})();

// 1 session -> 1 computed mark
function computeSessionMark(inStatus, outStatus) {
  const IN = (inStatus || "").toLowerCase(); // green/yellow/gray/red/blue/null
  const OUT = (outStatus || "").toLowerCase();

  // RULE: if either is gray => EXCUSED
  if (IN === "gray" || OUT === "gray") return "excused";

  const inMissing = !IN;
  const outMissing = !OUT;

  const inRed = IN === "red";
  const outRed = OUT === "red";

  // RULE: no in or out OR both red => ABSENT
  if ((inMissing && outMissing) || (inRed && outRed)) return "absent";

  // RULE: in green + out red => EARLY OUT (blue)
  if (IN === "green" && OUT === "blue") return "early_out";

  // RULE: in yellow + out green => LATE
  if (IN === "yellow" && OUT === "green") return "late";

  // RULE: in green + out green => PRESENT
  if (IN === "green" && OUT === "green") return "present";

  // RULE: no in but out green => LATE
  if (inMissing && OUT === "green") return "late";

  // Sensible fallbacks (to avoid “unknown”)
  if (IN === "yellow") return "late";
  if (IN === "green" || OUT === "green") return "present";

  return "absent";
}

function changeMonth(delta) {
  selectedMonthIndex += delta;

  if (selectedMonthIndex < 0) {
    selectedMonthIndex = 11;
    selectedYear -= 1;
  } else if (selectedMonthIndex > 11) {
    selectedMonthIndex = 0;
    selectedYear += 1;
  }

  // clamp selectedDate to valid days in that month
  const daysInMonth = new Date(
    selectedYear,
    selectedMonthIndex + 1,
    0,
  ).getDate();
  if (selectedDate > daysInMonth) selectedDate = daysInMonth;

  renderFancyCalendar();
}
window.changeMonth = changeMonth;
function switchTab(tabId) {
  document
    .querySelectorAll(".tab-content")
    .forEach((c) => c.classList.remove("active"));

  const targetTab = document.getElementById(`tab-${tabId}`);
  if (targetTab) targetTab.classList.add("active");

  const header = document.getElementById("header-title");
  if (header)
    header.innerText =
      tabId.charAt(0).toUpperCase() + tabId.slice(1) + " Module";

  document.querySelectorAll(".nav-link").forEach((l) => {
    l.classList.remove("bg-darkCyan-800/80", "text-white");
    l.classList.add("text-slate-400");
  });

  if (
    window.event &&
    window.event.currentTarget &&
    window.event.currentTarget.classList.contains("nav-link")
  ) {
    window.event.currentTarget.classList.add(
      "bg-darkCyan-800/80",
      "text-white",
    );
    window.event.currentTarget.classList.remove("text-slate-400");
  }
}
// async function loadSidebarUser() {
//   const nameEl = document.getElementById("admin-name");
//   const roleEl = document.getElementById("admin-role");
//   if (!nameEl) return;

//   try {
//     const res = await fetch("/api/nstp/auth/me", {
//       method: "GET",
//       credentials: "include",
//     });

//     // ❗ If session expired or not logged in
//     if (!res.ok) {
//       window.location.replace("../MT_login/MT_login.html");
//       return;
//     }

//     const me = await res.json();

//     nameEl.textContent = me.name || "Administrator";

//     if (roleEl) {
//       roleEl.textContent = me.role === "admin" ? "Administrator" : "Student";
//     }
//   } catch (err) {
//     console.warn("Sidebar user not loaded:", err.message);

//     // ❗ Redirect if request fails
//     window.location.replace("../MT_login/MT_login.html");
//   }
// }

document.addEventListener("DOMContentLoaded", loadSidebarUser);

function toggleCalendar() {
  isCalendarOpen = !isCalendarOpen;
  isTermDropdownOpen = false;
  renderFancyCalendar();
}

async function toggleTermDropdown() {
  isTermDropdownOpen = !isTermDropdownOpen;
  isCalendarOpen = false;

  if (isTermDropdownOpen && reportTerms.length === 0) {
    try {
      await loadReportTerms();
    } catch (e) {
      console.error(e);
    }
  }

  // ✅ always ensure selection exists then re-render
  ensureActiveTermSelected();
  renderSemesterTermSelector();
}
function formatDateLong(v) {
  if (!v) return "";

  // If backend already gives "YYYY-MM-DD"
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-").map(Number);
    // Create LOCAL date (no timezone shifting)
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  // If it's Date object / ISO string w/ time
  const dt = new Date(v);
  if (isNaN(dt.getTime())) return String(v);

  return dt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
function formatTime12h(t) {
  if (!t) return "";

  // If it's "HH:MM:SS" (MySQL TIME)
  if (typeof t === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(t)) {
    const [hh, mm] = t.split(":").map(Number);
    const dt = new Date();
    dt.setHours(hh, mm, 0, 0);
    return dt.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  // If it's ISO / Date
  const dt = new Date(t);
  if (isNaN(dt.getTime())) return String(t);

  return dt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
function filterStudentsByType(type) {
  const base = applyReportFilters(reportRows);

  if (type === "Late") return base.filter((s) => s.late > 0);
  if (type === "Absent") return base.filter((s) => s.absent > 0);
  if (type === "Excused") return base.filter((s) => s.excused > 0);
  if (type === "Early Out") return base.filter((s) => s.earlyOut > 0);

  if (type === "Present") {
    return base.filter((s) => s.present > 0);
  }

  return base;
}
function initProgramDropdownFromReportRows() {
  const cont = document.getElementById("program-list-container");
  if (!cont) return;

  // get unique programs from reportRows
  const set = new Set();
  for (const s of reportRows || []) {
    const p = String(s.prog || "").trim();
    if (p) set.add(p);
  }

  const programs = Array.from(set).sort((a, b) => a.localeCompare(b));

  // ✅ always include "All"
  cont.innerHTML = `
    <button onclick="selectOption('program', 'All')"
      class="w-full text-center py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 border border-slate-50 rounded-lg">
      All
    </button>
    ${programs
      .map(
        (p) => `
      <button onclick="selectOption('program', ${JSON.stringify(p)})"
        class="w-full text-center py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 border border-slate-50 rounded-lg">
        ${p}
      </button>
    `,
      )
      .join("")}
  `;
}
window.initProgramDropdownFromReportRows = initProgramDropdownFromReportRows;
function renderFancyCalendar() {
  const container = document.getElementById("target-date-container");
  if (!container) return;

  const ords = ["1st", "2nd", "3rd", "4th"];

  // ✅ proper calendar meta (real month length + weekday alignment)
  const { daysInMonth, firstDow, rows } = getCalendarMeta(
    selectedYear,
    selectedMonthIndex,
  );

  // ✅ clamp selectedDate to valid day for this month
  if (selectedDate > daysInMonth) selectedDate = daysInMonth;
  if (selectedDate < 1) selectedDate = 1;

  const displayDate =
    activeInterval === "day"
      ? `${monthNames[selectedMonthIndex]} ${selectedDate}, ${selectedYear}`
      : `${ords[selectedWeekRow]} Week of ${monthNames[selectedMonthIndex]} ${selectedYear}`;

  const monthLabel = `${monthNames[selectedMonthIndex]} ${selectedYear}`;

  const cells = rows * 7;

  container.innerHTML = `
    <h3 class="config-label">Target Date</h3>
    <div class="relative">
      <button onclick="toggleCalendar()" type="button"
        class="w-full flex items-center justify-between px-6 py-4 bg-slate-50 border border-slate-200 rounded-[1.25rem] text-xs font-bold text-slate-700 hover:border-darkCyan-300 transition-all shadow-inner group text-center">
        <span>${displayDate}</span>
        <i class="fa-solid fa-calendar-day text-darkCyan-600 group-hover:scale-110 transition-transform"></i>
      </button>

      <div id="fancy-calendar-popup"
        class="${isCalendarOpen ? "" : "hidden"} absolute top-full left-0 mt-3 z-[99999] bg-white border border-slate-100 rounded-[2.5rem] p-8 fancy-shadow animate-fade w-[340px]">

        <div class="flex items-center justify-between mb-8 px-2">
          <!-- ✅ wired -->
          <button type="button" onclick="changeMonth(-1)"
            class="w-10 h-10 rounded-2xl border border-slate-100 flex items-center justify-center text-slate-300 hover:bg-slate-50 transition-colors">
            <i class="fa-solid fa-chevron-left text-xs"></i>
          </button>

          <span class="text-xs font-black text-slate-800 tracking-widest uppercase">${monthLabel}</span>

          <!-- ✅ wired -->
          <button type="button" onclick="changeMonth(1)"
            class="w-10 h-10 rounded-2xl border border-slate-100 flex items-center justify-center text-slate-300 hover:bg-slate-50 transition-colors">
            <i class="fa-solid fa-chevron-right text-xs"></i>
          </button>
        </div>

        <div class="grid grid-cols-7 gap-1.5 text-center">
          ${["SU", "MO", "TU", "WE", "TH", "FR", "SA"].map((d) => `<span class="text-[9px] font-black text-slate-300 py-2">${d}</span>`).join("")}

          ${Array.from({ length: cells }, (_, i) => {
            const dayNum = i - firstDow + 1;

            // blank before 1st + after last day
            if (dayNum < 1 || dayNum > daysInMonth) {
              return `<div class="w-10 h-10"></div>`;
            }

            const row = Math.floor(i / 7);
            const isSelected =
              activeInterval === "day" && dayNum === selectedDate;
            const isWeekSelected =
              activeInterval === "weekly" && row === selectedWeekRow;

            return `
              <button type="button" onclick="selectCalDate(${dayNum}, ${row})"
                class="calendar-day w-10 h-10 flex items-center justify-center text-[11px] font-bold text-slate-700
                  ${isSelected ? "calendar-selected" : ""}
                  ${isWeekSelected ? "week-highlight" : ""}">
                ${dayNum}
              </button>
            `;
          }).join("")}
        </div>
      </div>
    </div>
  `;

  container.classList.remove("opacity-0", "invisible");
}

async function selectCalDate(d, row) {
  selectedDate = d;
  selectedWeekRow = row;
  isCalendarOpen = false;
  renderFancyCalendar();

  // ✅ optional: auto-refresh if report already visible
  if (isReportVisible()) {
    try {
      await fetchReportFromDB();
    } catch (e) {
      console.error(e);
      simpleModal("Load Failed", e.message || "Could not refresh report.");
    }
  }
}
window.selectCalDate = selectCalDate;

function renderSemesterTermSelector() {
  const container = document.getElementById("target-date-container");
  if (!container) return;

  // ✅ make sure we have a selected term (active/first)
  ensureActiveTermSelected();

  // If selectedTerm isn't set but selectedTermId is, derive label
  if (
    (!selectedTerm || selectedTerm === "Select Term") &&
    selectedTermId &&
    reportTerms.length
  ) {
    const found = reportTerms.find(
      (t) =>
        Number(t.term_id ?? t.id ?? t.nstp_term_id) === Number(selectedTermId),
    );
    if (found) {
      selectedTerm =
        found.label ||
        `${found.semester || found.nstp_semester || "Semester"}, ${found.year || found.nstp_year || ""}`.trim();
      selectedTermLabel = selectedTerm;
    }
  }

  // ✅ safer boolean check for is_active
  const toBoolActive = (v) => {
    if (v === true || v === 1) return true;
    const s = String(v ?? "")
      .toLowerCase()
      .trim();
    return s === "1" || s === "true" || s === "yes" || s === "active";
  };

  container.innerHTML = `
    <h3 class="config-label">2. Select Term</h3>
    <div class="relative">
      <button type="button" onclick="toggleTermDropdown()"
        class="w-full flex items-center justify-between px-6 py-4 bg-slate-50 border border-slate-200 rounded-[1.25rem] text-xs font-bold text-slate-700 hover:border-darkCyan-300 transition-all shadow-inner group text-center">
        <span>${selectedTerm || "Select Term"}</span>
        <i class="fa-solid fa-graduation-cap text-darkCyan-600 group-hover:scale-110 transition-transform"></i>
      </button>

      <div id="term-dropdown-popup"
        class="${isTermDropdownOpen ? "" : "hidden"} absolute top-full left-0 mt-3 w-full bg-white border border-slate-100 rounded-[2rem] p-2 fancy-shadow animate-fade z-[99999] overflow-hidden">
        <div class="max-h-[180px] overflow-y-auto custom-scrollbar divide-y divide-slate-50">
          ${
            (reportTerms.length ? reportTerms : [])
              .map((t) => {
                const tid = Number(t.term_id ?? t.id ?? t.nstp_term_id);
                const label =
                  t.label ||
                  `${t.semester || t.nstp_semester || "Semester"}, ${t.year || t.nstp_year || ""}`.trim();
                const isActive = toBoolActive(t.is_active);

                // ✅ safer passing of label (no quote escaping headaches)
                return `
              <button type="button"
  onclick='selectTermValue(${JSON.stringify(label)}, ${tid})'
  class="w-full p-4 text-left text-xs font-bold transition-all hover:bg-slate-50 flex items-center justify-between ${
    Number(selectedTermId) === tid ? "text-darkCyan-600" : "text-slate-500"
  }">
  
  <div class="flex items-center justify-between flex-1 pr-4 overflow-hidden">
    <span class="truncate">${label}</span>
    ${isActive ? '<span class="ml-2 text-[12px] uppercase tracking-wider opacity-70 text-green-600">Active</span>' : ""}
  </div>

  ${Number(selectedTermId) === tid ? '<i class="fa-solid fa-circle-check text-[10px] shrink-0"></i>' : ""}
</button>
            `;
              })
              .join("") ||
            `<div class="p-4 text-xs font-bold text-slate-400">No terms found.</div>`
          }
        </div>
      </div>
    </div>
  `;

  container.classList.remove("opacity-0", "invisible");
}

// make sure it is global for inline onclick
window.renderSemesterTermSelector = renderSemesterTermSelector;

async function setReportInterval(type, el) {
  activeInterval = type;
  if (type !== "semester") isTermDropdownOpen = false;

  document.querySelectorAll(".int-btn").forEach((b) => {
    b.classList.remove(
      "bg-white",
      "shadow-sm",
      "text-darkCyan-700",
      "active-int",
    );
    b.classList.add("text-slate-500");
  });
  if (el)
    el.classList.add(
      "bg-white",
      "shadow-sm",
      "text-darkCyan-700",
      "active-int",
    );

  const container = document.getElementById("target-date-container");
  if (!container) return;

  if (type === "day" || type === "weekly") {
    renderFancyCalendar();
    return;
  }

  // ✅ semester: ensure terms loaded
  if (reportTerms.length === 0) {
    try {
      await loadReportTerms();
    } catch (e) {
      console.error(e);
    }
  }

  // ✅ always ensure selected term is set (active/first)
  ensureActiveTermSelected();

  // ✅ render semester selector
  renderSemesterTermSelector();
}

function selectTermValue(val, termId) {
  selectedTermLabel = val;
  selectedTerm = val;
  selectedTermId = Number(termId);

  isTermDropdownOpen = false;

  // ✅ update UI immediately
  if (activeInterval === "semester") {
    renderSemesterTermSelector();
  }
}

function getStatusInfo(present, late, earlyOut, absent, excused) {
  // 🚨 Dropped Out
  if (absent >= 3) {
    return {
      text: "DROPPED OUT",
      color: "text-rose-600 font-extrabold",
    };
  }

  // ⚠️ High Risk: Too many lates
  if (late >= 6) {
    return {
      text: "⚠ Attendance Warning – One more absence may lead to removal",
      color: "text-rose-500 font-bold",
    };
  }

  // ⚠️ At Risk
  if (absent === 2 && late >= 2) {
    return {
      text: "AT RISK",
      color: "text-rose-500 font-bold",
    };
  }

  if (absent === 2) {
    return {
      text: "2 ABSENCES",
      color: "text-rose-500 font-bold",
    };
  }

  if (absent === 1) {
    return {
      text: "1 ABSENCE",
      color: "text-orange-500 font-bold",
    };
  }

  if (earlyOut > 0) {
    return {
      text: "EARLY OUT",
      color: "text-sky-600 font-bold",
    };
  }

  if (late >= 1) {
    return {
      text: "GOOD",
      color: "text-emerald-500 font-semibold",
    };
  }

  if (excused > 0) {
    return {
      text: "EXCUSED",
      color: "text-slate-500 font-medium",
    };
  }

  if (
    present > 0 &&
    late === 0 &&
    earlyOut === 0 &&
    absent === 0 &&
    excused === 0
  ) {
    return {
      text: "PERFECT",
      color: "text-emerald-600 font-black",
    };
  }

  return {
    text: "GOOD",
    color: "text-emerald-400 font-black",
  };
}

function promptCompile() {
  if (!activeInterval) return;

  const ords = ["1st", "2nd", "3rd", "4th"];

  const period =
    activeInterval === "day"
      ? `${monthNames[selectedMonthIndex]} ${selectedDate}, ${selectedYear}`
      : activeInterval === "weekly"
        ? `${ords[selectedWeekRow]} Week of ${monthNames[selectedMonthIndex]} ${selectedYear}`
        : selectedTerm;

  const overlay = document.getElementById("modal-overlay");
  const container = document.getElementById("modal-container");
  if (!overlay || !container) return;

  overlay.classList.remove("hidden");
  container.innerHTML = `
    <div class="p-12 text-center animate-fade">
      <div class="w-20 h-20 bg-darkCyan-50 text-darkCyan-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-3xl shadow-lg shadow-darkCyan-100">
        <i class="fa-solid fa-person-hiking"></i>
      </div>

      <h2 class="text-2xl font-black text-slate-800 mb-2">Compile Records?</h2>
      <p class="text-slate-400 text-sm mb-10 px-4 leading-relaxed">
        Process and compile report for <br>
        <span class="text-darkCyan-600 font-black">${period}</span>?
      </p>

      <div class="flex gap-4">
        <button onclick="closeModal()" class="flex-1 py-4 bg-slate-50 text-slate-500 rounded-2xl font-bold uppercase tracking-widest text-xs">Cancel</button>
        <button onclick="compileReport()" class="flex-1 py-4 bg-darkCyan-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-darkCyan-200">Compile</button>
      </div>
    </div>
  `;

  setTimeout(() => {
    container.classList.replace("scale-95", "scale-100");
    container.classList.replace("opacity-0", "opacity-100");
  }, 10);
}

async function compileReport() {
  closeModal();

  const emptyState = document.getElementById("empty-state-reports");
  const statsContainer = document.getElementById("stats-container");
  const tableCard = document.getElementById("table-card");
  if (!emptyState || !statsContainer || !tableCard) return;

  emptyState.classList.add("hidden");
  statsContainer.classList.replace("hidden", "grid");
  tableCard.classList.remove("hidden");

  const ords = ["1st", "2nd", "3rd", "4th"];

  const periodText =
    activeInterval === "day"
      ? `${monthNames[selectedMonthIndex]} ${selectedDate}, ${selectedYear}`
      : activeInterval === "weekly"
        ? `${ords[selectedWeekRow]} Week of ${monthNames[selectedMonthIndex]} ${selectedYear}`
        : selectedTerm;

  const subtitle = document.getElementById("table-period-subtitle");
  if (subtitle) subtitle.innerText = periodText;

  loadDemoReport();
}

function renderTable() {
  const tbody = document.getElementById("report-tbody");
  if (!tbody) return;

  // ✅ apply search + section + program filters
  const norm = (v) =>
    String(v ?? "")
      .trim()
      .toLowerCase();

  const secPick = norm(selectedSectionFilter); // "all" or "a".."z"
  const progPick = norm(selectedProgramFilter); // "all" or "rotc"/"cwts"/etc
  const q = norm(searchTermValue);

  const filtered = (reportRows || []).filter((s) => {
    const id = norm(s.id);
    const name = norm(s.name);
    const sec = norm(s.sec); // expects "A", "B", etc.
    const prog = norm(s.prog); // expects "ROTC", "CWTS", etc.

    // search filter
    const matchesSearch = !q || name.includes(q) || id.includes(q);

    // section filter
    const matchesSection = secPick === "all" || sec === secPick;

    // program filter
    const matchesProgram = progPick === "all" || prog === progPick;

    return matchesSearch && matchesSection && matchesProgram;
  });

  const startIdx = (currentPage - 1) * rowsPerPage;
  const paged = filtered.slice(startIdx, startIdx + rowsPerPage);

  const thead = document.getElementById("report-thead");
  if (thead) {
    thead.innerHTML = `
      <tr>
        <th class="px-8 py-5">ID Number</th>
        <th class="px-6 py-5">Full Name</th>
        <th class="px-6 py-5 text-center">Program</th>
        <th class="px-6 py-5 text-center">Section</th>
        <th class="px-6 py-5 text-center font-black">Record History</th>
        <th class="px-6 py-5 text-center">Remarks</th>
      </tr>
    `;
  }

  tbody.innerHTML = paged
    .map((s) => {
      const stat = getStatusInfo(
        s.present,
        s.late,
        s.earlyOut,
        s.absent,
        s.excused,
      );

      // NOTE: sessionCount not used in your UI, but keeping it so nothing breaks
      const sessionCount =
        activeInterval === "day" ? 1 : activeInterval === "weekly" ? 2 : 16;

      const sessionDots = (s.history || [])
        .map((h) => {
          const cls =
            h.mark === "present"
              ? "bg-emerald-500"
              : h.mark === "late"
                ? "bg-amber-400"
                : h.mark === "early_out"
                  ? "bg-sky-500"
                  : h.mark === "excused"
                    ? "bg-slate-400"
                    : "bg-rose-500";

          const tip = `${String(h.mark || "").toUpperCase()} 
(${formatDateLong(h.date)} 
• IN: ${mapStatusLabel(h.in_status)} ${formatTime12h(h.in_time)} 
• OUT: ${mapStatusLabel(h.out_status)} ${formatTime12h(h.out_time)})`;

          return `<div data-tip="${tip}" class="dot-tooltip w-2.5 h-2.5 rounded-full relative cursor-help ${cls} shadow-sm"></div>`;
        })
        .join("");

      // ✅ escape strings used in inline onclick (prevents quote breaking)
      const esc = (v) =>
        String(v ?? "")
          .replace(/\\/g, "\\\\")
          .replace(/'/g, "\\'");

      return `
        <tr>
          <td class="px-8 py-5 font-bold text-darkCyan-800 text-left">${s.id}</td>
          <td onclick="openStudentModal('${esc(s.id)}', '${esc(s.name)}', '${esc(s.sec)}', '${esc(s.prog)}', '${esc(s.rem)}')"
              class="px-6 py-5 font-bold text-slate-800 hover:text-darkCyan-600 cursor-pointer transition-all underline decoration-slate-100 underline-offset-4">
            ${s.name}
          </td>
          <td class="px-6 py-5 font-bold text-darkCyan-600 text-center uppercase">${s.prog}</td>
          <td class="px-6 py-5 font-bold text-slate-400 text-center">${s.sec}</td>
          <td class="px-6 py-5"><div class="flex gap-1.5 justify-center">${sessionDots}</div></td>
          <td class="px-6 py-5 text-center">
            <span class="px-3 py-1 rounded-lg text-[10px] uppercase tracking-tight ${stat.color} bg-slate-50 border border-slate-100">${s.rem}</span>
          </td>
        </tr>
      `;
    })
    .join("");

  const paginationInfo = document.getElementById("pagination-info");
  if (paginationInfo) {
    paginationInfo.innerText = `Showing ${Math.min(startIdx + 1, filtered.length)} to ${Math.min(
      startIdx + rowsPerPage,
      filtered.length,
    )} of ${filtered.length}`;
  }

  renderPageNumbers(Math.ceil(filtered.length / rowsPerPage));
}

function openStatsModal(type) {
  const overlay = document.getElementById("modal-overlay");
  const container = document.getElementById("modal-container");
  if (!overlay || !container) return;

  overlay.classList.remove("hidden");
  container.classList.replace("max-w-lg", "max-w-5xl");

  let filteredStudents = filterStudentsByType(type);

  // theme
  // theme
  let theme = "emerald";
  let icon = "fa-user-check"; // Present
  let colorClass = "bg-emerald-500";

  if (type === "Late") {
    theme = "amber";
    icon = "fa-clock-rotate-left";
    colorClass = "bg-amber-400";
  } else if (type === "Absent") {
    theme = "rose";
    icon = "fa-user-xmark";
    colorClass = "bg-rose-500";
  } else if (type === "Excused") {
    theme = "slate";
    icon = "fa-handshake"; // ✅ handshake for Excused
    colorClass = "bg-slate-400";
  } else if (type === "Early Out") {
    theme = "sky";
    icon = "fa-person-hiking"; // ✅ hiking for Early Out
    colorClass = "bg-sky-500";
  }

  // total marks shown in modal = sum of matching marks
  const markCount = filteredStudents.reduce((sum, s) => {
    if (type === "Late") return sum + s.late;
    if (type === "Absent") return sum + s.absent;
    if (type === "Excused") return sum + s.excused;
    if (type === "Early Out") return sum + s.earlyOut;
    if (type === "Present") return sum + s.present;
    return sum;
  }, 0);

  container.innerHTML = `
    <div class="p-10 space-y-6 animate-fade">
      <div class="flex justify-between items-center text-left">
        <div class="flex items-center gap-5">
          <div class="w-14 h-14 bg-${theme}-50 text-${theme}-600 rounded-2xl flex items-center justify-center text-2xl shadow-sm">
            <i class="fa-solid ${icon}"></i>
          </div>
          <div>
            <h2 class="text-2xl font-black text-slate-800">${type} Registry</h2>
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              ${markCount} Marks Compiled across ${filteredStudents.length} Students
            </p>
          </div>
        </div>
        <button onclick="closeModal()" class="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-rose-50 transition-all">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="max-h-[500px] overflow-y-auto custom-scrollbar border-2 border-slate-50 rounded-[2.5rem] bg-white divide-y">
        ${filteredStudents
          .map((s) => {
            // list all matching dates from history
            const dates = (s.history || [])
              .filter((h) => {
                if (type === "Late") return h.mark === "late";
                if (type === "Absent") return h.mark === "absent";
                if (type === "Excused") return h.mark === "excused";
                if (type === "Early Out") return h.mark === "early_out";
                if (type === "Present") return h.mark === "present";
                return true;
              })
              .map((h) => h.date);

            return `
            <div class="p-8 hover:bg-slate-50 transition-colors text-left">
              <div class="flex items-center gap-4 mb-4">
                <div class="w-3 h-3 rounded-full ${colorClass} shadow-sm shrink-0"></div>
                <div class="flex flex-wrap items-center gap-x-3 text-[14px] font-black text-slate-800">
                  <span>${s.name}</span>
                  <span class="text-slate-300">•</span>
                  <span class="text-slate-500 font-bold tracking-tight">${s.id}</span>
                  <span class="text-slate-300">•</span>
                  <span class="text-darkCyan-600 font-black uppercase text-xs">${s.prog || "-"}</span>
                  <span class="text-slate-300">•</span>
                  <span class="text-slate-500 font-bold text-xs">Section ${s.sec || "-"}</span>
                </div>
              </div>
              <div class="flex flex-wrap gap-2 pl-7 items-center">
                ${
                  dates.length
                    ? dates
                        .map(
                          (d) =>
                            `<span class="px-2 py-1.5 bg-white border border-slate-100 rounded-lg text-[10px] font-bold text-slate-500 tracking-tight shadow-sm">${d}</span>`,
                        )
                        .join(
                          '<span class="text-slate-200 self-center font-black">·</span>',
                        )
                    : `<span class="px-2 py-1.5 bg-white border border-slate-100 rounded-lg text-[10px] font-bold text-slate-400 tracking-tight shadow-sm">No session dates</span>`
                }
              </div>
            </div>
          `;
          })
          .join("")}
      </div>
    </div>
  `;

  setTimeout(() => {
    container.classList.replace("scale-95", "scale-100");
    container.classList.replace("opacity-0", "opacity-100");
  }, 10);
}

function openStudentModal(id, name, sec, prog, remark) {
  const student = reportRows.find((s) => s.id === id);
  const overlay = document.getElementById("modal-overlay");
  const container = document.getElementById("modal-container");
  if (!overlay || !container || !student) return;

  overlay.classList.remove("hidden");
  container.classList.replace("max-w-5xl", "max-w-2xl");

  const hHtml = (student.history || [])
    .map((h, idx) => {
      const color =
        h.mark === "present"
          ? "bg-emerald-500"
          : h.mark === "late"
            ? "bg-amber-400"
            : h.mark === "early_out"
              ? "bg-sky-500"
              : h.mark === "excused"
                ? "bg-slate-400"
                : "bg-rose-500";

      return `
      <div class="p-4 flex items-center justify-between hover:bg-slate-50 transition-all text-left">
        <div class="flex items-center gap-4">
          <div class="w-3 h-3 rounded-full ${color} shadow-sm"></div>
          <div>
            <p class="text-[11px] font-bold text-slate-700">Session ${idx + 1}</p>
            <p class="text-[9px] font-medium text-slate-400 italic">
              ${formatDateLong(h.date)} 
• IN: ${mapStatusLabel(h.in_status)} ${formatTime12h(h.in_time)} 
• OUT: ${mapStatusLabel(h.out_status)} ${formatTime12h(h.out_time)}
            </p>
          </div>
        </div>
        <p class="text-[10px] font-black text-slate-800 uppercase">${h.mark.replace("_", " ")}</p>
      </div>
    `;
    })
    .join("");

  container.innerHTML = `
    <div class="p-10 space-y-8 animate-fade">
      <div class="flex justify-between items-start text-left">
        <div class="flex items-center gap-6">
          <div class="w-16 h-16 bg-darkCyan-50 rounded-[1.5rem] flex items-center justify-center text-3xl text-darkCyan-600 font-black shadow-inner">${name.charAt(0)}</div>
          <div class="text-left">
            <h2 class="text-2xl font-black text-slate-800 tracking-tight">${name}</h2>
            <p class="text-xs font-bold text-slate-400 uppercase tracking-widest">${id} • ${prog} • Section ${sec}</p>
          </div>
        </div>
        <button onclick="closeModal()" class="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-rose-50 transition-all">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div class="space-y-4">
          <div class="flex justify-between items-center px-2">
            <h3 class="config-label">Timeline History</h3>
            <span class="px-2 py-0.5 bg-slate-100 text-[8px] font-black rounded text-slate-500 uppercase">Audit View</span>
          </div>
          <div class="max-h-[350px] overflow-y-auto custom-scrollbar border-2 border-slate-50 rounded-[2rem] bg-white divide-y">
            ${hHtml || `<div class="p-6 text-xs font-bold text-slate-400">No history for this period.</div>`}
          </div>
        </div>

        <div class="space-y-6 flex flex-col">
          <div class="space-y-4 flex-grow">
            <h3 class="config-label">Admin Remarks</h3>
            <textarea id="remark-edit" class="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] text-xs font-semibold focus:ring-4 focus:ring-darkCyan-500/5 outline-none h-56 transition-all">${remark || ""}</textarea>
          </div>
          <button onclick="checkRemarkChanges('${id}', '${remark || ""}')" class="w-full py-4 bg-darkCyan-950 text-white rounded-[1.5rem] text-xs font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl">Update Record</button>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    container.classList.replace("scale-95", "scale-100");
    container.classList.replace("opacity-0", "opacity-100");
  }, 10);
}

function checkRemarkChanges(studentId, oldVal) {
  const newVal = document.getElementById("remark-edit")?.value ?? "";
  const container = document.getElementById("modal-container");
  if (!container) return;

  if (String(oldVal).trim() === String(newVal).trim()) {
    container.innerHTML = `
      <div class="p-12 text-center animate-fade">
        <div class="w-20 h-20 bg-amber-50 text-amber-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-3xl shadow-lg shadow-amber-100">
          <i class="fa-solid fa-circle-exclamation"></i>
        </div>
        <h2 class="text-2xl font-black text-slate-800 mb-2">No Changes Made</h2>
        <p class="text-slate-400 text-sm mb-10 px-6 leading-relaxed">The administrative remarks were not updated.</p>
        <button onclick="closeModal()" class="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold uppercase tracking-widest text-xs mt-6">Dismiss</button>
      </div>
    `;
    return;
  }

  // ✅ IMPORTANT: pass newVal safely using JSON.stringify
  container.innerHTML = `
    <div class="p-12 text-center animate-fade">
      <div class="w-20 h-20 bg-darkCyan-50 text-darkCyan-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-3xl shadow-lg shadow-darkCyan-100">
        <i class="fa-solid fa-floppy-disk"></i>
      </div>
      <h2 class="text-2xl font-black text-slate-800 mb-2">Save Changes?</h2>
      <p class="text-slate-400 text-sm mb-10 leading-relaxed px-4">Apply updated remarks to this student record?</p>
      <div class="flex gap-4 mt-8">
        <button onclick="closeModal()" class="flex-1 py-4 bg-slate-50 text-slate-500 rounded-2xl font-bold uppercase tracking-widest text-xs">Cancel</button>
        <button onclick='finishSave(${JSON.stringify(studentId)}, ${JSON.stringify(newVal)})'
          class="flex-1 py-4 bg-darkCyan-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-darkCyan-200">
          Yes, Update
        </button>
      </div>
    </div>
  `;
}
window.checkRemarkChanges = checkRemarkChanges;

async function finishSave(sid, val) {
  // ✅ sid + val now comes from the confirmation (not from the removed textarea)

  if (!selectedTermId) {
    simpleModal("Missing Term", "Select a term first before saving remarks.");
    return;
  }

  try {
    const res = await fetch(`/api/report/remarks/${encodeURIComponent(sid)}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        term_id: Number(selectedTermId),
        remark: String(val ?? ""),
      }),
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(msg || "Save failed");
    }

    // ✅ update local UI immediately
    const idx = reportRows.findIndex((s) => String(s.id) === String(sid));
    if (idx !== -1) reportRows[idx].rem = String(val ?? "");

    renderTable();

    openModal(
      `
      <div class="p-12 text-center animate-fade">
        <div class="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-3xl shadow-lg shadow-emerald-100">
          <i class="fa-solid fa-circle-check"></i>
        </div>
        <h2 class="text-2xl font-black text-slate-800 mb-2">Remark Saved</h2>
        <p class="text-slate-400 text-sm">Your changes were saved successfully.</p>
      </div>
    `,
      "max-w-lg",
    );

    setTimeout(() => closeModal(), 900);
  } catch (e) {
    console.error(e);
    simpleModal("Save Failed", e.message || "Could not save remark.");
  }
}
window.finishSave = finishSave;

function closeModal() {
  const container = document.getElementById("modal-container");
  const overlay = document.getElementById("modal-overlay");
  if (!container || !overlay) return;

  container.classList.replace("scale-100", "scale-95");
  container.classList.replace("opacity-100", "opacity-0");

  setTimeout(() => {
    overlay.classList.add("hidden");
    container.classList.replace("max-w-5xl", "max-w-lg");
  }, 300);
}

function handleOverlayClick(e) {
  if (e.target.id === "modal-overlay") closeModal();
}

function handleSearch() {
  const input = document.getElementById("student-search");
  searchTermValue = (input?.value || "").toLowerCase();
  currentPage = 1;
  renderTable();
}

function changeRowLimit(v) {
  rowsPerPage = parseInt(v, 10) || 10;
  currentPage = 1;
  renderTable();
}

function prevPage() {
  if (currentPage > 1) {
    currentPage--;
    renderTable();
  }
}

function nextPage() {
  const total = Math.ceil(
    reportRows.filter(
      (s) =>
        s.name.toLowerCase().includes(searchTermValue) ||
        s.id.toLowerCase().includes(searchTermValue),
    ).length / rowsPerPage,
  );

  if (currentPage < total) {
    currentPage++;
    renderTable();
  }
}

function goToPage(n) {
  currentPage = n;
  renderTable();
}

function norm(v) {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

function applyReportFilters(rows) {
  const secPick = norm(selectedSectionFilter); // "all" or "a".."z"
  const progPick = norm(selectedProgramFilter); // "all" or "rotc" etc
  const q = norm(searchTermValue);

  return (rows || []).filter((s) => {
    const sec = norm(s.sec); // your row has s.sec
    const prog = norm(s.prog); // your row has s.prog
    const id = norm(s.id);
    const name = norm(s.name);

    // search filter
    const matchesSearch = !q || name.includes(q) || id.includes(q);

    // section filter (All = no filter)
    const matchesSection = secPick === "all" || sec === secPick;

    // program filter (All = no filter)
    const matchesProgram = progPick === "all" || prog === progPick;

    return matchesSearch && matchesSection && matchesProgram;
  });
}

function renderPageNumbers(total) {
  const container = document.getElementById("page-numbers");
  if (!container) return;

  let html = "";
  for (let i = 1; i <= total; i++) {
    html += `
      <button onclick="goToPage(${i})" class="w-9 h-9 flex items-center justify-center rounded-xl text-xs font-bold transition-all ${
        currentPage === i
          ? "bg-darkCyan-600 text-white shadow-lg"
          : "bg-white border border-slate-200 text-slate-400"
      }">${i}</button>
    `;
  }
  container.innerHTML = html;
}

function toggleCustomDropdown(id, ev) {
  // ✅ prevent the global window.onclick from immediately closing it
  if (ev) {
    ev.preventDefault();
    ev.stopPropagation();
  }

  const drop = document.getElementById(id);
  if (!drop) return;

  const isHidden = drop.classList.contains("hidden");

  // close all first
  document
    .querySelectorAll('[id$="-drop"]')
    .forEach((d) => d.classList.add("hidden"));

  // then open the requested one
  if (isHidden) drop.classList.remove("hidden");
}
window.toggleCustomDropdown = toggleCustomDropdown;

function selectOption(type, value) {
  const label = document.getElementById(`selected-${type}`);
  const drop = document.getElementById(`${type}-drop`);

  if (label) label.innerText = value;
  if (drop) drop.classList.add("hidden");

  // ✅ SAVE FILTER STATE
  if (type === "section") {
    // accept "Section A" or "A"
    selectedSectionFilter =
      String(value)
        .replace(/^Section\s+/i, "")
        .trim() || "All";
  }
  if (type === "program") {
    selectedProgramFilter = String(value).trim() || "All";
  }

  // ✅ just re-render table (no need to re-fetch DB)
  renderTable();
  renderStats();
}

function initSectionDropdown() {
  const cont = document.getElementById("section-list-container");
  if (!cont) return;

  cont.innerHTML = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    .split("")
    .map(
      (l) =>
        `<button onclick="selectOption('section', 'Section ${l}')" class="w-full text-center py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50 border border-slate-50 rounded-lg">${l}</button>`,
    )
    .join("");
}
function toISODateOnly(v) {
  if (!v) return "";
  // If it's already "YYYY-MM-DD"
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);

  // Force local-date output (not UTC string)
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function formatDateTimeLong(dateVal, timeVal) {
  const d = formatDateLong(dateVal);
  const t = formatTime12h(timeVal);
  if (d && t) return `${d} • ${t}`;
  return d || t || "";
}
function downloadExcel() {
  const ords = ["1st", "2nd", "3rd", "4th"];

  let periodSubtitle = "";
  let fileNameSuffix = "";

  // ✅ dynamic month/year/day (no hardcoded Feb 2026)
  const monthLabel = monthNames[selectedMonthIndex];
  const yyyy = selectedYear;
  const mm2 = String(selectedMonthIndex + 1).padStart(2, "0");
  const dd2 = String(selectedDate).padStart(2, "0");

  if (activeInterval === "day") {
    periodSubtitle = `${monthLabel} ${selectedDate}, ${yyyy}`;
    fileNameSuffix = `${yyyy}_${mm2}_${dd2}`; // safe filename
  } else if (activeInterval === "weekly") {
    periodSubtitle = `${ords[selectedWeekRow]} week of ${monthLabel} ${yyyy}`;
    fileNameSuffix = `${yyyy}_${mm2}_Week_${selectedWeekRow + 1}`;
  } else {
    periodSubtitle = selectedTerm || "Semester";
    fileNameSuffix = `Semester_${yyyy}`;
  }

  const searchRes = reportRows.filter(
    (s) =>
      (s.name || "").toLowerCase().includes(searchTermValue) ||
      (s.id || "").toLowerCase().includes(searchTermValue),
  );

  // ✅ Build column dates from ACTUAL history dates (sorted unique)
  const dateSet = new Set();
  for (const s of searchRes) {
    for (const h of s.history || []) {
      dateSet.add(toISODateOnly(h.date));
    }
  }
  const sessionDates = Array.from(dateSet).sort(); // "YYYY-MM-DD" sorts correctly

  // Fallback: if no dates found, still make 1 column
  const columns = sessionDates.length ? sessionDates : ["DATE"];

  const markToCell = (mark) => {
    if (mark === "present") return { label: "Present", cls: "present" };
    if (mark === "late") return { label: "Late", cls: "late" };
    if (mark === "early_out") return { label: "Early Out", cls: "earlyout" };
    if (mark === "excused") return { label: "Excused", cls: "excused" };
    if (mark === "absent") return { label: "Absent", cls: "absent" };
    return { label: "", cls: "" }; // blank if missing
  };

  let excelData = `
  <html xmlns:o="urn:schemas-microsoft-com:office:office"
        xmlns:x="urn:schemas-microsoft-com:office:excel"
        xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <!--[if gte mso 9]>
    <xml>
      <x:ExcelWorkbook>
        <x:ExcelWorksheets>
          <x:ExcelWorksheet>
            <x:Name>MarisTrack Report</x:Name>
            <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
          </x:ExcelWorksheet>
        </x:ExcelWorksheets>
      </x:ExcelWorkbook>
    </xml>
    <![endif]-->
    <style>
      table { border-collapse: collapse; font-family: 'Segoe UI', Arial, sans-serif; }
      td, th { border: 0.5pt solid #000000; padding: 6px; font-size: 10pt; }
      .title { font-size: 16pt; font-weight: bold; text-align: center; border: none; }
      .subtitle { font-size: 10pt; text-align: center; border: none; padding-bottom: 10px; font-weight: bold; color: #475569; }
      .header-main { background-color: #F1F5F9; font-weight: bold; text-align: center; }
      .header-sub { background-color: #F8FAFC; font-weight: bold; text-align: center; font-size: 8pt; color: #334155; }
      .present { color: #16A34A; font-weight: bold; text-align: center; }
      .late { color: #D97706; font-weight: bold; text-align: center; }
      .absent { color: #DC2626; font-weight: bold; text-align: center; }
      .excused { color: #64748B; font-weight: bold; text-align: center; }
      .earlyout { color: #0284C7; font-weight: bold; text-align: center; }
      .remark-text { font-weight: bold; font-size: 9pt; text-align: center; }
      .center { text-align: center; }
    </style>
  </head>
  <body>
    <table>
      <tr><td colspan="${5 + columns.length}" class="title">Attendance Log</td></tr>
      <tr><td colspan="${5 + columns.length}" class="subtitle">${periodSubtitle}</td></tr>

      <tr>
        <th class="header-main">ID NUMBER</th>
        <th class="header-main">FULL NAME</th>
        <th class="header-main">PROGRAM</th>
        <th class="header-main">SECTION</th>
        <th colspan="${columns.length}" class="header-main">ATTENDANCE HISTORY</th>
        <th class="header-main">REMARKS</th>
      </tr>

      <tr>
        <th class="header-sub"></th>
        <th class="header-sub"></th>
        <th class="header-sub"></th>
        <th class="header-sub"></th>
        ${columns.map((d) => `<th class="header-sub">${formatDateLong(d)}</th>`).join("")}
        <th class="header-sub"></th>
      </tr>
  `;

  for (const s of searchRes) {
    const stat = getStatusInfo(
      s.present,
      s.late,
      s.earlyOut,
      s.absent,
      s.excused,
    );

    // Map history by date for fast lookup
    const mapByDate = new Map();
    for (const h of s.history || []) {
      mapByDate.set(toISODateOnly(h.date), h.mark);
    }

    excelData += `
      <tr>
        <td class="center">${s.id || ""}</td>
        <td>${s.name || ""}</td>
        <td class="center">${(s.prog || "").toUpperCase()}</td>
        <td class="center">${s.sec || ""}</td>
    `;

    for (const d of columns) {
      const mark = mapByDate.get(d);
      const cell = markToCell(mark);
      excelData += `<td class="${cell.cls}">${cell.label}</td>`;
    }

    excelData += `<td class="remark-text">${(s.rem || "").trim() || stat.text}</td></tr>`;
  }

  excelData += `</table></body></html>`;

  const blob = new Blob([excelData], { type: "application/vnd.ms-excel" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `MarisTrack_Report_${fileNameSuffix}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

window.onclick = (e) => {
  if (!e.target.closest(".group") && !e.target.closest(".relative")) {
    document
      .querySelectorAll('[id$="-drop"]')
      .forEach((d) => d.classList.add("hidden"));

    if (
      activeInterval === "semester" &&
      !e.target.closest("#target-date-container")
    ) {
      isTermDropdownOpen = false;
      renderSemesterTermSelector();
    }

    if (
      activeInterval !== "semester" &&
      isCalendarOpen &&
      !e.target.closest("#target-date-container")
    ) {
      isCalendarOpen = false;
      renderFancyCalendar();
    }
  }
};

window.onload = async () => {
  initSectionDropdown();
  updateClock();

  try {
    await loadReportTerms(); // ✅ sets selectedTermId + selectedTerm
  } catch (e) {
    console.error("Failed to preload terms:", e);
  }
  await loadPrograms();
  // ✅ SHOW something immediately so target container becomes visible
  // Option A: default to DAY
  setReportInterval("day", document.querySelector(".int-btn.active-int"));

  // Option B: default to SEMESTER (uncomment if you prefer)
  // setReportInterval("semester", document.querySelectorAll(".int-btn")[2]);
};

function loadDemoReport() {
  reportRows = [
    {
      id: "2025-0001",
      name: "Juan Dela Cruz",
      sec: "A",
      prog: "CWTS",

      present: 8,
      late: 1,
      earlyOut: 0,
      absent: 0,
      excused: 0,

      rem: "PERFECT",

      history: [
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },

        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },

        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },

        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },

        {
          date: "2026-05-10",
          mark: "late",
          in_status: "yellow",
          out_status: "green",
          in_time: "08:20:00",
          out_time: "05:00:00",
        },
      ],
    },

    {
      id: "2025-0002",
      name: "Maria Santos",
      sec: "B",
      prog: "ROTC",

      present: 7,
      late: 0,
      earlyOut: 1,
      absent: 1,
      excused: 0,

      rem: "GOOD",

      history: [
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },

        {
          date: "2026-05-08",
          mark: "early_out",
          in_status: "green",
          out_status: "blue",
          in_time: "08:00:00",
          out_time: "03:00:00",
        },
        {
          date: "2026-05-08",
          mark: "absent",
          in_status: "red",
          out_status: "red",
          in_time: "",
          out_time: "",
        },
      ],
    },

    {
      id: "2025-0003",
      name: "John Reyes",
      sec: "C",
      prog: "LTS",

      present: 4,
      late: 2,
      earlyOut: 0,
      absent: 3,
      excused: 1,

      rem: "DROPPED OUT",

      history: [
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },

        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },

        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },

        {
          date: "2026-05-10",
          mark: "late",
          in_status: "yellow",
          out_status: "green",
          in_time: "08:20:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "absent",
          in_status: "red",
          out_status: "red",
          in_time: "",
          out_time: "",
        },
        {
          date: "2026-05-08",
          mark: "absent",
          in_status: "red",
          out_status: "red",
          in_time: "",
          out_time: "",
        },
        {
          date: "2026-05-15",
          mark: "absent",
          in_status: "red",
          out_status: "red",
          in_time: "",
          out_time: "",
        },
      ],
    },
    {
      id: "2025-0004",
      name: "Diana Dela Cruz",
      sec: "A",
      prog: "CWTS",

      present: 10,
      late: 1,
      earlyOut: 0,
      absent: 0,
      excused: 0,

      rem: "PERFECT",

      history: [
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },

        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },

        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },

        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },

        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
      ],
    },

    {
      id: "2025-0005",
      name: "Ken Santos",
      sec: "B",
      prog: "ROTC",

      present: 7,
      late: 0,
      earlyOut: 1,
      absent: 1,
      excused: 0,

      rem: "GOOD",

      history: [
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },

        {
          date: "2026-05-08",
          mark: "early_out",
          in_status: "green",
          out_status: "blue",
          in_time: "08:00:00",
          out_time: "03:00:00",
        },
        {
          date: "2026-05-08",
          mark: "absent",
          in_status: "red",
          out_status: "red",
          in_time: "",
          out_time: "",
        },
      ],
    },

    {
      id: "2025-0006",
      name: "Knox Reyes",
      sec: "C",
      prog: "LTS",

      present: 4,
      late: 2,
      earlyOut: 0,
      absent: 3,
      excused: 1,

      rem: "DROPPED OUT",

      history: [
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },

        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },

        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },

        {
          date: "2026-05-10",
          mark: "late",
          in_status: "yellow",
          out_status: "green",
          in_time: "08:20:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "absent",
          in_status: "red",
          out_status: "red",
          in_time: "",
          out_time: "",
        },
        {
          date: "2026-05-08",
          mark: "absent",
          in_status: "red",
          out_status: "red",
          in_time: "",
          out_time: "",
        },
        {
          date: "2026-05-15",
          mark: "absent",
          in_status: "red",
          out_status: "red",
          in_time: "",
          out_time: "",
        },
      ],
    },
    {
      id: "2025-0007",
      name: "Anna Reyes",
      sec: "C",
      prog: "LTS",

      present: 4,
      late: 2,
      earlyOut: 0,
      absent: 3,
      excused: 1,

      rem: "GOOD",

      history: [
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },

        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },

        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },

        {
          date: "2026-05-10",
          mark: "late",
          in_status: "yellow",
          out_status: "green",
          in_time: "08:20:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
        {
          date: "2026-05-08",
          mark: "absent",
          in_status: "red",
          out_status: "red",
          in_time: "",
          out_time: "",
        },
        {
          date: "2026-05-01",
          mark: "present",
          in_status: "green",
          out_status: "green",
          in_time: "08:00:00",
          out_time: "05:00:00",
        },
      ],
    },
  ];

  reportMeta = {
    present: 48,
    late: 4,
    earlyOut: 2,
    absent: 9,
    excused: 3,
    totalMarks: 55,
  };

  renderTable();
  renderStats();
  initProgramDropdownFromReportRows();
}
