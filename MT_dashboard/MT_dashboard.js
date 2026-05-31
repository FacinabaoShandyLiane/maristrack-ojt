tailwind.config = {
  theme: {
    extend: {
      colors: {
        darkCyan: {
          50: "#f1f9f9",
          100: "#daefef",
          200: "#b9dfdf",
          300: "#8bc6c6",
          400: "#56a3a3",
          500: "#3a8787",
          600: "#2d6d6d",
          700: "#285959",
          800: "#254a4a",
          900: "#223f3f",
          950: "#0f2424",
        },
      },
      fontFamily: { sans: ["Inter", "sans-serif"] },
    },
  },
};

/* =========================
   API CONFIG
   ✅ Change API_BASE if needed
========================= */
const API_BASE = ""; // e.g. "http://localhost:8080" or "" (same origin)

const ENDPOINTS = {
  terms: `${API_BASE}/api/nstp/dashboard/terms`,
  students: (termId) =>
    `${API_BASE}/api/nstp/dashboard/students?term_id=${encodeURIComponent(termId ?? "")}`,
  sections: (termId) =>
    `${API_BASE}/api/nstp/dashboard/sections?term_id=${encodeURIComponent(termId ?? "")}`,
  programs: `${API_BASE}/api/nstp/dashboard/programs`,
  updateStudent: (schoolId) =>
    `${API_BASE}/api/nstp/dashboard/students/${encodeURIComponent(schoolId)}`,
  attendanceMarks: (termId, dateStr) =>
    `${API_BASE}/api/nstp/dashboard/attendance/marks?term_id=${encodeURIComponent(termId ?? "")}&date=${encodeURIComponent(dateStr ?? "")}`,
};
/* =========================
   App State
========================= */
let appState = {
  // old sidebar flag no longer needed, but kept harmless
  isSidebarCollapsed: false,
  programOptions: [],
  currentTab: "dashboard",

  // Filters
  selectedSection: "All",
  selectedProgram: "All",
  selectedDate: "",

  currentAttendanceColor: "green",

  // Dynamic
  termId: null,
  terms: [],
  sections: ["All"],
  programs: [], // computed from students
  students: [],

  // Marks from attendance_log
  attendanceMarks: {}, // { [school_id]: { status: "green"|"yellow"|... } }

  modal: {
    currentPage: 1,
    rowsPerPage: 10,
    filteredData: [],
    returnState: null,
  },
};

/* =========================
   Utils
========================= */
const $ = (sel) => document.querySelector(sel);

function safeText(val, fallback = "") {
  if (val === null || val === undefined) return fallback;
  const s = String(val).trim();
  return s.length ? s : fallback;
}

function captureModalState() {
  const container = document.getElementById("modal-container");
  if (!container) return null;

  return {
    html: container.innerHTML,
    className: container.className,
  };
}

function restoreModalState(state) {
  const overlay = document.getElementById("modal-overlay");
  const container = document.getElementById("modal-container");
  if (!overlay || !container || !state) return;

  overlay.classList.remove("hidden");
  container.className = state.className;
  container.innerHTML = state.html;

  container.classList.remove("scale-95", "opacity-0");
  container.classList.add("scale-100", "opacity-100");
}
async function fetchJSONPut(url, body) {
  const res = await fetch(url, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} - ${msg || url}`);
  }
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  return ct.includes("application/json")
    ? await res.json().catch(() => ({}))
    : {};
}
async function loadProgramOptions() {
  const rows = await fetchJSON(ENDPOINTS.programs);
  const list = Array.isArray(rows) ? rows : [];
  appState.programOptions = list
    .map((p) => ({
      id: p.id ?? p.program_id,
      program_name: p.program_name ?? p.name ?? "",
    }))
    .filter((p) => p.id != null && String(p.program_name).trim());
}

async function refreshDashboardData() {
  const termId = appState.termId;
  if (!termId) return;

  if (!appState.selectedDate) appState.selectedDate = formatTodayISO();

  await Promise.all([
    loadProgramOptions(), // ✅ NEW
    loadSections(termId),
    loadStudents(termId),
    loadAttendanceMarks(termId, appState.selectedDate),
  ]);

  computeProgramsFromStudents();
  updateDashboardUI();
}
async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} - ${url}`);
  return await res.json();
}
async function loadSidebarUser() {
  const nameEl = document.getElementById("admin-name");
  const roleEl = document.getElementById("admin-role");

  if (nameEl) {
    nameEl.textContent = "Administrator";
  }

  if (roleEl) {
    roleEl.textContent = "Super User";
  }
}
function getSavedSidebarExpanded(defaultValue) {
  // defaultValue: boolean (typically sidebar.classList.contains("expanded"))
  let isExpanded = !!defaultValue;

  try {
    const saved = localStorage.getItem("mt_sidebar_expanded");
    if (saved === "1") isExpanded = true;
    else if (saved === "0") isExpanded = false;
  } catch {}

  return isExpanded;
}
document.addEventListener("DOMContentLoaded", () => {
  loadSidebarUser();
});
function formatTodayISO() {
  // Uses local timezone
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/* =========================================================
   Fancy Dropdown (Term) - NOW DYNAMIC
========================================================= */
function toggleFancyDropdown() {
  const menu = document.getElementById("fancy-dropdown-options");
  const arrow = document.getElementById("dropdown-arrow");
  if (!menu || !arrow) return;

  const willOpen = menu.classList.contains("hidden");
  menu.classList.toggle("hidden", !willOpen);
  arrow.classList.toggle("rotate-180", willOpen);
}

function closeFancyDropdown() {
  const menu = document.getElementById("fancy-dropdown-options");
  const arrow = document.getElementById("dropdown-arrow");
  if (!menu || !arrow) return;

  menu.classList.add("hidden");
  arrow.classList.remove("rotate-180");
}

function renderTermsDropdown() {
  const optWrap = document.getElementById("fancy-dropdown-options");
  if (!optWrap) return;

  if (!appState.terms.length) {
    optWrap.innerHTML = `
      <div class="px-4 py-3 text-xs font-bold text-slate-400">
        No terms available
      </div>
    `;
    return;
  }

  optWrap.innerHTML = appState.terms
    .map(
      (t) => `
    <button
  type="button"
  onclick="selectTerm('${String(t.term_id)}')"
  class="w-full text-left px-4 py-3 hover:bg-darkCyan-50 rounded-xl text-xs font-bold
         text-slate-600 hover:text-darkCyan-700 transition-colors flex items-center justify-between group
         ${String(t.term_id) === String(appState.termId) ? "bg-darkCyan-50" : ""}">
  
  <div class="flex items-center justify-between w-full pr-3 overflow-hidden">
    <span class="truncate">${safeText(t.label, `Term #${t.term_id}`)}</span>
    ${t.is_active ? `<span class="ml-2 text-[12px] whitespace-nowrap text-green-600">Active</span>` : ""}
  </div>

  <i class="fa-solid fa-check text-darkCyan-500 ${String(t.term_id) === String(appState.termId) ? "" : "opacity-0"}"></i>
</button>
  `,
    )
    .join("");
}
// Backward compatibility: your HTML calls selectTerm('label')
// We map label -> term_id (from fetched list)
async function selectTerm(termLabelOrId) {
  // If passed a number-like, treat as id
  const maybeId = Number(termLabelOrId);
  let term = null;

  if (!Number.isNaN(maybeId) && String(maybeId) === String(termLabelOrId)) {
    term = appState.terms.find((t) => String(t.term_id) === String(maybeId));
  } else {
    term = appState.terms.find((t) => t.label === termLabelOrId);
  }

  if (!term) {
    showSimpleModal("Term Error", `Term not found: ${termLabelOrId}`);
    return;
  }

  // ✅ set selected term id
  appState.termId = Number(term.term_id);

  // ✅ update visible label
  const el = document.getElementById("selected-term-label");
  if (el) el.innerText = safeText(term.label, `Term #${term.term_id}`);

  // ✅ close dropdown (don’t just toggle blindly)
  closeFancyDropdown();

  // ✅ reset filters
  appState.selectedSection = "All";
  appState.selectedProgram = "All";
  appState.attendanceMarks = {};

  // ✅ fetch students/sections for this term
  await refreshDashboardData();

  // ✅ update dropdown checkmarks to reflect selected term
  renderTermsDropdown();
}

/* =========================================================
   ✅ NEW MODERN SIDEBAR (UNCHANGED)
========================================================= */
(function initModernSidebar() {
  const sidebar = document.getElementById("sidebar");
  const indicator = document.getElementById("indicator");
  const navItems = Array.from(document.querySelectorAll(".nav-item"));
  const btnToggle = document.getElementById("btnToggleSidebar");

  // Dashboard logout modal (kept from your dashboard code)
  const logoutModal = document.getElementById("logoutModal");
  const btnOpenLogout = document.getElementById("btnOpenLogout");
  const btnCloseModal = document.getElementById("btnCloseModal");
  const btnCancelLogout = document.getElementById("btnCancelLogout");
  const btnConfirmLogout = document.getElementById("btnConfirmLogout");

  const ITEM_HEIGHT = 52;
  const ITEM_GAP = 14;

  if (!sidebar || navItems.length === 0) {
    console.warn("Modern sidebar init skipped: missing #sidebar or .nav-item");
    return;
  }

  // ✅ Start from HTML default, then override if localStorage exists
  let isSidebarExpanded = getSavedSidebarExpanded(
    sidebar.classList.contains("expanded"),
  );

  function applySidebarState() {
    sidebar.classList.toggle("expanded", isSidebarExpanded);
  }

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
    // Prefer explicit .active in HTML
    let activeBtn = navItems.find((b) => b.classList.contains("active"));

    // Fallback: match this page route
    if (!activeBtn) {
      activeBtn = navItems.find(
        (b) =>
          (b.dataset.route || b.getAttribute("data-route")) === "dashboard",
      );
    }

    // Final fallback: first item
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

  // --- init ---
  applySidebarState();

  // ✅ Wait for paint so indicator doesn’t misplace on first load
  requestAnimationFrame(() => {
    const activeBtn = getActiveBtn();
    if (activeBtn && !activeBtn.classList.contains("active"))
      activeBtn.classList.add("active");
    moveIndicatorToActive();
  });

  // Chevron toggle (persist)
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

  // Nav clicks (active + route)
  navItems.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      setActiveNav(btn);
      const route = btn.dataset.route || btn.getAttribute("data-route") || "";
      handleModernRoute(route);
    });
  });

  window.addEventListener("resize", () => moveIndicatorToActive());

  // -----------------------------
  // Logout modal (kept behavior)
  // -----------------------------
  function openLogoutModal() {
    if (!logoutModal) return;
    logoutModal.classList.add("open");
  }

  function closeLogoutModal() {
    if (!logoutModal) return;
    logoutModal.classList.remove("open");
  }

  btnOpenLogout?.addEventListener("click", openLogoutModal);
  btnCloseModal?.addEventListener("click", closeLogoutModal);
  btnCancelLogout?.addEventListener("click", closeLogoutModal);

  btnConfirmLogout?.addEventListener("click", () => {
    // Uses your existing logout() function in this file
    if (typeof logout === "function") logout();
    closeLogoutModal();
  });

  window.addEventListener("click", (e) => {
    if (e.target === logoutModal) closeLogoutModal();
  });
})();

/* Helper: safely switch tabs if they exist */
function safeSwitchTab(tabId) {
  const tab = document.getElementById(`tab-${tabId}`);
  const allTabs = document.querySelectorAll(".tab-content");

  if (!tab || !allTabs.length) {
    showSimpleModal(
      "Not Available",
      `Tab "${tabId}" is not available on this page.`,
    );
    return;
  }

  allTabs.forEach((t) => t.classList.add("hidden"));
  tab.classList.remove("hidden");

  const title = document.getElementById("page-title");
  if (title) title.textContent = tabId.charAt(0).toUpperCase() + tabId.slice(1);
}

/* =========================================================
   Dynamic Loaders
========================================================= */
async function loadTerms() {
  const terms = await fetchJSON(ENDPOINTS.terms);

  appState.terms = Array.isArray(terms)
    ? terms.map((t) => ({
        term_id: t.term_id ?? t.id ?? t.termId,
        label:
          t.label ?? t.term_label ?? t.name ?? `Term #${t.term_id ?? t.id}`,
        semester: t.semester ?? t.nstp_semester ?? "",
        year: t.year ?? t.nstp_year ?? "",
        is_active: !!(t.is_active ?? t.isActive),
      }))
    : [];

  if (!appState.terms.length) {
    const label = document.getElementById("selected-term-label");
    if (label) label.innerText = "No terms available";
    throw new Error("No terms returned from /terms");
  }

  // choose active else first
  const active = appState.terms.find((t) => t.is_active) || appState.terms[0];
  appState.termId = Number(active.term_id);

  // set label
  const labelEl = document.getElementById("selected-term-label");
  if (labelEl)
    labelEl.innerText = safeText(active.label, `Term #${active.term_id}`);

  // ✅ render ALL terms into dropdown
  renderTermsDropdown();
}

async function loadSections(termId) {
  const secs = await fetchJSON(ENDPOINTS.sections(termId));
  const list = Array.isArray(secs) ? secs : [];

  // ensure "All"
  appState.sections = list.includes("All") ? list : ["All", ...list];
}

async function loadStudents(termId) {
  const rows = await fetchJSON(ENDPOINTS.students(termId));
  const list = Array.isArray(rows) ? rows : [];

  // Normalize to your dashboard needed fields
  appState.students = list
    .map((r) => ({
      id: safeText(
        r.school_id ?? r.student_school_id ?? r.student_id ?? r.id,
        "",
      ),
      name: safeText(
        r.full_name ??
          r.name ??
          `${safeText(r.first_name)} ${safeText(r.last_name)}`.trim(),
        "",
      ),
      dept: safeText(
        r.department ?? r.department_abbr ?? r.department_name,
        "",
      ),
      course: safeText(r.course ?? r.course_abbr ?? r.course_name, ""),
      year: safeText(r.year_level ?? r.year_level_name ?? r.year, ""),
      program: safeText(r.program ?? r.program_name ?? r.nstp_program, ""),
      section: safeText(r.section, ""),
      status: null,
    }))
    .filter((s) => s.id); // keep only with ids
}

function computeProgramsFromStudents() {
  const counts = {};
  const total = appState.students.length || 0;

  appState.students.forEach((s) => {
    const key = safeText(s.program, "Unknown");
    counts[key] = (counts[key] || 0) + 1;
  });

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  // Palette fallback
  const palette = [
    "#f97316",
    "#3b82f6",
    "#10b981",
    "#a855f7",
    "#ef4444",
    "#14b8a6",
    "#eab308",
    "#0ea5e9",
    "#22c55e",
    "#f43f5e",
  ];

  appState.programs = entries.map(([name, count], idx) => {
    const perc = total ? Math.round((count / total) * 100) : 0;
    return {
      id: name,
      name,
      perc,
      color: palette[idx % palette.length],
    };
  });
}

async function loadAttendanceMarks(termId, dateStr) {
  if (!termId || !dateStr) {
    appState.attendanceMarks = {};
    return;
  }
  try {
    const marks = await fetchJSON(ENDPOINTS.attendanceMarks(termId, dateStr));
    const list = Array.isArray(marks) ? marks : [];
    const map = {};

    list.forEach((m) => {
      const sid = safeText(
        m.student_school_id ?? m.school_id ?? m.student_id,
        "",
      );
      const status = m.status ?? m.in_status ?? null;
      if (!sid) return;
      map[sid] = { status: status || null };
    });

    appState.attendanceMarks = map;
  } catch (e) {
    // Attendance marks endpoint is optional; don't block dashboard
    appState.attendanceMarks = {};
    console.warn("Attendance marks not loaded:", e.message);
  }
}

/* =========================
   Dashboard UI
========================= */
function updateDashboardUI() {
  const activeLabel = document.getElementById("active-filter-label");
  if (activeLabel) {
    activeLabel.innerText = `Section: ${appState.selectedSection} • Program: ${appState.selectedProgram}`;
  }

  // ✅ Section pills: ALWAYS show All + A–Z as placeholders
  // If API provides sections, letters not present will be disabled/gray.
  const pillContainer = document.getElementById("section-pills");
  if (pillContainer) {
    const AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

    // Normalize API sections to a Set (exclude "All")
    const apiSecs = Array.isArray(appState.sections) ? appState.sections : [];
    const apiSet = new Set(
      apiSecs
        .filter((s) => String(s).toUpperCase() !== "ALL")
        .map((s) => String(s).toUpperCase()),
    );

    // Always render: All + A-Z
    const renderList = ["All", ...AZ];

    pillContainer.innerHTML = renderList
      .map((s) => {
        const isAll = s === "All";
        const exists = isAll ? true : apiSet.size ? apiSet.has(s) : true; // if API empty => keep enabled placeholders
        const isSelected = appState.selectedSection === s;

        // disabled placeholders if API has data and this letter doesn't exist
        const disabled = !isAll && apiSet.size > 0 && !exists;

        const baseClass =
          "px-3 py-1 text-[10px] font-bold rounded-lg transition-all";
        const selectedClass = "bg-darkCyan-600 text-white shadow-md";
        const normalClass = "bg-slate-50 text-slate-400 hover:bg-slate-100";
        const disabledClass =
          "bg-slate-50 text-slate-200 cursor-not-allowed opacity-60";

        const cls = [
          baseClass,
          disabled ? disabledClass : isSelected ? selectedClass : normalClass,
        ].join(" ");

        const onclick = disabled
          ? ""
          : `onclick="setSection('${String(s).replace(/'/g, "\\'")}')"`; // safe

        return `
        <button ${onclick} ${disabled ? "disabled" : ""} class="${cls}">
          ${s}
        </button>
      `;
      })
      .join("");
  }

  // Program list (computed dynamically)
  const progList = document.getElementById("program-list");
  if (progList) {
    if (!appState.programs.length) {
      progList.innerHTML = `
        <div class="text-xs font-bold text-slate-400 p-3 bg-slate-50 rounded-xl">
          No program data available.
        </div>
      `;
    } else {
      progList.innerHTML = appState.programs
        .map(
          (p) => `
        <button onclick="setProgram('${String(p.id).replace(/'/g, "\\'")}')"
          class="w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all
          ${appState.selectedProgram === p.id ? "bg-darkCyan-50 border-darkCyan-200" : "border-transparent hover:bg-slate-50"}">
          <div class="flex items-center gap-3">
            <div class="w-2 h-2 rounded-full" style="background-color: ${p.color}"></div>
            <span class="text-xs font-bold text-slate-700">${p.name}</span>
          </div>
          <span class="text-xs font-black text-darkCyan-950">${p.perc}%</span>
        </button>
      `,
        )
        .join("");
    }
  }

  // Pie segment uses selected program or top program
  let active = null;
  if (appState.selectedProgram !== "All") {
    active =
      appState.programs.find((p) => p.id === appState.selectedProgram) || null;
  } else {
    active = appState.programs[0] || {
      perc: 0,
      color: "#3a8787",
      name: "All Programs",
    };
  }

  const seg = document.getElementById("pie-segment");
  if (seg) {
    seg.style.color = active.color || "#3a8787";
    seg.setAttribute("stroke-dasharray", `${active.perc || 0} 100`);
  }

  const piePerc = document.getElementById("pie-perc");
  if (piePerc) piePerc.innerText = `${active.perc || 0}%`;

  const pieName = document.getElementById("pie-name");
  if (pieName) pieName.innerText = active.name || "Programs";

  renderPreviewTable("dashboard-tbody", 10);
}

function makeSectionOptions(selected) {
  const AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  return AZ.map(
    (letter) =>
      `<option value="${letter}" ${String(letter) === String(selected) ? "selected" : ""}>${letter}</option>`,
  ).join("");
}

function makeProgramOptions(selectedProgramNameOrId) {
  // We store students.program currently as NAME in your normalization.
  // We'll match by name (recommended) OR you can switch to program_id later.
  const selectedName = String(selectedProgramNameOrId ?? "").trim();

  return appState.programOptions
    .map((p) => {
      const name = String(p.program_name || "").trim();
      const selected = name === selectedName ? "selected" : "";
      return `<option value="${String(p.id)}" ${selected}>${name}</option>`;
    })
    .join("");
}

function openEditStudentModalFromMaster(schoolId) {
  appState.modal.returnState = captureModalState(); // ✅ save master list modal
  openEditStudentModal(schoolId); // ✅ reuse existing edit modal
}
function openEditStudentModal(schoolId) {
  const overlay = document.getElementById("modal-overlay");
  const container = document.getElementById("modal-container");
  if (!overlay || !container) return;

  const student = appState.students.find(
    (s) => String(s.id) === String(schoolId),
  );
  if (!student) {
    showSimpleModal("Not Found", `Student not found: ${schoolId}`);
    return;
  }

  overlay.classList.remove("hidden");
  container.classList.remove("max-w-4xl");
  container.classList.remove("max-w-lg");
  container.classList.add("max-w-sm");

  const currentSection = safeText(student.section, "A");
  const currentProgramName = safeText(student.program, "");

  container.innerHTML = `
    <div class="p-6">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="text-sm font-black uppercase tracking-widest text-darkCyan-950">Edit Student</h2>
          <p class="text-[10px] text-slate-400 mt-1">
            ${safeText(student.name, "—")} • <span class="font-bold">${safeText(student.id, "—")}</span>
          </p>
        </div>
        <button onclick="closeModal()" class="w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-400 rounded-full hover:bg-rose-50 hover:text-rose-500 transition-all">
          <i class="fa-solid fa-xmark text-xs"></i>
        </button>
      </div>

      <div class="mt-5 space-y-4">

        <div>
          <label class="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Program</label>
          <select id="edit-program"
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-darkCyan-500">
            ${makeProgramOptions(currentProgramName)}
          </select>
         <p class="text-[9px] text-slate-400 mt-2">
  Update the student’s NSTP program.
</p>
        </div>

        <div>
          <label class="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Section</label>
          <select id="edit-section"
            class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-darkCyan-500">
            ${makeSectionOptions(currentSection)}
          </select>
        </div>

        <button
          onclick="saveStudentEdits('${String(student.id).replace(/'/g, "\\'")}')"
          class="w-full py-3 bg-darkCyan-950 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:brightness-110 active:scale-95 transition-all"
        >
          Save Changes
        </button>
      </div>
    </div>
  `;

  setTimeout(() => {
    container.classList.replace("scale-95", "scale-100");
    container.classList.replace("opacity-0", "opacity-100");
  }, 10);
}
async function saveStudentEdits(schoolId) {
  const progSel = document.getElementById("edit-program");
  const secSel = document.getElementById("edit-section");
  if (!progSel || !secSel) return;

  const programId = progSel.value; // from nstp_program.id
  const section = secSel.value; // A-Z
  const programObj = appState.programOptions.find(
    (p) => String(p.id) === String(programId),
  );
  const programName = programObj ? programObj.program_name : "";

  try {
    // ✅ backend should update student record
    // RECOMMENDED DB: nstp_student.program_id (int FK) + section (varchar)
    await fetchJSONPut(ENDPOINTS.updateStudent(schoolId), {
      nstp_program_id: Number(programId),
      section,
    });

    // ✅ update local state so UI updates instantly
    const idx = appState.students.findIndex(
      (s) => String(s.id) === String(schoolId),
    );
    if (idx !== -1) {
      appState.students[idx].section = section;

      // your UI currently displays program NAME in student.program
      // keep it consistent:
      appState.students[idx].program = programName;
    }

    // refresh computed program distribution + UI
    computeProgramsFromStudents();
    updateDashboardUI();

    showSimpleModal("Saved", "Student record updated.");
  } catch (e) {
    console.error(e);
    showSimpleModal(
      "Update Failed",
      safeText(e.message, "Could not update student."),
    );
  }
}
function renderPreviewTable(targetId, limit = null) {
  const container = document.getElementById(targetId);
  if (!container) return;

  let filtered = appState.students;

  if (appState.selectedSection !== "All")
    filtered = filtered.filter((s) => s.section === appState.selectedSection);
  if (appState.selectedProgram !== "All")
    filtered = filtered.filter((s) => s.program === appState.selectedProgram);

  const display = limit ? filtered.slice(0, limit) : filtered;

  container.innerHTML = display
    .map((s) => {
      const mark = appState.attendanceMarks[s.id] || { status: null };
      const statusHtml = mark.status
        ? `<span class="status-dot status-${mark.status} mr-2"></span>`
        : '<span class="w-2 h-2 inline-block mr-2 bg-gray-300 rounded-full"></span>';

      return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="px-6 py-4 font-bold text-darkCyan-900 flex items-center">${statusHtml}${safeText(s.id, "—")}</td>
        <td class="px-6 py-4">${safeText(s.name, "—")}</td>
        <td class="px-6 py-4">${safeText(s.dept, "—")}</td>
        <td class="px-6 py-4">${safeText(s.course, "—")}</td>
        <td class="px-6 py-4">${safeText(s.year, "—")}</td>
        <td class="px-6 py-4">
          <span class="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold"
            style="color: ${appState.programs.find((p) => p.id === s.program)?.color || "#3a8787"}">
            ${safeText(s.program, "—")}
          </span>
        </td>
        <td class="px-6 py-4 text-center font-black">${safeText(s.section, "—")}</td>

        <!-- ✅ NEW Action -->
        <td class="px-6 py-4">
      <button
        onclick="openEditStudentModal('${String(s.id).replace(/'/g, "\\'")}')"
        class="w-9 h-9 inline-flex items-center justify-center rounded-xl bg-slate-50 border border-slate-200
               text-slate-500 hover:bg-darkCyan-50 hover:text-darkCyan-700 hover:border-darkCyan-200 transition"
        title="Edit student"
      >
        <i class="fa-solid fa-pen-to-square text-xs"></i>
      </button>
    </td>
      </tr>
    `;
    })
    .join("");

  if (targetId === "dashboard-tbody") {
    const preview = document.getElementById("preview-count");
    if (preview) preview.innerText = `${filtered.length} Students`;
  }
}

function setSection(s) {
  appState.selectedSection = s;
  // Also re-apply modal filter if open
  updateDashboardUI();
}

function setProgram(p) {
  appState.selectedProgram = appState.selectedProgram === p ? "All" : p;
  updateDashboardUI();
}

/* =========================
   Modal: Master List
========================= */
function showMasterListModal() {
  const overlay = document.getElementById("modal-overlay");
  const container = document.getElementById("modal-container");
  if (!overlay || !container) return;

  overlay.classList.remove("hidden");
  container.classList.replace("max-w-lg", "max-w-4xl");

  container.innerHTML = `
    <div class="p-6 h-[85vh] flex flex-col">

      <!-- Top Row: Title + Search + Download -->
      <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">

        <!-- Left: Title -->
        <div>
          <h2 class="text-lg font-black text-darkCyan-950 uppercase tracking-tight">
            Master Directory
          </h2>
          <p class="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">
            Export or browse student records
          </p>
        </div>

        <!-- Right: Search + Button -->
        <div class="flex items-center gap-3 w-full lg:w-auto">

          <!-- Search -->
          <div class="relative flex-grow lg:w-72">
            <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-xs"></i>
            <input
              id="modal-search"
              onkeyup="filterModalTable()"
              type="text"
              placeholder="Search..."
              class="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-medium outline-none focus:ring-2 focus:ring-darkCyan-500"
            >
          </div>

          <!-- Download Button -->
       <button
  onclick="exportMasterListCSV()"
  class="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap flex items-center gap-2"
>
  <i class="fa-solid fa-download text-xs"></i>
  Export CSV
</button>

          <!-- Close Button -->
          <button
            onclick="closeModal()"
            class="w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-400 rounded-full hover:bg-rose-50 hover:text-rose-500 transition-all shadow-sm"
          >
            <i class="fa-solid fa-xmark text-xs"></i>
          </button>

        </div>
      </div>

      <div class="flex-grow overflow-y-auto custom-scrollbar border border-slate-100 rounded-3xl">
        <table class="w-full text-left">
          <thead class="sticky top-0 bg-white shadow-sm text-[9px] font-black uppercase text-slate-400 border-b border-slate-100 z-10">
            <tr>
              <th class="px-5 py-3">ID</th>
              <th class="px-5 py-3">Name</th>
              <th class="px-5 py-3">Department</th>
              <th class="px-5 py-3">Course</th>
              <th class="px-5 py-3">Year</th>
              <th class="px-5 py-3">Program</th>
              <th class="px-5 py-3 text-center">Section</th>
              <th class="px-5 py-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody id="modal-tbody" class="divide-y divide-slate-50 text-xs text-slate-600"></tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="flex items-center justify-between mt-6">
        <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          <span id="modal-page-info"></span>
        </div>
        <div class="flex items-center gap-2">
          <button onclick="changeModalPage(-1)"
            class="px-4 py-2 bg-slate-100 rounded-xl text-[10px] font-bold hover:bg-slate-200">
            Prev
          </button>
          <button onclick="changeModalPage(1)"
            class="px-4 py-2 bg-slate-100 rounded-xl text-[10px] font-bold hover:bg-slate-200">
            Next
          </button>
        </div>
      </div>

    </div>
  `;

  // Apply current dashboard filters to modal
  let filtered = appState.students;

  if (appState.selectedSection !== "All") {
    filtered = filtered.filter((s) => s.section === appState.selectedSection);
  }
  if (appState.selectedProgram !== "All") {
    filtered = filtered.filter((s) => s.program === appState.selectedProgram);
  }

  appState.modal.filteredData = filtered;
  appState.modal.currentPage = 1;
  renderModalTable();

  setTimeout(() => {
    container.classList.replace("scale-95", "scale-100");
    container.classList.replace("opacity-0", "opacity-100");
  }, 10);
}
function slugifyFilePart(v, fallback = "All") {
  const s = String(v ?? "").trim();
  const base = s && s !== "All" ? s : fallback;
  return base
    .replace(/[\/\\:*?"<>|]/g, "") // windows-illegal chars
    .replace(/\s+/g, "_")
    .replace(/[^\w\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}
function exportMasterListCSV() {
  // export whatever the modal is currently showing (after filters + search)
  const rows = appState?.modal?.filteredData?.length
    ? appState.modal.filteredData
    : appState.students;

  if (!rows.length) {
    showSimpleModal(
      "Nothing to Export",
      "No students found for current filters.",
    );
    return;
  }

  const headers = [
    "ID",
    "Name",
    "Department",
    "Course",
    "Year",
    "Program",
    "Section",
  ];

  const escapeCSV = (v) => {
    const s = String(v ?? "");
    // wrap in quotes if it contains comma/quote/newline
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines = [
    headers.join(","),
    ...rows.map((s) =>
      [s.id, s.name, s.dept, s.course, s.year, s.program, s.section]
        .map(escapeCSV)
        .join(","),
    ),
  ];

  const csv = lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const programPart = slugifyFilePart(appState.selectedProgram, "All_Programs");
  const sectionPart = slugifyFilePart(appState.selectedSection, "All_Sections");

  const termPart = slugifyFilePart(
    document.getElementById("selected-term-label")?.innerText,
    "term",
  );

  const dateStr = safeText(appState.selectedDate, formatTodayISO());

  const filename = `master_list_${termPart}_${programPart}_${sectionPart}_${dateStr}.csv`;
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  // optional: show “done”
  showExportCompactModal();
}

function closeModal() {
  // ✅ if edit modal was opened from master list, go back to master list
  if (appState?.modal?.returnState) {
    const state = appState.modal.returnState;
    appState.modal.returnState = null;
    restoreModalState(state);
    return;
  }

  const container = document.getElementById("modal-container");
  if (!container) return;

  container.classList.replace("scale-100", "scale-95");
  container.classList.replace("opacity-100", "opacity-0");

  setTimeout(() => {
    const overlay = document.getElementById("modal-overlay");
    if (overlay) overlay.classList.add("hidden");

    // restore width
    container.classList.remove("max-w-sm");
    container.classList.replace("max-w-4xl", "max-w-lg");
  }, 300);
}
function showSimpleModal(title, msg) {
  const overlay = document.getElementById("modal-overlay");
  const container = document.getElementById("modal-container");
  if (!overlay || !container) return;

  overlay.classList.remove("hidden");
  container.innerHTML = `
    <div class="p-10 text-center">
      <h2 class="text-xl font-black text-darkCyan-950 mb-2 uppercase">${title}</h2>
      <p class="text-slate-400 text-xs mb-8">${msg}</p>
      <button onclick="closeModal()" class="w-full py-4 bg-darkCyan-950 text-white rounded-2xl font-black uppercase tracking-widest text-[10px]">
        Close
      </button>
    </div>
  `;
  setTimeout(() => {
    container.classList.replace("scale-95", "scale-100");
    container.classList.replace("opacity-0", "opacity-100");
  }, 10);
}

/* =========================================================
   ✅ Keep your robust logout
========================================================= */
async function logout() {
  try {
    // ✅ destroy server session too
    await fetch("/api/nstp/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch (e) {
    console.warn("Logout request failed:", e);
  } finally {
    // ✅ clear saved browser data
    try {
      localStorage.removeItem("backupUser");
      localStorage.removeItem("loggedUser");
      localStorage.removeItem("nstp_school_id");
      localStorage.removeItem("nstp_attendance_last_date_ui");
      localStorage.removeItem("mt_sidebar_expanded");
      sessionStorage.clear();
    } catch (e) {
      console.warn("Storage cleanup failed:", e);
    }

    const overlay = document.getElementById("modal-overlay");
    const container = document.getElementById("modal-container");
    if (container) {
      container.classList.replace("scale-100", "scale-95");
      container.classList.replace("opacity-100", "opacity-0");
    }

    setTimeout(() => {
      if (overlay) overlay.classList.add("hidden");
      window.location.href = "../MT_login/MT_login.html";
    }, 300);
  }
}

/* Keep these navigation helpers */
function goToAttendance() {
  window.location.href = "../MT_attendance/MT_attendance.html";
}
function goToDashboard() {
  window.location.href = "../MT_dashboard/MT_dashboard.html";
}
function goToReport() {
  window.location.href = "../MT_report/MT_report.html";
}

/* Close fancy dropdown when clicking outside */
window.onclick = (e) => {
  const menu = document.getElementById("fancy-dropdown-options");
  const trigger = document.getElementById("fancy-dropdown-trigger");

  if (
    menu &&
    trigger &&
    !menu.classList.contains("hidden") &&
    !trigger.contains(e.target) &&
    !menu.contains(e.target)
  ) {
    closeFancyDropdown();
  }
};

/* =========================
   Modal Table (pagination + filter)
========================= */
function renderModalTable() {
  const tbody = document.getElementById("modal-tbody");
  if (!tbody) return;

  const { currentPage, rowsPerPage, filteredData } = appState.modal;
  const start = (currentPage - 1) * rowsPerPage;
  const end = start + rowsPerPage;
  const pageData = filteredData.slice(start, end);

  tbody.innerHTML = pageData
    .map(
      (s) => `
  <tr class="hover:bg-slate-50 transition-colors">
    <td class="p-6 font-bold text-darkCyan-900">${safeText(s.id, "—")}</td>
    <td class="p-6">${safeText(s.name, "—")}</td>
    <td class="p-6">${safeText(s.dept, "—")}</td>
    <td class="p-6">${safeText(s.course, "—")}</td>
    <td class="p-6">${safeText(s.year, "—")}</td>

    <td class="p-6">
      <span class="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold"
        style="color: ${appState.programs.find((p) => p.id === s.program)?.color || "#3a8787"}">
        ${safeText(s.program, "—")}
      </span>
    </td>

    <td class="p-6 text-center font-black">${safeText(s.section, "—")}</td>

    <!-- ✅ NEW ACTION COLUMN -->
    <td class="p-6 text-center">
      <button
        onclick="openEditStudentModalFromMaster('${String(s.id).replace(/'/g, "\\'")}')"
        class="w-9 h-9 inline-flex items-center justify-center rounded-xl bg-slate-50 border border-slate-200
               text-slate-500 hover:bg-darkCyan-50 hover:text-darkCyan-700 hover:border-darkCyan-200 transition"
        title="Edit student"
      >
        <i class="fa-solid fa-pen-to-square text-xs"></i>
      </button>
    </td>
  </tr>
`,
    )
    .join("");

  updateModalPaginationInfo();
}

function updateModalPaginationInfo() {
  const pageInfo = document.getElementById("modal-page-info");
  if (!pageInfo) return;

  const { currentPage, rowsPerPage, filteredData } = appState.modal;
  const total = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(total / rowsPerPage));

  pageInfo.innerText = `Page ${currentPage} of ${totalPages} • ${total} Students`;
}

function changeModalPage(direction) {
  const { currentPage, rowsPerPage, filteredData } = appState.modal;
  if (!filteredData.length) return;

  const totalPages = Math.max(1, Math.ceil(filteredData.length / rowsPerPage));
  let newPage = currentPage + direction;
  if (newPage < 1) newPage = 1;
  if (newPage > totalPages) newPage = totalPages;

  appState.modal.currentPage = newPage;
  renderModalTable();
}

function filterModalTable() {
  const input = document.getElementById("modal-search");
  const query = (input ? input.value : "").toLowerCase();

  // Use current dashboard filters first, then search
  let base = appState.students;

  if (appState.selectedSection !== "All") {
    base = base.filter((s) => s.section === appState.selectedSection);
  }
  if (appState.selectedProgram !== "All") {
    base = base.filter((s) => s.program === appState.selectedProgram);
  }

  appState.modal.filteredData = base.filter(
    (s) =>
      safeText(s.name).toLowerCase().includes(query) ||
      safeText(s.id).toLowerCase().includes(query) ||
      safeText(s.program).toLowerCase().includes(query) ||
      safeText(s.dept).toLowerCase().includes(query) ||
      safeText(s.course).toLowerCase().includes(query) ||
      safeText(s.section).toLowerCase().includes(query),
  );

  appState.modal.currentPage = 1;
  renderModalTable();
}

/* =========================
   Export Compact Modal
========================= */
function showExportCompactModal() {
  const overlay = document.getElementById("modal-overlay");
  const container = document.getElementById("modal-container");
  if (!overlay || !container) return;

  overlay.classList.remove("hidden");

  // Reset width for compact modal
  container.classList.remove("max-w-4xl");
  container.classList.remove("max-w-lg");
  container.classList.add("max-w-sm");

  container.innerHTML = `
    <div class="p-6 text-center flex flex-col gap-4">
      <h2 class="text-sm font-black uppercase tracking-widest text-darkCyan-950">
        Export Ready
      </h2>

      <p class="text-[10px] text-slate-400">
        Your Excel / CSV file is ready to download.
      </p>

      <button onclick="closeExportModalRestore()"
        class="w-full py-2 bg-emerald-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-900 transition">
        Close
      </button>
    </div>
  `;

  setTimeout(() => {
    container.classList.replace("scale-95", "scale-100");
    container.classList.replace("opacity-0", "opacity-100");
  }, 10);
}

function closeExportModalRestore() {
  const container = document.getElementById("modal-container");
  if (container) {
    container.classList.remove("max-w-sm");
    container.classList.add("max-w-4xl"); // restore master modal width
  }
  closeModal();
}

/* =========================
   Init (DYNAMIC)
========================= */
window.onload = async () => {
  // ✅ DEMO DATA
  appState.terms = [
    {
      term_id: 1,
      label: "AY 2025-2026",
      is_active: true,
    },
  ];

  appState.termId = 1;

  appState.sections = ["All", "A", "B", "C"];

  appState.students = [
    {
      id: "2025-0001",
      name: "Juan Dela Cruz",
      dept: "CEAC",
      course: "BSIT",
      year: "3",
      program: "CWTS",
      section: "A",
    },
    {
      id: "2025-0002",
      name: "Maria Santos",
      dept: "CBGA",
      course: "BSBA",
      year: "2",
      program: "ROTC",
      section: "B",
    },
    {
      id: "2025-0003",
      name: "John Reyes",
      dept: "CAS",
      course: "BSCrim",
      year: "1",
      program: "LTS",
      section: "C",
    },
    {
      id: "2025-0004",
      name: "Diana Dela Cruz",
      dept: "CAS",
      course: "BSPsych",
      year: "3",
      program: "CWTS",
      section: "A",
    },
    {
      id: "2025-0005",
      name: "Ken Santos",
      dept: "CBGA",
      course: "BSBA",
      year: "2",
      program: "ROTC",
      section: "B",
    },
    {
      id: "2025-0006",
      name: "Knox Reyes",
      dept: "CAS",
      course: "BSPsych",
      year: "1",
      program: "LTS",
      section: "C",
    },
    {
      id: "2025-0007",
      name: "Anna Reyes",
      dept: "CEAC",
      course: "BSIT",
      year: "2",
      program: "LTS",
      section: "C",
    },
  ];

  computeProgramsFromStudents();

  const labelEl = document.getElementById("selected-term-label");

  if (labelEl) {
    labelEl.innerText = "AY 2025-2026";
  }

  renderTermsDropdown();
  updateDashboardUI();

  document
    .getElementById("btnShowAll")
    ?.addEventListener("click", showMasterListModal);

  updateClock();
};
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
// run once immediately
updateHeaderDate();
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

/* Expose functions used by inline HTML handlers */
window.toggleFancyDropdown = toggleFancyDropdown;
window.selectTerm = selectTerm;
window.showMasterListModal = showMasterListModal;
window.closeModal = closeModal;
window.setSection = setSection;
window.setProgram = setProgram;
window.filterModalTable = filterModalTable;
window.changeModalPage = changeModalPage;
window.showExportCompactModal = showExportCompactModal;
window.closeExportModalRestore = closeExportModalRestore;
window.safeSwitchTab = safeSwitchTab;
window.logout = logout;
window.goToAttendance = goToAttendance;
window.goToDashboard = goToDashboard;
window.goToReport = goToReport;
window.openEditStudentModal = openEditStudentModal;
window.saveStudentEdits = saveStudentEdits;
window.exportMasterListCSV = exportMasterListCSV;
window.openEditStudentModalFromMaster = openEditStudentModalFromMaster; // ✅ NEW
