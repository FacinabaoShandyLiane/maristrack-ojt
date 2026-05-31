let state = {
  semester: {
    year: "Set Year in Manage Semester to Show Year",
    term: "Not Set",
  },
  termId: null,
  activeTermId: null, // ✅ add
  hasActiveTerm: false,
  yearId: null,
  programs: [],
  programColors: {
    ROTC: "rose",
    LTS: "blue",
    CWTS: "emerald",
    DEFAULT: "darkCyan",
  },
  yearLevels: [],
  sections: ["All", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")],
  departments: ["CAS", "CBA", "CTE", "COE", "CON", "CCIS"],
  courses: {
    CAS: ["BA Comm", "BS Psych", "BS Bio"],
    CBA: ["BSBA", "BSA", "BSHM"],
    CTE: ["BSED", "BEED"],
    CCIS: ["BSCS", "BSIT", "BSIS"],
  },

  students: [],
  logs: {},

  selectedProgram: "All", // now holds program_name
  selectedSection: "All",
  selectedDate: "",
  markAsMode: "green",
  isSidebarExpanded: true,
};

/* --- API BASE (NSTP Attendance) --- */
const NSTP_API = "/api/nstp/attendance";
// ================================
// PERSIST LAST SELECTED DATE
// ================================
const LS_LAST_DATE_KEY = "nstp_attendance_last_date_ui"; // stores "FEB 25, 2026"

function saveLastSelectedDate(uiDate) {
  try {
    if (!uiDate) return;
    localStorage.setItem(LS_LAST_DATE_KEY, String(uiDate));
  } catch (e) {
    console.warn("localStorage save failed:", e);
  }
}

function getLastSelectedDate() {
  try {
    return localStorage.getItem(LS_LAST_DATE_KEY) || "";
  } catch (e) {
    console.warn("localStorage read failed:", e);
    return "";
  }
}
/* --- PROGRAMS API HELPERS (DB) --- */
// async function apiJSON(url, options = {}) {
//   const res = await fetch(url, { credentials: "include", ...options });
//   let data = null;
//   try {
//     data = await res.json();
//   } catch (_) {}
//   if (!res.ok) {
//     const msg = data?.message || `Request failed (${res.status})`;
//     throw new Error(msg);
//   }
//   return data;
// }

function normalizeProgramName(name) {
  return String(name || "").trim();
}
// ================================
// LOAD ATTENDANCE LOGS FOR A DATE
// ================================
async function loadAttendanceLogsFromDB(uiDate) {
  if (!uiDate) return;

  const iso = uiDateToISO(uiDate);
  if (!iso) return;

  // Expected: [{ student_school_id, in_status, in_time, out_status, out_time }, ...]
  const rows = await apiJSON(
    `${NSTP_API}/attendance-log?session_date=${encodeURIComponent(iso)}`,
  );

  // clear logs for this date ONLY, then refill
  // (optional) keep other dates if you want multi-date caching
  // We'll just overwrite keys for this selected date.
  if (!Array.isArray(rows)) return;

  rows.forEach((r) => {
    const sid = String(r.student_school_id ?? "").trim();
    if (!sid) return;

    const key = `${sid}_${uiDate}`; // IMPORTANT: UI DATE key, not ISO
    state.logs[key] = {
      in: r.in_status ? { status: r.in_status, time: r.in_time || "" } : null,
      out: r.out_status
        ? { status: r.out_status, time: r.out_time || "" }
        : null,
    };
  });
}
// //async function loadStudentsFromDB() {
//   const list = await apiJSON(`${NSTP_API}/students`);
//   const all = Array.isArray(list) ? list : [];

//   // ✅ If term is set, only show students for this term
//   const filtered =
//     state.hasActiveTerm && state.termId
//       ? all.filter((s) => Number(s.term_id) === Number(state.termId))
//       : all;

//   state.students = filtered.map((s) => ({
//     id: String(s.id || "").trim(),
//     name: String(s.name || "").trim(),
//     dept: String(s.dept || "").trim(),
//     course: String(s.course_abbr || "").trim(),
//     year: String(s.year_level || "").trim(),
//     program: String(s.program || "").trim(),
//     section: String(s.section || "")
//       .trim()
//       .toUpperCase(),

//     // optional keep
//     term_id: s.term_id,
//   }));

//   sortStudents();
// }

// async function loadCoursesFromDB() {
//   const list = await apiJSON(`${NSTP_API}/courses`);
//   state.courses = Array.isArray(list) ? list : [];
// }

// async function loadYearLevelsFromDB() {
//   const list = await apiJSON(`${NSTP_API}/year-levels`);
//   state.yearLevels = Array.isArray(list) ? list : [];
// }
// //async function loadProgramsFromDB() {
//   // Expected response: [{ id, program_name }, ...]
//   const list = await apiJSON(`${NSTP_API}/programs`);
//   state.programs = Array.isArray(list) ? list : [];

//   // keep selectedProgram valid
//   const exists =
//     state.selectedProgram === "All" ||
//     state.programs.some((p) => p.program_name === state.selectedProgram);

//   if (!exists) state.selectedProgram = "All";
// }

(function initModernSidebar_Attendance() {
  const sidebar = document.getElementById("sidebar");
  const indicator = document.getElementById("indicator");
  const navItems = Array.from(document.querySelectorAll(".nav-item"));
  const btnToggle = document.getElementById("btnToggleSidebar");

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
          (b.dataset.route || b.getAttribute("data-route")) === "attendance",
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
})();

function openModal(html) {
  const overlay = document.getElementById("modal-overlay");
  const container = document.getElementById("modal-container");
  container.innerHTML = html;
  overlay.classList.remove("hidden");
  setTimeout(() => container.classList.add("modal-active"), 10);
}

function closeModal() {
  document
    .querySelectorAll(".dropdown-menu")
    .forEach((m) => m.classList.add("hidden"));
  document.getElementById("modal-container").classList.remove("modal-active");
  setTimeout(
    () => document.getElementById("modal-overlay").classList.add("hidden"),
    200,
  );
}

function showSuccess(msg) {
  openModal(
    `<div class="text-center p-6">
      <div class="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
        <i class="fa-solid fa-check text-2xl"></i>
      </div>
      <h2 class="text-xl font-black text-slate-900 mb-1 uppercase tracking-tight">Success</h2>
      <p class="text-slate-500 font-bold text-[10px] uppercase tracking-widest">${msg}</p>
    </div>`,
  );
  setTimeout(closeModal, 1800);
}

function showFancyInvalid(msg) {
  openModal(
    `<div class="text-center p-6">
      <div class="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
        <i class="fa-solid fa-circle-exclamation text-2xl"></i>
      </div>
      <h2 class="text-xl font-black text-slate-900 mb-1 uppercase tracking-tight">Invalid Action</h2>
      <p class="text-slate-500 font-bold text-[10px] uppercase tracking-widest">${msg}</p>
      <button onclick="closeModal()" class="mt-6 w-full py-4 bg-slate-950 text-white rounded-2xl font-black text-xs uppercase tracking-widest">Try Again</button>
    </div>`,
  );
}

function getProgColor(prog) {
  const colors = [
    "rose",
    "blue",
    "emerald",
    "amber",
    "violet",
    "indigo",
    "orange",
    "sky",
  ];
  if (state.programColors[prog]) return state.programColors[prog];
  const hash = (prog || "").split("").reduce((a, b) => a + b.charCodeAt(0), 0);
  state.programColors[prog] = colors[hash % colors.length];
  return state.programColors[prog];
}

function calculateCurrentStats() {
  let stats = {
    total: state.students.length,
    pIn: 0,
    pOut: 0,
    lIn: 0,
    lOut: 0,
    eIn: 0,
    eOut: 0,
    eoOut: 0,
    aIn: 0,
    aOut: 0,
  };

  state.students.forEach((s) => {
    const log = state.logs[`${s.id}_${state.selectedDate}`];
    if (log) {
      if (log.in) {
        if (log.in.status === "green") stats.pIn++;
        else if (log.in.status === "yellow") stats.lIn++;
        else if (log.in.status === "gray") stats.eIn++;
        else if (log.in.status === "red") stats.aIn++;
      } else stats.aIn++;

      if (log.out) {
        if (log.out.status === "green") stats.pOut++;
        else if (log.out.status === "yellow") stats.lOut++;
        else if (log.out.status === "gray") stats.eOut++;
        else if (log.out.status === "blue") stats.eoOut++;
        else if (log.out.status === "red") stats.aOut++;
      } else stats.aOut++;
    } else {
      stats.aIn++;
      stats.aOut++;
    }
  });
  return stats;
}

function updateStats() {
  const s = calculateCurrentStats();
  const elTotal = document.getElementById("stat-total");
  if (!elTotal) return;

  elTotal.textContent = s.total;

  document.getElementById("stat-p-in").textContent = s.pIn;
  document.getElementById("stat-p-out").textContent = s.pOut;

  document.getElementById("stat-l-in").textContent = s.lIn;
  document.getElementById("stat-l-out").textContent = s.lOut;

  document.getElementById("stat-e-in").textContent = s.eIn;
  document.getElementById("stat-e-out").textContent = s.eOut;

  // ✅ NEW (Early Out)
  const eo = document.getElementById("stat-eo-out");
  if (eo) eo.textContent = s.eoOut;

  document.getElementById("stat-a-in").textContent = s.aIn;
  document.getElementById("stat-a-out").textContent = s.aOut;
}

function renderSectionFilters() {
  const container = document.getElementById("section-filters");
  if (!container) return;

  container.innerHTML = state.sections
    .map(
      (s) =>
        `<button onclick="selectSection('${s}')" class="px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all shrink-0 ${
          state.selectedSection === s
            ? "bg-darkCyan-600 text-white shadow-md"
            : "text-slate-500 hover:bg-white"
        }">${s}</button>`,
    )
    .join("");
}

function renderProgramSelection() {
  const container = document.getElementById("program-selector");
  if (!container) return;

  document.getElementById("program-count").textContent = state.programs.length;

  const allBtn = `<button onclick="selectProgram('All')" class="flex items-center gap-4 p-4 rounded-2xl border-2 transition-all shrink-0 mb-2 ${
    state.selectedProgram === "All"
      ? "bg-darkCyan-900 border-darkCyan-900 text-white shadow-lg"
      : "bg-slate-50 border-transparent text-slate-500 hover:bg-slate-100"
  }"><div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-black text-xs">ALL</div><span class="font-bold text-sm">All Students</span></button>`;

  container.innerHTML =
    allBtn +
    state.programs
      .map((pObj) => {
        const p = pObj.program_name;
        const isActive = state.selectedProgram === p;
        const color = getProgColor(p);
        return `<button onclick="selectProgram('${p.replace(/'/g, "\\'")}')" class="flex items-center justify-between p-4 rounded-2xl border-2 transition-all group shrink-0 mb-2 ${
          isActive
            ? `bg-${color}-600 border-${color}-600 text-white shadow-lg`
            : "bg-slate-50 border-transparent text-slate-500 hover:bg-slate-100"
        }">
          <div class="flex items-center gap-3">
            <div class="w-2 h-8 rounded-full ${isActive ? "bg-white/40" : `bg-${color}-500`}"></div>
            <span class="font-bold text-sm">${p}</span>
          </div>
          <i class="fa-solid fa-chevron-right text-[10px] opacity-30"></i>
        </button>`;
      })
      .join("");
}

function sortStudents() {
  state.students.sort((a, b) => a.name.localeCompare(b.name));
}

function renderTable() {
  sortStudents();
  const query = (
    document.getElementById("search-input")?.value || ""
  ).toLowerCase();
  const tbody = document.getElementById("attendance-tbody");
  if (!tbody) return;

  tbody.innerHTML = state.students
    .filter((s) => {
      if (
        state.selectedProgram !== "All" &&
        s.program !== state.selectedProgram
      )
        return false;
      if (
        state.selectedSection !== "All" &&
        s.section !== state.selectedSection
      )
        return false;
      if (
        query &&
        !s.name.toLowerCase().includes(query) &&
        !s.id.includes(query)
      )
        return false;
      return true;
    })
    .map((s) => {
      const log = state.logs[`${s.id}_${state.selectedDate}`] || {
        in: null,
        out: null,
      };
      const color = getProgColor(s.program);

      return `<tr class="hover:bg-slate-50/80 transition-all border-b border-slate-50">
        <td class="px-6 py-5 font-bold text-slate-900">${s.id}</td>
        <td class="px-6 py-5 font-semibold text-slate-700">${s.name}</td>
        <td class="px-6 py-5">
          <span class="px-3 py-1 bg-${color}-50 text-${color}-600 rounded-lg text-[10px] font-black uppercase tracking-wider border border-${color}-100">${s.program}</span>
        </td>
        <td class="px-6 py-5 font-black text-darkCyan-600">${s.section || "-"}</td>
        <td class="px-6 py-5 text-center">
          <div onclick="handleCheck('${s.id}', 'in')" class="fancy-check ${log.in ? "checked-" + log.in.status : ""}">
            <div class="timestamp-tooltip">${log.in ? log.in.time : "No Log"}</div>
          </div>
        </td>
        <td class="px-6 py-5 text-center">
          <div onclick="handleCheck('${s.id}', 'out')" class="fancy-check ${log.out ? "checked-" + log.out.status : ""}">
            <div class="timestamp-tooltip">${log.out ? log.out.time : "No Log"}</div>
          </div>
        </td>
      </tr>`;
    })
    .join("");
}

function updateDisplay() {
  document.getElementById("current-semester-display").textContent =
    `S.Y. ${state.semester.year} | ${state.semester.term.toUpperCase()}`;
  document.getElementById("header-date-indicator").textContent =
    state.selectedDate || "NO ACTIVE DATE";
  document.getElementById("display-date").textContent =
    state.selectedDate || "NO DATE SET";

  createCustomSelect(
    "mark-as-dropdown-container",
    [
      { value: "green", label: "Present", color: "text-emerald-500" },
      { value: "yellow", label: "Late", color: "text-amber-500" },
      { value: "gray", label: "Excused", color: "text-slate-500" },

      // ✅ NEW
      { value: "blue", label: "Early Out", color: "text-blue-500" },

      { value: "red", label: "Absent", color: "text-rose-500" },
    ],
    state.markAsMode,
    "onMarkAsChange",
    "h-12",
    true,
  );

  renderProgramSelection();
  renderSectionFilters();
  renderTable();
  updateStats();
}

/* --- EVENT HANDLERS --- */
window.onMarkAsChange = (v) => {
  state.markAsMode = v;
};

function selectSection(s) {
  state.selectedSection = s;
  updateDisplay();
}

function selectProgram(p) {
  state.selectedProgram = p;

  // if selected program no longer exists, reset
  if (
    state.selectedProgram !== "All" &&
    !state.programs.some((x) => x.program_name === state.selectedProgram)
  ) {
    state.selectedProgram = "All";
  }
  updateDisplay();
}

function handleCheck(id, type) {
  if (!state.selectedDate) {
    openModal(`
      <div class="text-center p-6">
        <div class="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <i class="fa-solid fa-calendar-xmark text-2xl"></i>
        </div>
        <h2 class="text-xl font-black mb-2 uppercase text-slate-900 tracking-tight">No Date Set</h2>
        <p class="text-slate-500 mb-8 text-sm font-bold uppercase tracking-widest leading-relaxed">Please set the attendance date first.</p>
        <button onclick="openSetDateModal()" class="w-full py-4 bg-darkCyan-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all">Set Date</button>
      </div>
    `);
    return;
  }

  if (type !== "in" && type !== "out") return;

  const now12h = () => {
    const d = new Date();
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, "0");
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12;
    if (h === 0) h = 12;
    return `${String(h).padStart(2, "0")}:${m} ${ap}`;
  };

  const key = `${id}_${state.selectedDate}`;
  if (!state.logs[key]) state.logs[key] = { in: null, out: null };

  // ✅ NEW: enforce Early Out (blue) rules
  if (state.markAsMode === "blue") {
    // Early Out applies only to OUT
    if (type !== "out") {
      return showFancyInvalid("Early Out can only be marked on OUT.");
    }

    const inLog = state.logs[key].in;
    if (!inLog || inLog.status !== "green") {
      return showFancyInvalid(
        "Early Out is allowed only if IN is Present (green).",
      );
    }
  }

  const current = state.logs[key][type];

  state.logs[key][type] =
    current?.status === state.markAsMode
      ? null
      : {
          status: state.markAsMode,
          time: now12h(),
        };

  renderTable();
  updateStats();

  queueAutosave(id);
}

/* CUSTOM DROPDOWN COMPONENT HOOKS */
window.toggleCustomDropdown = (cid) => {
  const menu = document.getElementById(`${cid}-menu`);
  if (!menu) return;

  const isHidden = menu.classList.contains("hidden");
  document
    .querySelectorAll(".dropdown-menu")
    .forEach((m) => m.classList.add("hidden"));
  if (isHidden) menu.classList.remove("hidden");
};

window.handleCustomSelect = (cid, val, label, callbackName) => {
  const container = document.getElementById(cid);
  if (!container) return;

  const labelSpan = container.querySelector("button span");
  if (labelSpan) labelSpan.textContent = label;

  document.getElementById(`${cid}-menu`).classList.add("hidden");
  if (window[callbackName]) window[callbackName](val);
};

function createCustomSelect(
  containerId,
  options,
  initialValue,
  callbackName,
  customClass = "",
  hasShadow = true,
) {
  const container = document.getElementById(containerId);
  if (!container) return;

  let currentLabel =
    options.find((o) => o.value == initialValue)?.label || "Select...";

  container.innerHTML = `
    <div class="relative w-full">
      <button type="button" onclick="toggleCustomDropdown('${containerId}')" class="w-full flex items-center justify-between p-4 px-6 bg-slate-50 border border-slate-100 rounded-[2rem] text-xs font-bold text-slate-700 outline-none hover:bg-white focus:ring-4 focus:ring-darkCyan-500/10 transition-all ${
        hasShadow ? "shadow-xl" : ""
      } ${customClass}">
        <span>${currentLabel}</span>
        <i class="fa-solid fa-chevron-down text-darkCyan-500 text-[10px]"></i>
      </button>
      <div id="${containerId}-menu" class="dropdown-menu hidden shadow-2xl rounded-[1.5rem]">
        ${options
          .map(
            (o) => `
          <div onclick="handleCustomSelect('${containerId}', '${o.value}', '${o.label}', '${callbackName}')" class="dropdown-item ${o.color || ""} ${
            initialValue == o.value ? "bg-darkCyan-50 font-black" : ""
          }">
            ${o.label}
          </div>
        `,
          )
          .join("")}
      </div>
    </div>
  `;
}

/* --- CALENDAR LOGIC --- */
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
window._onDateSelectCache = null;

window.onCalMonthChange = (v) => {
  calMonth = parseInt(v);
  renderCalendar("calendar-mount", window._onDateSelectCache);
};
window.onCalYearChange = (v) => {
  calYear = parseInt(v);
  renderCalendar("calendar-mount", window._onDateSelectCache);
};

function renderCalendar(containerId, onDateSelect) {
  window._onDateSelectCache = onDateSelect;

  const container = document.getElementById(containerId);
  const months = [
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
  const years = Array.from({ length: 21 }, (_, i) => 2015 + i);

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const prevDays = new Date(calYear, calMonth, 0).getDate();

  let daysHtml = "";
  for (let i = firstDay - 1; i >= 0; i--)
    daysHtml += `<div class="calendar-day other-month">${prevDays - i}</div>`;

  for (let i = 1; i <= daysInMonth; i++) {
    const isToday =
      new Date().toDateString() ===
      new Date(calYear, calMonth, i).toDateString();
    const dStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
    const formattedDStr = new Date(calYear, calMonth, i)
      .toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      })
      .toUpperCase();
    const isActive = state.selectedDate === formattedDStr;

    daysHtml += `<div onclick="selectCalendarDate('${dStr}')" class="calendar-day ${isActive ? "active text-white" : ""} ${isToday ? "today" : ""}">${i}</div>`;
  }

  container.innerHTML = `
    <div class="bg-white p-10 rounded-[3rem] border border-slate-50 w-full shadow-2xl flex flex-col items-center">
      <div class="flex items-center justify-center mb-10 gap-6 w-full">
        <div id="cal-sel-month-cont" class="w-48"></div>
        <div id="cal-sel-year-cont" class="w-36"></div>
      </div>
      <div class="calendar-grid mb-4 w-full max-lg">
        ${["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => `<div class="text-[11px] font-black text-slate-300 text-center uppercase py-2 tracking-widest">${d}</div>`).join("")}
      </div>
      <div class="calendar-grid w-full max-lg">
        ${daysHtml}
      </div>
    </div>`;

  createCustomSelect(
    "cal-sel-month-cont",
    months.map((m, i) => ({ value: i, label: m.toUpperCase() })),
    calMonth,
    "onCalMonthChange",
    "h-14 bg-white",
    true,
  );
  createCustomSelect(
    "cal-sel-year-cont",
    years.map((y) => ({ value: y, label: y })),
    calYear,
    "onCalYearChange",
    "h-14 bg-white",
    true,
  );

  window.selectCalendarDate = (dateStr) => {
    const [y, m, d] = String(dateStr).split("-").map(Number);
    onDateSelect(new Date(y, m - 1, d)); // local date
  };
}

let tempSemData = { year: "", term: "" };

function uiTermToDbLabel(uiTerm) {
  if (uiTerm === "1st Semester") return "1st Sem";
  if (uiTerm === "2nd Semester") return "2nd Sem";
  return "1st Sem";
}

function dbLabelToUiTerm(dbLabel) {
  if (dbLabel === "1st Sem") return "1st Semester";
  if (dbLabel === "2nd Sem") return "2nd Semester";
  return "1st Semester";
}

// async function loadActiveTermFromDB() {
//   try {
//     const data = await apiJSON(`${NSTP_API}/active-term`);

//     // backend returns null if not set
//     if (!data || !data.term_id) {
//       state.hasActiveTerm = false;
//       state.termId = null;
//       state.activeTermId = null; // optional
//       return;
//     }

//     state.hasActiveTerm = true;
//     state.yearId = null; // ✅
//     // ✅ store REAL term id
//     state.termId = Number(data.term_id);

//     // optional: keep pointer id=1 (only if you still care)
//     state.activeTermId = data.active_id != null ? Number(data.active_id) : null;
//     state.yearId = data.year_id != null ? Number(data.year_id) : null;
//     // display
//     state.semester.year = data.nstp_year;
//     state.semester.term = dbLabelToUiTerm(data.nstp_semester);
//   } catch (e) {
//     console.error("loadActiveTermFromDB error:", e);
//     state.hasActiveTerm = false;
//     state.termId = null;
//     state.activeTermId = null;
//     state.yearId = null; // ✅
//   }
// }

window.openEditYearNameModal = async function () {
  // ✅ make sure we have the latest active term values
  try {
    await loadActiveTermFromDB();
  } catch (_) {}

  // must have a yearId to rename
  if (!state.yearId) {
    return showFancyInvalid(
      "No active year to edit. Please set an active term first.",
    );
  }

  const currentYearText = String(state.semester.year || "").trim();
  if (!currentYearText) {
    return showFancyInvalid("Current year is empty. Set an active term first.");
  }

  openModal(`
    <div class="space-y-6">
      <h2 class="text-2xl font-black uppercase text-darkCyan-950 tracking-tight text-center">
        EDIT YEAR NAME
      </h2>

      <div class="space-y-3">
        <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Academic Year</label>
        <input
          id="edit-year-name-input"
          type="text"
          value="${currentYearText}"
          placeholder="e.g., 2024-2025"
          class="w-full p-5 px-8 bg-slate-50 border border-slate-100 rounded-[2rem] font-bold outline-none text-slate-700"
        />
        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
          This will RENAME the current year row. No new year will be created.
        </p>
      </div>

      <div class="grid grid-cols-2 gap-3 pt-2">
        <button onclick="openManageSemester()" class="py-4 bg-slate-100 rounded-2xl font-black text-[10px] uppercase text-slate-500">
          BACK
        </button>
        <button onclick="confirmRenameYear()" class="py-4 bg-darkCyan-600 text-white rounded-2xl font-black text-[10px] uppercase">
          SAVE
        </button>
      </div>
    </div>
  `);
};

window.confirmRenameYear = function () {
  const inp = document.getElementById("edit-year-name-input");
  const newName = String(inp?.value || "").trim();

  if (!newName) return showFancyInvalid("Year name cannot be empty.");

  openModal(`
    <div class="text-center p-4">
      <h2 class="text-xl font-black mb-3 uppercase text-darkCyan-950">Rename Year?</h2>
      <p class="text-slate-500 mb-6 text-sm">
        Change
        <span class="font-black text-slate-700">${state.semester.year}</span>
        to
        <span class="font-black text-darkCyan-600">${newName}</span>?
      </p>

      <div class="grid grid-cols-2 gap-3">
        <button onclick="openEditYearNameModal()" class="py-4 bg-slate-100 rounded-2xl font-black text-[10px] uppercase">
          CANCEL
        </button>
        <button onclick="applyRenameYear('${newName.replace(/'/g, "\\'")}')" class="py-4 bg-darkCyan-600 text-white rounded-2xl font-black text-[10px] uppercase">
          YES, RENAME
        </button>
      </div>
    </div>
  `);
};

async function applyRenameYear(newName) {
  try {
    if (!state.yearId)
      return showFancyInvalid("Missing year id. Set active term first.");

    // ✅ rename only (no create, no active-term changes)
    await apiJSON(`${NSTP_API}/years/${state.yearId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nstp_year: String(newName).trim() }),
    });

    // ✅ refresh and update UI
    await loadActiveTermFromDB();
    updateDisplay();
    showSuccess("Year renamed.");
  } catch (e) {
    console.error("applyRenameYear error:", e);
    showFancyInvalid(e.message || "Failed to rename year.");
  }
}
async function saveAttendanceToDB() {
  const iso = uiDateToISO(state.selectedDate);
  if (!iso) {
    showFancyInvalid(`Invalid selectedDate format: "${state.selectedDate}"`);
    throw new Error("Invalid selectedDate => ISO conversion failed");
  }

  const logsArr = state.students.map((s) => {
    const key = `${s.id}_${state.selectedDate}`;
    const log = state.logs[key] || { in: null, out: null };

    const [last_name, first_name] = (s.name || "")
      .split(",")
      .map((x) => (x || "").trim());

    return {
      student_school_id: s.id,
      first_name,
      last_name,
      in_status: log.in?.status || null,
      in_time: log.in?.time || null,
      out_status: log.out?.status || null,
      out_time: log.out?.time || null,
    };
  });

  return await apiJSON(`${NSTP_API}/attendance-log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_date: iso, logs: logsArr }),
  });
}
async function saveActiveTermToDB(yearString, uiTerm) {
  const yearRes = await fetch(`${NSTP_API}/years`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ nstp_year: String(yearString || "").trim() }),
  });

  if (!yearRes.ok) {
    const err = await yearRes.json().catch(() => ({}));
    throw new Error(err.message || "Failed to save year.");
  }

  const yearRow = await yearRes.json();

  const semRes = await fetch(`${NSTP_API}/semesters`, {
    credentials: "include",
  });
  if (!semRes.ok) throw new Error("Failed to load semesters.");
  const semesters = await semRes.json();

  const dbLabel = uiTermToDbLabel(uiTerm);
  const semRow = semesters.find(
    (s) => String(s.nstp_semester).trim() === dbLabel,
  );
  if (!semRow)
    throw new Error(`Semester '${dbLabel}' not found in nstp_semester table.`);

  const activeRes = await fetch(`${NSTP_API}/active-term`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ year_id: yearRow.id, semester_id: semRow.id }),
  });

  if (!activeRes.ok) {
    const err = await activeRes.json().catch(() => ({}));
    throw new Error(err.message || "Failed to save active term.");
  }

  return true;
}

function openManageSemester() {
  tempSemData = { ...state.semester };

  openModal(`
    <div class="space-y-8">
      <h2 class="text-3xl font-black uppercase text-darkCyan-950 tracking-tight text-center leading-tight">MANAGE SEMESTER</h2>

      <div class="space-y-6">
        <div class="space-y-3">
  <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Academic Year</label>

  <div class="relative">
    <input
      id="sy-input"
      type="text"
      value="${tempSemData.year}"
      oninput="tempSemData.year=this.value"
      placeholder="e.g., 2024-2025"
      class="w-full p-5 px-8 pr-14 bg-slate-50 border border-slate-100 rounded-[2rem] font-bold outline-none text-slate-700"
    />

    <!-- ✅ pencil icon -->
    <button
      type="button"
      onclick="openEditYearNameModal()"
      class="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center justify-center text-darkCyan-700 hover:bg-slate-50 active:scale-95 transition-all"
      title="Rename this year"
    >
      <i class="fa-solid fa-pen-to-square text-sm"></i>
    </button>
  </div>

  <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
    Save Changes sets Active Term. Pencil renames the current year only.
  </p>
</div>

        <div class="space-y-3">
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Term / Semester</label>
          <div class="grid grid-cols-2 gap-4">
            <button onclick="setTempTerm('1st Semester')" id="bt-sem-1"
              class="py-5 rounded-[1.5rem] font-black text-xs uppercase border ${tempSemData.term === "1st Semester" ? "bg-darkCyan-950 text-white border-darkCyan-950 shadow-lg" : "bg-white text-slate-400 border-slate-50"}">1st Sem</button>

            <button onclick="setTempTerm('2nd Semester')" id="bt-sem-2"
              class="py-5 rounded-[1.5rem] font-black text-xs uppercase border ${tempSemData.term === "2nd Semester" ? "bg-darkCyan-950 text-white border-darkCyan-950 shadow-lg" : "bg-white text-slate-400 border-slate-50"}">2nd Sem</button>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4 pt-8 border-t border-slate-50">
        <button onclick="closeModal()" class="py-5 bg-slate-100 text-slate-400 rounded-3xl font-black uppercase text-[10px]">CANCEL</button>
        <button onclick="confirmSemesterModal()" class="py-5 bg-darkCyan-600 text-white rounded-3xl font-black uppercase text-[10px] shadow-lg">SAVE CHANGES</button>
      </div>
    </div>
  `);
}

function setTempTerm(t) {
  tempSemData.term = t;

  const b1 = document.getElementById("bt-sem-1");
  const b2 = document.getElementById("bt-sem-2");

  if (b1 && b2) {
    b1.className = `py-5 rounded-[1.5rem] font-black text-xs uppercase border transition-all ${
      t === "1st Semester"
        ? "bg-darkCyan-950 text-white border-darkCyan-950 shadow-lg"
        : "bg-white text-slate-400 border-slate-50"
    }`;

    b2.className = `py-5 rounded-[1.5rem] font-black text-xs uppercase border transition-all ${
      t === "2nd Semester"
        ? "bg-darkCyan-950 text-white border-darkCyan-950 shadow-lg"
        : "bg-white text-slate-400 border-slate-50"
    }`;
  }
}

async function confirmSemesterModal() {
  const year = String(tempSemData.year || "").trim();
  const term = String(tempSemData.term || "").trim();

  if (!year) return showFancyInvalid("Academic year cannot be empty.");
  if (term !== "1st Semester" && term !== "2nd Semester")
    return showFancyInvalid("Please select a semester.");

  if (year === state.semester.year && term === state.semester.term) {
    return openModal(`
      <div class="text-center p-6">
        <div class="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
          <i class="fa-solid fa-circle-info text-2xl"></i>
        </div>
        <h2 class="text-xl font-black mb-4 uppercase text-darkCyan-950 text-center tracking-tight">No Changes Made</h2>
        <p class="text-slate-500 mb-8 text-sm text-center font-medium">You haven't modified the academic year or semester.</p>
        <button onclick="openManageSemester()" class="w-full py-4 bg-slate-950 text-white rounded-2xl font-black text-xs uppercase tracking-widest">Back</button>
      </div>
    `);
  }

  openModal(`
    <div class="text-center p-4">
      <h2 class="text-xl font-black mb-4 uppercase text-darkCyan-950">Set Active Term?</h2>
      <p class="text-slate-500 mb-8 text-sm text-center">
        Save and set active term to
        <span class="text-darkCyan-600 font-black">${year} ${term}</span>?
      </p>

      <div class="grid grid-cols-2 gap-3">
        <button onclick="openManageSemester()" class="py-4 bg-slate-100 rounded-2xl font-black text-[10px]">CANCEL</button>
        <button onclick="applySemesterSaveToDB()" class="py-4 bg-darkCyan-600 text-white rounded-2xl font-black text-[10px]">YES, SAVE</button>
      </div>
    </div>
  `);
}

async function applySemesterSaveToDB() {
  try {
    const year = String(tempSemData.year || "").trim();
    const term = String(tempSemData.term || "").trim();

    await saveActiveTermToDB(year, term);

    // ✅ refresh term state
    await loadActiveTermFromDB();

    // ✅ pull students that belong to this active term (backend should filter)
    await loadStudentsFromDB();

    // ✅ optional: reload logs for selected date (if you want attendance to change per term)
    if (state.selectedDate) {
      await loadAttendanceLogsFromDB(state.selectedDate);
    }

    updateDisplay();
    showSuccess("Active term saved.");
  } catch (e) {
    console.error("applySemesterSaveToDB error:", e);
    showFancyInvalid(e.message || "Failed to save active term.");
  }
}

async function handleSpecAssign() {
  try {
    if (specData.prog === "None")
      return showFancyInvalid("Select a program first.");
    if (!specData.stuId)
      return showFancyInvalid("Please select a student from suggestions.");
    if (!specData.sect) return showFancyInvalid("Section cannot be empty.");

    await apiJSON(
      `${NSTP_API}/students/${encodeURIComponent(specData.stuId)}/section`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: specData.sect }),
      },
    );

    await loadStudentsFromDB();
    updateDisplay();
    showSuccess("Student section saved.");

    specData = { prog: "None", stuId: null, stuName: "", sect: "" };
  } catch (e) {
    console.error("handleSpecAssign error:", e);
    showFancyInvalid(e.message || "Failed to assign section.");
  }
}

window.selectSpecStu = function (studentId, studentName) {
  specData.stuId = studentId;
  specData.stuName = studentName;

  const inp = document.getElementById("inp-spec-stu");
  if (inp) inp.value = studentName;

  document.getElementById("sug-inp-spec-stu")?.classList.add("hidden");
};
/* =========================================================
   ✅ MANAGE PROGRAMS (DB)
========================================================= */
function openAssignSpecificModal() {
  openModal(`
    <div class="space-y-8">
      <h2 class="text-2xl font-black uppercase text-darkCyan-950 text-center">ASSIGN SPECIFIC STUDENT</h2>

      <div class="space-y-5">
        <div class="space-y-2">
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Select Program</label>
          <div id="sel-spec-prog-cont"></div>
        </div>

        <div class="relative space-y-2">
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Search Student</label>
          <input
            id="inp-spec-stu"
            placeholder="Type Name..."
            class="w-full p-5 px-8 bg-slate-50 border border-slate-100 rounded-[2rem] text-xs font-bold outline-none"
          />
          <div id="sug-inp-spec-stu" class="dropdown-menu hidden"></div>
        </div>

        <div class="space-y-2">
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Target Section</label>
          <input
            id="inp-spec-sect"
            oninput="this.value=this.value.toUpperCase();specData.sect=this.value"
            placeholder="e.g., Section B"
            class="w-full p-5 px-8 bg-slate-50 border border-slate-100 rounded-[2rem] text-xs font-bold outline-none"
          />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4 pt-6 border-t border-slate-50">
        <button
          onclick="openAssignSectionModal()"
          class="py-5 bg-slate-100 text-slate-400 rounded-3xl font-black uppercase text-[10px]"
        >
          BACK
        </button>
        <button
          onclick="handleSpecAssign()"
          class="py-5 bg-darkCyan-950 text-white rounded-3xl font-black uppercase text-[10px]"
        >
          ASSIGN
        </button>
      </div>
    </div>
  `);

  // ✅ state.programs is [{id, program_name}] so use program_name
  createCustomSelect(
    "sel-spec-prog-cont",
    [
      { value: "None", label: "Select Program..." },
      ...state.programs.map((p) => ({
        value: p.program_name,
        label: p.program_name,
      })),
    ],
    specData.prog,
    "onSpecProgChange",
    "h-16 p-5",
    false,
  );

  const inp = document.getElementById("inp-spec-stu");
  if (inp) {
    inp.oninput = () => {
      const sug = document.getElementById("sug-inp-spec-stu");
      if (!sug) return;

      if (specData.prog === "None") {
        sug.innerHTML = `<div class="dropdown-item text-rose-500">Select program first.</div>`;
        sug.classList.remove("hidden");
        return;
      }

      const q = inp.value.toLowerCase().trim();
      if (!q) {
        sug.classList.add("hidden");
        return;
      }

      const matches = state.students
        .filter(
          (s) =>
            s.program === specData.prog && s.name.toLowerCase().includes(q),
        )
        .slice(0, 5);

      if (matches.length > 0) {
        sug.innerHTML = matches
          .map(
            (s) => `
              <div onclick="selectSpecStu('${s.id}', '${s.name.replace(/'/g, "\\'")}')" class="dropdown-item">
                ${s.name}
              </div>
            `,
          )
          .join("");
        sug.classList.remove("hidden");
      } else {
        sug.classList.add("hidden");
      }
    };
  }
}

function confirmBulkAssignModal() {
  if (
    assignData.prog === "None" ||
    !assignData.startName ||
    !assignData.endName ||
    !assignData.sect
  ) {
    return showFancyInvalid("Please complete all fields correctly.");
  }
  openModal(`
                <div class="text-center p-4">
                    <h2 class="text-xl font-black mb-4 uppercase">Confirm Assignment?</h2>
                    <p class="text-slate-500 mb-8 text-sm leading-relaxed">Assign section <span class="text-darkCyan-600 font-black">${assignData.sect}</span> to students from <br><span class="text-darkCyan-600 font-bold">${assignData.startName}</span> to <span class="text-darkCyan-600 font-bold">${assignData.endName}</span>?</p>
                    <div class="grid grid-cols-2 gap-3">
                        <button onclick="openAssignSectionModal()" class="py-4 bg-slate-100 rounded-2xl font-black text-[10px]">CANCEL</button>
                        <button onclick="executeBulkAssign()" class="py-4 bg-darkCyan-600 text-white rounded-2xl font-black text-[10px]">YES, ASSIGN</button>
                    </div>
                </div>
            `);
}

async function executeBulkAssign() {
  try {
    // safety checks (you already validated before, but keep this too)
    if (
      assignData.prog === "None" ||
      !assignData.startName ||
      !assignData.endName ||
      !assignData.sect
    ) {
      return showFancyInvalid("Please complete all fields correctly.");
    }

    // ✅ SAVE TO DB
    await apiJSON(`${NSTP_API}/students/section-bulk`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        program_name: assignData.prog,
        start_name: assignData.startName, // ex: "Reyes, Juan"
        end_name: assignData.endName,
        section: assignData.sect, // ex: "A"
      }),
    });

    // ✅ RELOAD FROM DB (truth source)
    await loadStudentsFromDB();

    updateDisplay();
    showSuccess("Section assigned and saved.");

    assignData = {
      prog: "None",
      startId: null,
      startName: "",
      endId: null,
      endName: "",
      sect: "",
    };
  } catch (e) {
    console.error("executeBulkAssign error:", e);
    showFancyInvalid(e.message || "Failed to assign section.");
  }
}
function openManagePrograms() {
  openModal(`
    <div class="space-y-6">
      <h2 class="text-2xl font-black uppercase text-darkCyan-950 tracking-tight">MANAGE PROGRAMS</h2>

      <div class="space-y-3 max-h-64 overflow-y-auto custom-scrollbar pr-2">
        ${
          state.programs.length === 0
            ? `<div class="p-4 bg-slate-50 border border-slate-100 rounded-3xl text-slate-500 text-xs font-bold">No programs found.</div>`
            : state.programs
                .map((p) => {
                  const color = getProgColor(p.program_name);
                  return `
                    <div class="flex items-center justify-between p-4 bg-slate-50/50 border border-slate-100 rounded-3xl">
                      <div class="flex items-center gap-3">
                        <div class="w-2 h-6 rounded-full bg-${color}-500"></div>
                        <span class="font-bold text-slate-700">${p.program_name}</span>
                      </div>
                      <div class="flex gap-1">
                        <button onclick="confirmEditProgramRequest(${p.id})" class="w-9 h-9 flex items-center justify-center text-darkCyan-600 hover:bg-white rounded-xl shadow-sm transition-all">
                          <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button onclick="removeProgramPrompt(${p.id})" class="w-9 h-9 flex items-center justify-center text-rose-500 hover:bg-white rounded-xl shadow-sm transition-all">
                          <i class="fa-solid fa-trash"></i>
                        </button>
                      </div>
                    </div>
                  `;
                })
                .join("")
        }
      </div>

      <div class="pt-4 border-t border-slate-50 flex gap-2">
        <input id="new-prog-input" type="text" placeholder="New Program Name..." class="flex-grow p-4 px-6 bg-slate-50 border border-slate-100 rounded-[2rem] font-bold text-xs outline-none">
        <button onclick="confirmAddProgramModal()" class="px-6 bg-darkCyan-600 text-white rounded-[2rem] font-black uppercase text-[10px]">Add</button>
      </div>

      <button onclick="closeModal()" class="w-full py-4 mt-2 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px]">Cancel</button>
    </div>
  `);
}

function openSetDateModal() {
  openModal(`
    <div class="space-y-8 text-center p-2">
      <div>
        <h2 class="text-2xl font-black uppercase text-darkCyan-950 tracking-tight">Select Session Date</h2>
      </div>

      <div id="calendar-mount" class="w-full max-w-lg mx-auto"></div>

      <div class="grid grid-cols-1 mt-4">
        <button onclick="closeModal()" class="py-5 bg-slate-100 text-slate-400 rounded-[2.5rem] font-black uppercase text-[10px]">
          CANCEL
        </button>
      </div>
    </div>
  `);

  renderCalendar("calendar-mount", (dateObj) => {
    const formatted = dateObj
      .toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      })
      .toUpperCase();

    openModal(`
    <div class="text-center p-4">
      <h2 class="text-xl font-black mb-4 uppercase">Set Session Date?</h2>
      <p class="text-slate-500 mb-8 text-sm">
        Are you sure you want to set date to
        <span class="text-rose-500 font-black">${formatted}</span>?
      </p>

      <div class="grid grid-cols-2 gap-3">
        <button onclick="openSetDateModal()" class="py-4 bg-slate-100 rounded-2xl font-black text-[10px]">
          CANCEL
        </button>

        <button onclick="setSessionDate('${formatted}')" class="py-4 bg-darkCyan-600 text-white rounded-2xl font-black text-[10px]">
          YES, SET
        </button>
      </div>
    </div>
  `);
  });
}

/* Assign logic */
let assignData = {
  prog: "None",
  startId: null,
  startName: "",
  endId: null,
  endName: "",
  sect: "",
};
window.onAssignProgChange = (v) => {
  assignData.prog = v;
  assignData.startId = null;
  assignData.startName = "";
  assignData.endId = null;
  assignData.endName = "";
  const startInp = document.getElementById("inp-range-start");
  const endInp = document.getElementById("inp-range-end");
  if (startInp) startInp.value = "";
  if (endInp) endInp.value = "";
};

let specData = { prog: "None", stuId: null, stuName: "", sect: "" };
window.onSpecProgChange = (v) => {
  specData.prog = v;
};

function openAssignSectionModal() {
  openModal(`
    <div class="space-y-8">
      <div class="flex items-center justify-between">
        <h2 class="text-3xl font-black uppercase text-darkCyan-950 tracking-tight">ASSIGN SECTION</h2>
        <button onclick="openAssignSpecificModal()"
          class="px-5 py-2.5 bg-slate-100 text-darkCyan-700 rounded-2xl text-[10px] font-black uppercase hover:bg-slate-200 transition-all">
          Assign Specific Student
        </button>
      </div>

      <div class="space-y-5">
        <div class="space-y-2">
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Select Program</label>
          <div id="sel-assign-prog-cont"></div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2 relative">
            <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Range Start (Surname)</label>
            <input id="inp-range-start" placeholder="Type Surname..."
              class="w-full p-5 px-8 bg-slate-50 border border-slate-100 rounded-[2rem] text-xs font-bold outline-none">
            <div id="sug-inp-range-start" class="dropdown-menu hidden"></div>
          </div>

          <div class="space-y-2 relative">
            <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Range End (Surname)</label>
            <input id="inp-range-end" placeholder="Type Surname..."
              class="w-full p-5 px-8 bg-slate-50 border border-slate-100 rounded-[2rem] text-xs font-bold outline-none">
            <div id="sug-inp-range-end" class="dropdown-menu hidden"></div>
          </div>
        </div>

        <div class="space-y-2">
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Section Assignment</label>
          <input id="inp-range-sect"
            oninput="this.value=this.value.toUpperCase();assignData.sect=this.value"
            placeholder="e.g., Section A"
            class="w-full p-5 px-8 bg-slate-50 border border-slate-100 rounded-[2rem] text-xs font-bold outline-none">
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4 pt-6 border-t border-slate-50">
        <button onclick="closeModal()" class="py-5 bg-slate-100 text-slate-400 rounded-3xl font-black uppercase text-[10px]">CANCEL</button>
        <button onclick="confirmBulkAssignModal()" class="py-5 bg-darkCyan-950 text-white rounded-3xl font-black uppercase text-[10px] shadow-lg">ASSIGN SECTION</button>
      </div>
    </div>
  `);

  createCustomSelect(
    "sel-assign-prog-cont",
    [
      { value: "None", label: "Select Program..." },
      ...state.programs.map((p) => ({
        value: p.program_name,
        label: p.program_name,
      })),
    ],
    assignData.prog,
    "onAssignProgChange",
    "h-16 p-5",
    false,
  );

  const setupAutocomplete = (id) => {
    const inp = document.getElementById(id);
    if (!inp) return;

    inp.oninput = () => {
      const sug = document.getElementById(`sug-${id}`);
      if (!sug) return;

      if (assignData.prog === "None") {
        sug.innerHTML = `<div class="dropdown-item text-rose-500">Please select a program first.</div>`;
        sug.classList.remove("hidden");
        return;
      }

      const q = inp.value.toLowerCase().trim();
      if (!q) {
        sug.classList.add("hidden");
        return;
      }

      const matches = state.students
        .filter(
          (s) =>
            s.program === assignData.prog && s.name.toLowerCase().includes(q),
        )
        .slice(0, 5);

      if (matches.length > 0) {
        sug.innerHTML = matches
          .map(
            (s) => `
          <div onclick="selectRangeItem('${s.id}', '${s.name.replace(/'/g, "\\'")}', '${id}')" class="dropdown-item">
            ${s.name}
          </div>
        `,
          )
          .join("");
        sug.classList.remove("hidden");
      } else {
        sug.classList.add("hidden");
      }
    };
  };

  setupAutocomplete("inp-range-start");
  setupAutocomplete("inp-range-end");
}

window.selectRangeItem = function (studentId, studentName, inputId) {
  const input = document.getElementById(inputId);
  const sug = document.getElementById(`sug-${inputId}`);

  if (!input) return;

  input.value = studentName;

  if (sug) sug.classList.add("hidden");

  if (inputId === "inp-range-start") {
    assignData.startId = studentId;
    assignData.startName = studentName;
  } else if (inputId === "inp-range-end") {
    assignData.endId = studentId;
    assignData.endName = studentName;
  }
};
async function setSessionDate(formatted) {
  state.selectedDate = formatted;

  // ✅ persist so refresh keeps it
  saveLastSelectedDate(formatted);

  try {
    // ✅ pull saved logs from DB for this date
    await loadAttendanceLogsFromDB(formatted);
  } catch (e) {
    console.error("loadAttendanceLogsFromDB error:", e);
    // don't block UI
  }

  updateDisplay();
  showSuccess("Date set.");
}
function confirmAddProgramModal() {
  const name = normalizeProgramName(
    document.getElementById("new-prog-input")?.value,
  );
  if (!name) return showFancyInvalid("Program name cannot be empty.");

  // prevent duplicates (client-side)
  const exists = state.programs.some(
    (p) => p.program_name.toLowerCase() === name.toLowerCase(),
  );
  if (exists) return showFancyInvalid("That program already exists.");

  openModal(`
    <div class="text-center p-4">
      <h2 class="text-xl font-black mb-2 uppercase text-darkCyan-950">Add Program?</h2>
      <p class="text-slate-500 mb-8 text-sm text-center">Add <span class="font-black text-darkCyan-600">${name}</span> to Programs?</p>
      <div class="grid grid-cols-2 gap-3">
        <button onclick="openManagePrograms()" class="py-4 bg-slate-100 rounded-2xl font-black text-[10px]">Cancel</button>
        <button onclick="applyAddProgramToDB('${name.replace(/'/g, "\\'")}')" class="py-4 bg-darkCyan-600 text-white rounded-2xl font-black text-[10px]">Yes, Add</button>
      </div>
    </div>
  `);
}

async function applyAddProgramToDB(programName) {
  try {
    await apiJSON(`${NSTP_API}/programs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ program_name: normalizeProgramName(programName) }),
    });

    await loadProgramsFromDB();

    // keep selection
    updateDisplay();
    showSuccess("Program added.");
  } catch (e) {
    console.error("applyAddProgramToDB error:", e);
    showFancyInvalid(e.message || "Failed to add program.");
  }
}
function openAddStudentModal(keepData = false) {
  // ✅ init form (keep your existing keys: id, name, course_id, year_level_id, program_name, section)
  if (!keepData) {
    stuForm = {
      id: "",
      name: "",
      course_id: "",
      year_level_id: "",
      program_name: "",
      section: "",
      // ✅ add this so program dropdown can keep its selected value
      program_id: "",
    };
  } else {
    // ✅ if older saved form doesn't have program_id yet, keep it safe
    if (stuForm && typeof stuForm === "object" && !("program_id" in stuForm)) {
      stuForm.program_id = "";
    }
  }

  // ✅ safety: force arrays (prevents .map crash)
  const coursesArr = Array.isArray(state.courses) ? state.courses : [];
  const yearsArr = Array.isArray(state.yearLevels) ? state.yearLevels : [];
  const programsArr = Array.isArray(state.programs) ? state.programs : [];

  openModal(`
    <div class="space-y-8 overflow-visible relative">
      <h2 class="text-3xl font-black uppercase text-darkCyan-950 tracking-tight text-center">ADD STUDENT</h2>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="space-y-2">
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ID Number (Numbers only)</label>
          <input type="text" inputmode="numeric" value="${stuForm.id || ""}"
            oninput="this.value=this.value.replace(/[^0-9]/g,'');stuForm.id=this.value"
            placeholder="20241234"
            class="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none">
        </div>

        <div class="space-y-2">
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Name (Last, First)</label>
          <input value="${stuForm.name || ""}"
            oninput="stuForm.name=this.value"
            placeholder="Lastname, Firstname"
            class="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none">
        </div>

        <div class="space-y-2 relative z-[60]">
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Course</label>
          <div id="sel-new-c-cont"></div>
        </div>

        <div class="space-y-2 relative z-[50]">
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Year Level</label>
          <div id="sel-new-y-cont"></div>
        </div>

        <div class="space-y-2 relative z-[40]">
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Program</label>
          <div id="sel-new-p-cont"></div>
        </div>

        <div class="md:col-span-2 space-y-2 relative z-[10]">
          <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Section</label>
          <input type="text" value="${stuForm.section || ""}"
            oninput="this.value=this.value.toUpperCase();stuForm.section=this.value"
            placeholder="e.g., A"
            class="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none">
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4 pt-6 border-t border-slate-50">
        <button onclick="closeModal()"
          class="py-5 bg-slate-100 text-slate-400 rounded-3xl font-black uppercase text-[10px]">
          CANCEL
        </button>
        <button onclick="confirmStudentAddModal()"
          class="py-5 bg-darkCyan-950 text-white rounded-3xl font-black uppercase text-[10px]">
          PROCEED
        </button>
      </div>
    </div>
  `);

  // ✅ Course dropdown from GET /courses -> [{ course_id, course_abbr }]
  createCustomSelect(
    "sel-new-c-cont",
    coursesArr.length
      ? coursesArr.map((c) => ({
          value: String(c.course_id),
          label: String(c.course_abbr || c.course_id),
        }))
      : [{ value: "", label: "No courses loaded" }],
    String(stuForm.course_id || ""),
    "onNewCChange",
    "h-14 p-4",
    false,
  );

  // ✅ Year Level dropdown from GET /year-levels -> your table uses { id, year_level }
  createCustomSelect(
    "sel-new-y-cont",
    yearsArr.length
      ? yearsArr.map((y) => ({
          value: String(y.id ?? y.year_level_id),
          label: String(y.year_level || y.id || y.year_level_id),
        }))
      : [{ value: "", label: "No year levels loaded" }],
    String(stuForm.year_level_id || ""),
    "onNewYChange",
    "h-14 p-4",
    false,
  );

  // ✅ Program dropdown from GET /programs -> [{ id, program_name }]
  // Store BOTH: program_name for display + program_id for saving later
  createCustomSelect(
    "sel-new-p-cont",
    programsArr.length
      ? programsArr.map((p) => ({
          value: String(p.id), // ✅ store ID
          label: String(p.program_name), // ✅ show name
        }))
      : [{ value: "", label: "No programs loaded" }],
    String(stuForm.program_id || ""), // ✅ keep selection if already chosen
    "onNewPChange",
    "h-14 p-4",
    false,
  );
}

// ✅ handlers (make sure these exist somewhere in your file)
window.onNewCChange = (v) => {
  stuForm.course_id = v;
};
window.onNewYChange = (v) => {
  stuForm.year_level_id = v;
};

// ✅ Program dropdown now stores program_id (NOT program_name)
// also keep program_name in sync for display/legacy use if you want
window.onNewPChange = (v) => {
  stuForm.program_id = v;

  // optional: keep program_name updated (useful if other parts still reference it)
  const p = (Array.isArray(state.programs) ? state.programs : []).find(
    (x) => String(x.id) === String(v),
  );
  stuForm.program_name = p ? String(p.program_name) : "";
};

function splitName(full) {
  const raw = String(full || "").trim();
  if (!raw) return { last_name: "", first_name: "" };

  // Expect "Last, First"
  const parts = raw.split(",");
  if (parts.length >= 2) {
    return {
      last_name: parts[0].trim(),
      first_name: parts.slice(1).join(",").trim(),
    };
  }

  // fallback: "First Last"
  const ws = raw.split(/\s+/);
  if (ws.length === 1) return { last_name: ws[0], first_name: "" };
  return {
    first_name: ws.slice(0, -1).join(" "),
    last_name: ws.slice(-1).join(""),
  };
}

function confirmStudentAddModal() {
  // ✅ validation must match your stuForm keys (id, name, course_id, year_level_id, program_id, section)
  if (!stuForm.id) return showFancyInvalid("School ID is required.");
  if (!stuForm.name) return showFancyInvalid("Full name is required.");
  if (!stuForm.course_id) return showFancyInvalid("Course is required.");
  if (!stuForm.year_level_id)
    return showFancyInvalid("Year level is required.");
  if (!stuForm.program_id) return showFancyInvalid("NSTP program is required.");
  if (!stuForm.section) return showFancyInvalid("Section is required.");

  const { first_name, last_name } = splitName(stuForm.name);
  if (!last_name || !first_name) {
    return showFancyInvalid("Please use format: Lastname, Firstname");
  }

  // optional: show selected labels nicely
  const courseLabel =
    (Array.isArray(state.courses) ? state.courses : []).find(
      (c) => String(c.course_id) === String(stuForm.course_id),
    )?.course_abbr || stuForm.course_id;

  const yearLabel =
    (Array.isArray(state.yearLevels) ? state.yearLevels : []).find(
      (y) => String(y.id ?? y.year_level_id) === String(stuForm.year_level_id),
    )?.year_level || stuForm.year_level_id;

  const progLabel =
    (Array.isArray(state.programs) ? state.programs : []).find(
      (p) => String(p.id) === String(stuForm.program_id),
    )?.program_name ||
    stuForm.program_name ||
    "";

  // keep program_name synced (in case other code expects it)
  stuForm.program_name = progLabel;

  openModal(`
    <div class="text-center p-4 space-y-5">
      <h2 class="text-xl font-black uppercase text-darkCyan-950">Save Student?</h2>

      <div class="text-slate-600 text-sm space-y-1">
        <div><span class="font-black">ID:</span> ${stuForm.id}</div>
        <div><span class="font-black">Name:</span> ${last_name}, ${first_name}</div>
        <div><span class="font-black">Course:</span> ${courseLabel}</div>
        <div><span class="font-black">Year:</span> ${yearLabel}</div>
        <div><span class="font-black">Program:</span> ${progLabel}</div>
        <div><span class="font-black">Section:</span> ${stuForm.section}</div>
      </div>

      <div class="grid grid-cols-2 gap-3 pt-2">
        <button onclick="openAddStudentModal(true)"
          class="py-4 bg-slate-100 rounded-2xl font-black text-[10px] uppercase">Back</button>
        <button onclick="applyAddStudentToDB()"
          class="py-4 bg-darkCyan-600 text-white rounded-2xl font-black text-[10px] uppercase">Yes, Save</button>
      </div>
    </div>
  `);
}
async function applyAddStudentToDB() {
  try {
    if (!state.hasActiveTerm || !state.termId) {
      return showFancyInvalid(
        "Please set the active term first (Manage Semester).",
      );
    }
    // ✅ front validation (extra safety)
    if (!stuForm?.id) return showFancyInvalid("School ID is required.");
    if (!stuForm?.name) return showFancyInvalid("Full name is required.");
    if (!stuForm?.course_id) return showFancyInvalid("Course is required.");
    if (!stuForm?.year_level_id)
      return showFancyInvalid("Year level is required.");
    if (!stuForm?.program_id)
      return showFancyInvalid("NSTP program is required.");
    if (!stuForm?.section) return showFancyInvalid("Section is required.");

    const { first_name, last_name } = splitName(stuForm.name);
    if (!first_name || !last_name) {
      return showFancyInvalid("Please use format: Lastname, Firstname");
    }

    const payload = {
      school_id: String(stuForm.id).trim(),
      first_name: String(first_name).trim(),
      last_name: String(last_name).trim(),
      course_id: Number(stuForm.course_id),
      year_level_id: Number(stuForm.year_level_id),
      nstp_program_id: Number(stuForm.program_id),
      section: String(stuForm.section || "")
        .trim()
        .toUpperCase(),
    };

    // ✅ confirm numbers are valid (avoid sending NaN)
    if (!Number.isFinite(payload.course_id))
      return showFancyInvalid("Invalid course selected.");
    if (!Number.isFinite(payload.year_level_id))
      return showFancyInvalid("Invalid year level selected.");
    if (!Number.isFinite(payload.nstp_program_id))
      return showFancyInvalid("Invalid program selected.");

    // ✅ IMPORTANT: NSTP_API should match your backend mount
    // Example: const NSTP_API = "/api/nstp/attendance";
    await apiJSON(`${NSTP_API}/students`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // ✅ refresh
    if (typeof loadStudentsFromDB === "function") await loadStudentsFromDB();
    if (typeof updateDisplay === "function") updateDisplay();

    showSuccess("Student added.");
    closeModal?.();

    // ✅ reset form (keep same key names)
    stuForm = {
      id: "",
      name: "",
      course_id: "",
      year_level_id: "",
      program_name: "", // ✅ keep if your form still has it
      program_id: "",
      section: "",
    };
  } catch (e) {
    console.error("applyAddStudentToDB error:", e);
    showFancyInvalid(e?.message || "Failed to add student.");
  }
}
function openSaveSessionModal() {
  if (!state.selectedDate)
    return showFancyInvalid("No active session selected to save.");

  const s = calculateCurrentStats();

  openModal(`
    <div class="text-center space-y-6">
      <div class="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2">
        <i class="fa-solid fa-cloud-arrow-up text-3xl"></i>
      </div>

      <h2 class="text-2xl font-black text-darkCyan-950 uppercase text-center leading-none">
        Save Session?
      </h2>

      <div class="bg-slate-50 p-6 rounded-[2.5rem] text-left space-y-4 shadow-inner">

        <div class="flex justify-between text-xs font-black uppercase">
          <span class="text-slate-400 tracking-wider">Present</span>
          <span class="text-emerald-600 font-black">IN: ${s.pIn} | OUT: ${s.pOut}</span>
        </div>

        <div class="flex justify-between text-xs font-black uppercase">
          <span class="text-amber-500 tracking-wider">Late</span>
          <span class="text-amber-500 font-black">IN: ${s.lIn} | OUT: ${s.lOut}</span>
        </div>

        <div class="flex justify-between text-xs font-black uppercase">
          <span class="text-blue-500 tracking-wider">Early Out</span>
          <span class="text-blue-500 font-black">OUT: ${s.eoOut}</span>
        </div>

        <div class="flex justify-between text-xs font-black uppercase">
          <span class="text-slate-500 tracking-wider">Excused</span>
          <span class="text-slate-600 font-black">IN: ${s.eIn} | OUT: ${s.eOut}</span>
        </div>

        <div class="flex justify-between text-xs font-black uppercase">
          <span class="text-rose-500 tracking-wider">Absent</span>
          <span class="text-rose-600 font-black">IN: ${s.aIn} | OUT: ${s.aOut}</span>
        </div>

      </div>

      <div class="text-sm font-black text-rose-500 uppercase italic p-5 border-2 border-rose-100 rounded-[2rem] bg-rose-50 tracking-wider leading-relaxed text-center">
        NOTE: Students who have no mark will automatically mark as absent.
      </div>

      <div class="grid grid-cols-2 gap-4">
        <button onclick="closeModal()" class="py-5 bg-slate-100 text-slate-400 rounded-3xl font-black uppercase text-[10px]">
          CANCEL
        </button>

        <button onclick="finalizeSessionSave()" class="py-5 bg-emerald-600 text-white rounded-3xl font-black uppercase text-[10px]">
          CONFIRM SAVE
        </button>
      </div>
    </div>
  `);
}
function uiDateToISO(ui) {
  const s = String(ui || "")
    .trim()
    .toUpperCase(); // "FEB 25, 2026"
  const m = s.match(/^([A-Z]{3})\s+(\d{1,2}),\s*(\d{4})$/);
  if (!m) return null;

  const monMap = {
    JAN: "01",
    FEB: "02",
    MAR: "03",
    APR: "04",
    MAY: "05",
    JUN: "06",
    JUL: "07",
    AUG: "08",
    SEP: "09",
    OCT: "10",
    NOV: "11",
    DEC: "12",
  };

  const mm = monMap[m[1]];
  if (!mm) return null;

  const dd = String(Number(m[2])).padStart(2, "0");
  const yyyy = m[3];

  return `${yyyy}-${mm}-${dd}`; // ✅ DATE ONLY (no UTC shift)
}
// Debounce per-student to avoid spamming requests on fast clicks
const _saveTimers = {}; // { "studentId": timeoutId }

async function autosaveStudentLog(studentId) {
  try {
    if (!state.selectedDate) return;

    const iso = uiDateToISO(state.selectedDate);
    if (!iso) return;

    const s = state.students.find((x) => String(x.id) === String(studentId));
    if (!s) return;

    const key = `${studentId}_${state.selectedDate}`;
    const log = state.logs[key] || { in: null, out: null };

    // name is "Last, First"
    const parts = String(s.name || "").split(",");
    const last_name = (parts[0] || "").trim();
    const first_name = (parts.slice(1).join(",") || "").trim();

    // ---- helpers: force time to "hh:mm AM/PM" or null ----
    const to12h = (t) => {
      if (!t) return null;

      // remove any extra label like "(Auto-Absent)"
      let raw = String(t).trim();
      raw = raw.replace(/\s*\(.*?\)\s*$/g, "").trim(); // remove trailing (...) if present

      if (!raw) return null;

      // If already has AM/PM and looks like "hh:mm AM/PM"
      if (/(AM|PM)$/i.test(raw)) {
        // normalize spacing/case: "2:05 pm" -> "02:05 PM"
        const m = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (!m) return null;
        const hh = String(Number(m[1])).padStart(2, "0");
        const mm = m[2];
        const ap = m[3].toUpperCase();
        return `${hh}:${mm} ${ap}`;
      }

      // If it's 24-hour like "14:55" or "14:55:00"
      const m24 = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (m24) {
        let hh = Number(m24[1]);
        const mm = m24[2];
        if (hh < 0 || hh > 23) return null;

        const ap = hh >= 12 ? "PM" : "AM";
        let hh12 = hh % 12;
        if (hh12 === 0) hh12 = 12;

        return `${String(hh12).padStart(2, "0")}:${mm} ${ap}`;
      }

      // unknown format
      return null;
    };

    const in_time = to12h(log.in?.time ?? null);
    const out_time = to12h(log.out?.time ?? null);

    await apiJSON(`${NSTP_API}/attendance-log/student`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_date: iso,
        student_school_id: String(studentId),
        first_name,
        last_name,

        // can be null when unchecked
        in_status: log.in?.status ?? null,
        in_time, // ✅ always "hh:mm AM/PM" or null
        out_status: log.out?.status ?? null,
        out_time, // ✅ always "hh:mm AM/PM" or null
      }),
    });
  } catch (e) {
    console.error("autosaveStudentLog error:", e);
    throw e; // so queueAutosave can catch and show UI warning if you want
  }
}
function queueAutosave(studentId) {
  clearTimeout(_saveTimers[studentId]);
  _saveTimers[studentId] = setTimeout(async () => {
    try {
      await autosaveStudentLog(studentId);
      // optional: show small "Saved" indicator somewhere
    } catch (e) {
      console.error("autosave failed:", e);
      // optional: show UI warning, or mark row as "unsaved"
    }
  }, 250); // 250ms debounce
}
async function finalizeSessionSave() {
  if (!state.selectedDate)
    return showFancyInvalid("Please set the attendance date first.");

  const now12h = () => {
    const d = new Date();
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, "0");
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12;
    if (h === 0) h = 12;
    return `${String(h).padStart(2, "0")}:${m} ${ap}`;
  };

  const ts = now12h();

  state.students.forEach((s) => {
    const key = `${s.id}_${state.selectedDate}`;
    if (!state.logs[key]) state.logs[key] = { in: null, out: null };

    const log = state.logs[key];

    // ✅ NEW RULE
    // If IN is missing but OUT exists → mark IN as Late
    if (!log.in && log.out) {
      log.in = { status: "yellow", time: ts };
    }

    // IN still blank → Absent
    if (!log.in) {
      log.in = { status: "red", time: ts };
    }

    // OUT blank → Early Out if IN is Present
    if (!log.out) {
      if (log.in?.status === "green") {
        log.out = { status: "blue", time: ts };
      } else {
        log.out = { status: "red", time: ts };
      }
    }
  });

  try {
    await saveAttendanceToDB();
    renderTable();
    updateStats();
    updateDisplay();
    showSuccess("Session finalized and saved.");
  } catch (e) {
    console.error(e);
    showFancyInvalid("Failed to finalize/save session.");
  }
}
async function loadSidebarUser() {
  const nameEl = document.getElementById("admin-name");
  const roleEl = document.getElementById("admin-role");

  if (nameEl) {
    nameEl.textContent = "Administrator";
  }

  if (roleEl) {
    roleEl.textContent = "Administrator";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadSidebarUser();

  const btnOpenLogout = document.getElementById("btnOpenLogout");
  const btnCloseModal = document.getElementById("btnCloseModal");
  const btnCancelLogout = document.getElementById("btnCancelLogout");
  const btnConfirmLogout = document.getElementById("btnConfirmLogout");
  const logoutModal = document.getElementById("logoutModal");

  if (btnOpenLogout) {
    btnOpenLogout.addEventListener("click", (e) => {
      e.preventDefault();
      confirmLogout();
    });
  } else {
    console.warn("Missing #btnOpenLogout");
  }

  if (btnCloseModal) {
    btnCloseModal.addEventListener("click", closeLogoutModal);
  }

  if (btnCancelLogout) {
    btnCancelLogout.addEventListener("click", closeLogoutModal);
  }

  if (btnConfirmLogout) {
    btnConfirmLogout.addEventListener("click", doLogout);
  }

  if (logoutModal) {
    logoutModal.addEventListener("click", (e) => {
      if (e.target === logoutModal) {
        closeLogoutModal();
      }
    });
  }

  requestAnimationFrame(() => {
    document.documentElement.classList.remove("sidebar-preload");
  });
});
function confirmEditProgramRequest(programId) {
  const p = state.programs.find((x) => x.id === programId);
  if (!p) return showFancyInvalid("Program not found.");

  openModal(`
    <div class="space-y-6">
      <h2 class="text-2xl font-black uppercase text-darkCyan-950 tracking-tight">EDIT PROGRAM</h2>

      <div class="space-y-3">
        <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Program Name</label>
        <input id="edit-prog-input" type="text" value="${p.program_name}" class="w-full p-5 px-8 bg-slate-50 border border-slate-100 rounded-[2rem] font-bold outline-none text-slate-700">
        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Must be unique.</p>
      </div>

      <div class="grid grid-cols-2 gap-3 pt-2">
        <button onclick="openManagePrograms()" class="py-4 bg-slate-100 rounded-2xl font-black text-[10px]">Cancel</button>
        <button onclick="confirmEditProgramModal(${programId})" class="py-4 bg-darkCyan-600 text-white rounded-2xl font-black text-[10px]">Save</button>
      </div>
    </div>
  `);
}

function confirmEditProgramModal(programId) {
  const p = state.programs.find((x) => x.id === programId);
  if (!p) return showFancyInvalid("Program not found.");

  const newName = normalizeProgramName(
    document.getElementById("edit-prog-input")?.value,
  );
  if (!newName) return showFancyInvalid("Program name cannot be empty.");

  // no changes
  if (newName === p.program_name) return openManagePrograms();

  // client-side duplicate check
  const dup = state.programs.some(
    (x) =>
      x.id !== programId &&
      x.program_name.toLowerCase() === newName.toLowerCase(),
  );
  if (dup) return showFancyInvalid("Another program already uses that name.");

  openModal(`
    <div class="text-center p-4">
      <h2 class="text-xl font-black mb-2 uppercase text-darkCyan-950">Save Changes?</h2>
      <p class="text-slate-500 mb-8 text-sm text-center">
        Rename <span class="font-black">${p.program_name}</span> to
        <span class="font-black text-darkCyan-600">${newName}</span>?
      </p>
      <div class="grid grid-cols-2 gap-3">
        <button onclick="confirmEditProgramRequest(${programId})" class="py-4 bg-slate-100 rounded-2xl font-black text-[10px]">Back</button>
        <button onclick="applyEditProgramToDB(${programId}, '${newName.replace(/'/g, "\\'")}')" class="py-4 bg-darkCyan-600 text-white rounded-2xl font-black text-[10px]">Yes, Save</button>
      </div>
    </div>
  `);
}

async function applyEditProgramToDB(programId, newName) {
  try {
    const old = state.programs.find((x) => x.id === programId);
    if (!old) return showFancyInvalid("Program not found.");

    await apiJSON(`${NSTP_API}/programs/${programId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ program_name: normalizeProgramName(newName) }),
    });

    // if user currently filtering by old program name, keep filter meaningful
    const wasSelected = state.selectedProgram === old.program_name;

    await loadProgramsFromDB();

    if (wasSelected) state.selectedProgram = normalizeProgramName(newName);

    // OPTIONAL: if your students store program name strings, update them too (demo data only)
    state.students.forEach((s) => {
      if (s.program === old.program_name)
        s.program = normalizeProgramName(newName);
    });

    updateDisplay();
    showSuccess("Program updated.");
  } catch (e) {
    console.error("applyEditProgramToDB error:", e);
    showFancyInvalid(e.message || "Failed to update program.");
  }
}

function removeProgramPrompt(programId) {
  const p = state.programs.find((x) => x.id === programId);
  if (!p) return showFancyInvalid("Program not found.");

  openModal(`
    <div class="text-center p-4">
      <h2 class="text-xl font-black mb-2 uppercase text-darkCyan-950">Delete Program?</h2>
      <p class="text-slate-500 mb-8 text-sm text-center">
        Delete <span class="font-black text-rose-600">${p.program_name}</span>?
      </p>
      <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-8">
        This cannot be undone.
      </p>
      <div class="grid grid-cols-2 gap-3">
        <button onclick="openManagePrograms()" class="py-4 bg-slate-100 rounded-2xl font-black text-[10px]">Cancel</button>
        <button onclick="applyDeleteProgramToDB(${programId})" class="py-4 bg-rose-600 text-white rounded-2xl font-black text-[10px]">Yes, Delete</button>
      </div>
    </div>
  `);
}

async function applyDeleteProgramToDB(programId) {
  try {
    const old = state.programs.find((x) => x.id === programId);
    if (!old) return showFancyInvalid("Program not found.");

    await apiJSON(`${NSTP_API}/programs/${programId}`, { method: "DELETE" });

    // if current filter is deleted program -> reset
    if (state.selectedProgram === old.program_name)
      state.selectedProgram = "All";

    await loadProgramsFromDB();

    updateDisplay();
    showSuccess("Program deleted.");
  } catch (e) {
    console.error("applyDeleteProgramToDB error:", e);
    showFancyInvalid(e.message || "Failed to delete program.");
  }
}

function openUploadChoiceModal() {
  openModal(`
    <div class="space-y-6 text-center p-2">
      <h2 class="text-2xl font-black uppercase text-darkCyan-950 tracking-tight">UPLOAD OPTIONS</h2>
      <p class="text-slate-500 text-sm font-bold uppercase tracking-widest">
        Choose what you want to upload
      </p>

      <div class="grid grid-cols-1 gap-3 pt-2">
        <button
          onclick="triggerMasterListUpload()"
          class="w-full py-5 bg-darkCyan-600 text-white rounded-[2.5rem] font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all">
          Upload Master List
        </button>

        <button
          onclick="triggerStudentProgramUpload()"
          class="w-full py-5 bg-slate-950 text-white rounded-[2.5rem] font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all">
          Upload Student Program
        </button>

        <button
  onclick="triggerAttendanceUpload()"
  class="w-full py-5 bg-emerald-700 text-white rounded-[2.5rem] font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all">
  Upload Attendance
</button>

        <button
          onclick="closeModal()"
          class="w-full py-5 bg-slate-100 text-slate-400 rounded-[2.5rem] font-black uppercase text-[10px] tracking-widest">
          Cancel
        </button>
      </div>

      <div class="text-left bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs font-bold text-slate-600 leading-relaxed">
        <div class="font-black uppercase text-[10px] text-slate-400 mb-2">Formats</div>
        <div class="mb-2">
          <span class="font-black">Master List:</span> ID(1234567) | Student Name (Dela Cruz, Juan) | Course(BSIT) | Year(1)
        </div>
        <div>
          <span class="font-black">Student Program:</span> School ID(2022309) | Program Name(CWTS)
        </div>
        <div>
          <span class="font-black">Attendance Upload:</span> ID(2022309) | IN(1 or blank) | OUT(1 or blank)
        </div>
      </div>
    </div>
  `);
}
/* --- NAV + LOAD --- */
function triggerUpload() {
  openUploadChoiceModal();
}

function triggerMasterListUpload() {
  closeModal();
  document.getElementById("excel-upload-master")?.click();
}
function triggerAttendanceUpload() {
  closeModal();
  document.getElementById("excel-upload-attendance")?.click();
}

function triggerStudentProgramUpload() {
  closeModal();
  document.getElementById("excel-upload-program")?.click();
}
function confirmLogout() {
  const modal = document.getElementById("logoutModal");
  if (!modal) {
    console.warn("Missing #logoutModal");
    return;
  }

  modal.classList.remove("hidden");
  modal.classList.add("flex");
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
      sessionStorage.clear();
    } catch (e) {
      console.warn("Storage cleanup failed:", e);
    }

    window.location.replace("../MT_login/MT_login.html");
  }
}

function goToAttendance() {
  window.location.href = "../MT_attendance/MT_attendance.html";
}
function goToDashboard() {
  window.location.href = "../MT_dashboard/MT_dashboard.html";
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

// ================================
// EXCEL BULK UPLOAD (Students)
// Minimal format supported:
// ID | Student Name | Course | Year
// Example: 20245 | Pabillon, Reianne | BSIT | 1
// ================================
const BULK_STUDENTS_API = `${NSTP_API}/students/bulk`;
const BULK_PROGRAM_API = `${NSTP_API}/students/program-bulk`;
function normHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/[.:]/g, "") // ✅ ID No. -> id no
    .replace(/\s+/g, " "); // normalize spaces
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj[k] != null && String(obj[k]).trim() !== "") return obj[k];
  }
  return "";
}

function parseStudentName(full) {
  const raw = String(full || "").trim();
  if (!raw) return { first_name: "", last_name: "" };

  // Prefer "Last, First"
  const parts = raw.split(",");
  if (parts.length >= 2) {
    return {
      last_name: parts[0].trim(),
      first_name: parts.slice(1).join(",").trim(),
    };
  }

  // Fallback: "First Last"
  const ws = raw.split(/\s+/);
  if (ws.length === 1) return { first_name: "", last_name: ws[0] };
  return {
    first_name: ws.slice(0, -1).join(" "),
    last_name: ws.slice(-1).join(""),
  };
}

async function uploadStudentsBulk(rows) {
  // ✅ program is OPTIONAL now
  const selectedProgramName =
    state.selectedProgram && state.selectedProgram !== "All"
      ? state.selectedProgram
      : null;

  // ✅ DO NOT BLOCK UPLOAD when program is not selected
  return await apiJSON(BULK_STUDENTS_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      program_name: selectedProgramName, // null is allowed
      default_section: null, // null is allowed
      rows,
    }),
  });
}
async function moveToNSTP2() {
  try {
    // Make sure active term is loaded
    await loadActiveTermFromDB();

    if (!state.hasActiveTerm || !state.termId) {
      return showFancyInvalid(
        "No active term set. Please set Active Term first.",
      );
    }

    openModal(`
  <div class="text-center p-6 space-y-6">
    
    <div class="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto">
      <i class="fa-solid fa-people-arrows text-2xl"></i>
    </div>

    <h2 class="text-2xl font-black uppercase text-slate-900 tracking-tight">
      Promote Students to NSTP 2
    </h2>

    <p class="text-slate-500 text-sm font-bold leading-relaxed">
      This action will move <span class="font-black text-slate-700">eligible students</span> 
      from the <span class="text-darkCyan-700 font-black">current active term</span> 
      to the <span class="text-emerald-600 font-black">2nd Semester</span> 
      of the same academic year.
    </p>

    <div class="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-left text-xs font-bold text-slate-700 leading-relaxed space-y-4">
      
      <div>
        <div class="uppercase text-[10px] tracking-widest text-slate-400 font-black mb-1">
          Promotion Criteria
        </div>
        <div>
          If a student's <span class="font-black text-rose-600">Total Absent Equivalent</span> 
          reaches <span class="font-black">3 or more</span>, the student 
          <span class="font-black text-rose-600">will NOT be promoted</span> to NSTP 2.
        </div>
      </div>

      <div>
        <div class="uppercase text-[10px] tracking-widest text-slate-400 font-black mb-1">
          Manual Re-Enrollment Required
        </div>
        <div>
          Students who are not promoted will <span class="font-black">not be automatically enrolled</span>.  
          If they are allowed to continue, the administrator must 
          <span class="font-black text-darkCyan-700">manually re-add the student</span> 
          to the appropriate term.
        </div>
      </div>

    </div>

    <div class="grid grid-cols-2 gap-3 pt-2">
      <button onclick="closeModal()"
        class="py-4 bg-slate-100 rounded-2xl font-black text-[10px] uppercase text-slate-500">
        Cancel
      </button>

      <button id="btn-do-promote"
        class="py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase active:scale-95 transition-all">
        Confirm Promotion
      </button>
    </div>

  </div>
`);

    // Attach handler after modal rendered
    setTimeout(() => {
      const btn = document.getElementById("btn-do-promote");
      if (!btn) return;

      btn.onclick = async () => {
        try {
          btn.disabled = true;
          btn.textContent = "Processing...";

          // UPDATED: send a hint flag (safe even if backend ignores it)
          const result = await apiJSON(`${NSTP_API}/promote-nstp2`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              // backend should use attendance_log.computed_status for counting
              use_computed_status: true,
            }),
          });

          const promotedCount = result?.promoted_count ?? 0;
          const blockedCount = result?.blocked_count ?? 0;

          const blocked = Array.isArray(result?.blocked) ? result.blocked : [];
          const blockedPreview = blocked.slice(0, 8);

          openModal(`
            <div class="p-6 space-y-5">
              <div class="text-center">
                <div class="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
                  <i class="fa-solid fa-circle-check text-2xl"></i>
                </div>
                <h2 class="text-2xl font-black uppercase text-slate-900">Promotion Done</h2>
                <p class="text-slate-500 font-bold text-[10px] uppercase tracking-widest mt-1">
                  Promoted ${promotedCount} • Blocked ${blockedCount}
                </p>
                <p class="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-1">
                  Based on attendance_log.computed_status
                </p>
              </div>

              ${
                blockedCount
                  ? `
                <div class="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                  <div class="font-black uppercase text-[10px] text-slate-400 mb-2">Blocked (Preview)</div>
                  <div class="space-y-2 text-xs font-bold text-slate-700">
                    ${blockedPreview
                      .map(
                        (b) => `
                      <div class="flex items-start justify-between gap-3">
                        <div>
                          <div class="font-black text-rose-600">${b.school_id ?? "--"}</div>
                          <div class="text-slate-600">${b.name ?? "--"}</div>
                        </div>
                        <div class="text-right text-[10px] text-slate-500 uppercase">
                          Absent Eq: <span class="font-black text-rose-600">${b.absent_equivalent ?? "--"}</span>
                        </div>
                      </div>
                    `,
                      )
                      .join("")}
                    ${blockedCount > blockedPreview.length ? `<div class="text-[10px] text-slate-400">…and more</div>` : ""}
                  </div>
                </div>
              `
                  : ""
              }

              <button onclick="closeModal()"
                class="w-full py-4 bg-slate-950 text-white rounded-2xl font-black text-xs uppercase tracking-widest">
                OK
              </button>
            </div>
          `);

          // Refresh UI data
          await loadActiveTermFromDB();
          await loadStudentsFromDB();
          updateDisplay();
        } catch (e) {
          console.error(e);
          showFancyInvalid(e?.message || "Promotion failed.");
        } finally {
          // in case modal stays open due to error
          const btn2 = document.getElementById("btn-do-promote");
          if (btn2) {
            btn2.disabled = false;
            btn2.textContent = "Yes, Promote";
          }
        }
      };
    }, 50);
  } catch (e) {
    console.error(e);
    showFancyInvalid(e?.message || "Something went wrong.");
  }
}

function closeLogoutModal() {
  const modal = document.getElementById("logoutModal");
  if (!modal) return;

  modal.classList.add("hidden");
  modal.classList.remove("flex");
}
async function handleProgramExcelFile(file) {
  await loadActiveTermFromDB();

  if (!state.hasActiveTerm || !state.termId) {
    return showFancyInvalid(
      "Please set the active term first (Manage Semester) before uploading.",
    );
  }

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: "" });

  // normalize headers (reuses your helpers)
  const rows = rawRows.map((r) => {
    const normalized = {};
    Object.keys(r).forEach((k) => (normalized[normHeader(k)] = r[k]));
    return normalized;
  });

  const payloadRows = rows
    .map((r, idx) => {
      const school_id = String(
        pick(r, [
          "school id",
          "school_id",
          "student id",
          "id",
          "id number",
          "id no",
        ]),
      ).trim();

      const program_name = String(
        pick(r, [
          "program",
          "program name",
          "program_name",
          "nstp program",
          "nstp_program",
        ]),
      ).trim();

      // skip blank lines
      if (!school_id && !program_name) return null;

      if (!school_id) throw new Error(`Row ${idx + 2}: Missing School ID`);
      if (!program_name)
        throw new Error(`Row ${idx + 2}: Missing Program Name`);

      return { school_id, program_name };
    })
    .filter(Boolean);

  if (!payloadRows.length)
    return showFancyInvalid("No valid rows found in the file.");

  const result = await apiJSON(BULK_PROGRAM_API, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      term_id: state.termId, // optional restriction (recommended)
      rows: payloadRows,
    }),
  });

  await loadStudentsFromDB();
  updateDisplay();

  const updated = result?.updated ?? 0;
  const skipped = result?.skipped ?? 0;
  const errors = Array.isArray(result?.errors) ? result.errors : [];

  if (errors.length) {
    const preview = errors
      .slice(0, 7)
      .map((e) => `• ${e}`)
      .join("<br>");
    return openModal(`
      <div class="text-center p-6">
        <div class="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
          <i class="fa-solid fa-triangle-exclamation text-2xl"></i>
        </div>
        <h2 class="text-xl font-black text-slate-900 mb-1 uppercase tracking-tight">Upload Finished</h2>
        <p class="text-slate-500 font-bold text-[10px] uppercase tracking-widest mb-4">
          Updated ${updated} • Skipped ${skipped} • Errors ${errors.length}
        </p>
        <div class="text-left bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs font-bold text-slate-600 leading-relaxed">
          ${preview}${errors.length > 7 ? "<br><br>…and more" : ""}
        </div>
        <button onclick="closeModal()" class="mt-6 w-full py-4 bg-slate-950 text-white rounded-2xl font-black text-xs uppercase tracking-widest">OK</button>
      </div>
    `);
  }

  showSuccess(
    `Updated ${updated} student(s).${skipped ? ` Skipped ${skipped}.` : ""}`,
  );
}

// ================================
// EXCEL ATTENDANCE UPLOAD
// Format: ID | IN | OUT
// Rules:
// IN null, OUT 1 => Late
// IN 1, OUT 1 => Present
// IN null, OUT null => Absent
// IN 1, OUT null => Early Out
// ================================
function isOne(v) {
  // accept 1, "1", "YES", "Y", true, "TRUE"
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  return s === "1" || s === "yes" || s === "y" || s === "true";
}

function isBlank(v) {
  return v == null || String(v).trim() === "";
}

function now12h() {
  const d = new Date();
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, "0")}:${m} ${ap}`;
}

// Map Excel IN/OUT -> {in_status, out_status}
function mapExcelToStatuses(inVal, outVal) {
  const IN = isOne(inVal);
  const OUT = isOne(outVal);

  // IN null, OUT 1 => Late
  if (!IN && OUT) {
    return {
      in: { status: "yellow", time: now12h() },
      out: { status: "green", time: now12h() },
      computed: "late",
    };
  }

  // IN 1, OUT 1 => Present
  if (IN && OUT) {
    return {
      in: { status: "green", time: now12h() },
      out: { status: "green", time: now12h() },
      computed: "present",
    };
  }

  // IN null, OUT null => Absent
  if (!IN && !OUT) {
    return {
      in: { status: "red", time: now12h() },
      out: { status: "red", time: now12h() },
      computed: "absent",
    };
  }

  // IN 1, OUT null => Early Out
  if (IN && !OUT) {
    return {
      in: { status: "green", time: now12h() },
      out: { status: "blue", time: now12h() }, // Early Out
      computed: "early_out",
    };
  }

  // fallback (should not happen)
  return {
    in: null,
    out: null,
    computed: null,
  };
}

async function handleAttendanceExcelFile(file) {
  // ✅ must have session date
  if (!state.selectedDate) {
    throw new Error(
      "Please set the attendance date first before uploading attendance.",
    );
  }

  // ✅ must have active term (recommended)
  await loadActiveTermFromDB();
  if (!state.hasActiveTerm || !state.termId) {
    throw new Error(
      "Please set the active term first (Manage Semester) before uploading attendance.",
    );
  }

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: "" });

  // Normalize headers (reuse your normHeader)
  const rows = rawRows.map((r) => {
    const normalized = {};
    Object.keys(r).forEach((k) => (normalized[normHeader(k)] = r[k]));
    return normalized;
  });

  // Build a quick lookup for existing students
  const studentById = new Map(state.students.map((s) => [String(s.id), s]));

  let applied = 0;
  const notFound = [];
  const badRows = [];

  // Apply logs to state.logs for current selected date
  rows.forEach((r, idx) => {
    const sid = String(
      pick(r, [
        "id",
        "school id",
        "school_id",
        "student id",
        "student_school_id",
        "id number",
        "id no",
      ]),
    ).trim();

    // allow blank lines
    if (!sid) return;

    const inVal = pick(r, ["in", "time in", "check in", "in_status"]);
    const outVal = pick(r, ["out", "time out", "check out", "out_status"]);

    // Validate student exists in current loaded list
    const stu = studentById.get(sid);
    if (!stu) {
      notFound.push(sid);
      return;
    }

    // Map rules
    const mapped = mapExcelToStatuses(inVal, outVal);
    if (!mapped.in && !mapped.out) {
      badRows.push(`Row ${idx + 2}: Invalid IN/OUT values for ID ${sid}`);
      return;
    }

    const key = `${sid}_${state.selectedDate}`;
    state.logs[key] = {
      in: mapped.in,
      out: mapped.out,
    };

    applied++;
  });

  // Update UI immediately
  renderTable();
  updateStats();
  updateDisplay();

  // ✅ Save to DB
  // This uses your existing bulk save that saves ALL students for the date.
  // If you want "save only uploaded IDs", tell me and I’ll adjust the API call.
  await saveAttendanceToDB();

  // Feedback
  if (badRows.length) {
    openModal(`
      <div class="text-center p-6">
        <div class="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
          <i class="fa-solid fa-triangle-exclamation text-2xl"></i>
        </div>
        <h2 class="text-xl font-black text-slate-900 mb-1 uppercase tracking-tight">Upload Finished</h2>
        <p class="text-slate-500 font-bold text-[10px] uppercase tracking-widest mb-4">
          Applied ${applied} • Missing ${notFound.length} • Issues ${badRows.length}
        </p>

        ${
          notFound.length
            ? `<div class="text-left bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs font-bold text-slate-600 leading-relaxed mb-3">
                <div class="font-black uppercase text-[10px] text-slate-400 mb-2">IDs Not Found</div>
                ${notFound
                  .slice(0, 8)
                  .map((x) => `• ${x}`)
                  .join("<br>")}
                ${notFound.length > 8 ? "<br>…and more" : ""}
              </div>`
            : ""
        }

        <div class="text-left bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs font-bold text-slate-600 leading-relaxed">
          <div class="font-black uppercase text-[10px] text-slate-400 mb-2">Issues</div>
          ${badRows
            .slice(0, 8)
            .map((x) => `• ${x}`)
            .join("<br>")}
          ${badRows.length > 8 ? "<br>…and more" : ""}
        </div>

        <button onclick="closeModal()" class="mt-6 w-full py-4 bg-slate-950 text-white rounded-2xl font-black text-xs uppercase tracking-widest">OK</button>
      </div>
    `);
    return;
  }

  // If only missing IDs, still show a warning modal
  if (notFound.length) {
    openModal(`
      <div class="text-center p-6">
        <div class="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <i class="fa-solid fa-circle-exclamation text-2xl"></i>
        </div>
        <h2 class="text-xl font-black text-slate-900 mb-1 uppercase tracking-tight">Upload Finished</h2>
        <p class="text-slate-500 font-bold text-[10px] uppercase tracking-widest mb-4">
          Applied ${applied} • Missing ${notFound.length}
        </p>
        <div class="text-left bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs font-bold text-slate-600 leading-relaxed">
          ${notFound
            .slice(0, 10)
            .map((x) => `• ${x}`)
            .join("<br>")}
          ${notFound.length > 10 ? "<br>…and more" : ""}
        </div>
        <button onclick="closeModal()" class="mt-6 w-full py-4 bg-slate-950 text-white rounded-2xl font-black text-xs uppercase tracking-widest">OK</button>
      </div>
    `);
    return;
  }

  showSuccess(`Attendance uploaded. Applied ${applied}.`);
}
async function handleExcelFile(file) {
  await loadActiveTermFromDB();

  if (!state.hasActiveTerm || !state.termId) {
    return showFancyInvalid(
      "Please set the active term first (Manage Semester) before uploading.",
    );
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: "" });

  // Normalize headers
  const rows = rawRows.map((r) => {
    const normalized = {};
    Object.keys(r).forEach((k) => (normalized[normHeader(k)] = r[k]));
    return normalized;
  });

  // Map -> payload rows
  const payloadRows = rows
    .map((r, idx) => {
      // ✅ accept many header variants
      const school_id = String(
        pick(r, [
          "id",
          "id no",
          "id number",
          "student id",
          "school id",
          "school_id",
          "school id no",
        ]),
      ).trim();

      const student_name = String(
        pick(r, ["student name", "name", "fullname", "full name"]),
      ).trim();

      const course_abbr = String(
        pick(r, [
          "course",
          "course abbr",
          "course_abbr",
          "course abbreviation",
        ]),
      ).trim();

      const year_level = String(
        pick(r, ["year", "year level", "year_level", "yearlvl", "yr"]),
      ).trim();

      // skip blank lines
      if (!school_id && !student_name && !course_abbr && !year_level)
        return null;

      if (!school_id) throw new Error(`Row ${idx + 2}: Missing ID`);
      if (!student_name)
        throw new Error(`Row ${idx + 2}: Missing Student Name`);
      if (!course_abbr) throw new Error(`Row ${idx + 2}: Missing Course`);
      if (!year_level) throw new Error(`Row ${idx + 2}: Missing Year`);

      // ✅ split name now (useful for backend)
      const { first_name, last_name } = parseStudentName(student_name);

      // enforce "Last, First"
      if (!first_name || !last_name) {
        throw new Error(
          `Row ${idx + 2}: Name must be "Last, First" (got: ${student_name})`,
        );
      }

      return {
        school_id,
        student_name, // keep original too
        first_name,
        last_name,
        course_abbr,
        year_level,
      };
    })
    .filter(Boolean);

  if (!payloadRows.length)
    return showFancyInvalid("No valid rows found in the file.");

  // ✅ IMPORTANT: use backend result to show REAL inserted/skipped/errors
  const result = await uploadStudentsBulk(payloadRows);

  await loadStudentsFromDB();
  updateDisplay();

  const inserted = result?.inserted ?? payloadRows.length; // fallback if backend doesn't return inserted
  const skipped = result?.skipped ?? 0;
  const errors = Array.isArray(result?.errors) ? result.errors : [];

  // Show summary
  if (errors.length) {
    // show first few errors (avoid giant modal)
    const preview = errors
      .slice(0, 5)
      .map((e) => `• ${e}`)
      .join("<br>");
    return openModal(`
      <div class="text-center p-6">
        <div class="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
          <i class="fa-solid fa-triangle-exclamation text-2xl"></i>
        </div>
        <h2 class="text-xl font-black text-slate-900 mb-1 uppercase tracking-tight">Upload Finished</h2>
        <p class="text-slate-500 font-bold text-[10px] uppercase tracking-widest mb-4">
          Inserted ${inserted} • Skipped ${skipped} • Errors ${errors.length}
        </p>
        <div class="text-left bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs font-bold text-slate-600 leading-relaxed">
          ${preview}${errors.length > 5 ? "<br><br>…and more" : ""}
        </div>
        <button onclick="closeModal()" class="mt-6 w-full py-4 bg-slate-950 text-white rounded-2xl font-black text-xs uppercase tracking-widest">OK</button>
      </div>
    `);
  }

  showSuccess(
    `Inserted ${inserted} row(s).${skipped ? ` Skipped ${skipped}.` : ""}`,
  );
}

function initExcelUpload() {
  // ✅ Master list input (correct)
  const masterInput = document.getElementById("excel-upload-master");
  if (!masterInput) console.warn("Missing #excel-upload-master");

  // ✅ Program upload input (correct)
  const progInput = document.getElementById("excel-upload-program");
  if (!progInput) console.warn("Missing #excel-upload-program");

  // --- Master list upload ---
  if (masterInput) {
    masterInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      masterInput.value = ""; // allow re-upload same file
      if (!file) return;

      try {
        await handleExcelFile(file);
      } catch (err) {
        console.error("Master upload error:", err);
        showFancyInvalid(err?.message || "Master list upload failed.");
      }
    });
  }

  // --- Program upload ---
  if (progInput) {
    progInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      progInput.value = ""; // allow re-upload same file
      if (!file) return;

      try {
        await handleProgramExcelFile(file);
      } catch (err) {
        console.error("Program upload error:", err);
        showFancyInvalid(err?.message || "Program upload failed.");
      }
    });
  }
  const attInput = document.getElementById("excel-upload-attendance");
  if (!attInput) console.warn("Missing #excel-upload-attendance");

  if (attInput) {
    attInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      attInput.value = "";
      if (!file) return;

      try {
        await handleAttendanceExcelFile(file);
      } catch (err) {
        console.error("Attendance upload error:", err);
        showFancyInvalid(err?.message || "Attendance upload failed.");
      }
    });
  }
}
/* =========================================================
   ✅ BOOTSTRAP
   Order matters:
   1) sync sidebar UI
   2) load programs from DB (so UI + demo students use them)
   3) init demo data
   4) load active term
   5) render
========================================================= */
window.onload = async () => {
  // ✅ DEMO SEMESTER
  state.semester = {
    year: "2025-2026",
    term: "2nd Semester",
  };

  state.selectedDate = "MAY 14, 2026";

  // ✅ DEMO PROGRAMS
  state.programs = [
    { id: 1, program_name: "CWTS" },
    { id: 2, program_name: "ROTC" },
    { id: 3, program_name: "LTS" },
  ];

  // ✅ DEMO STUDENTS
  state.students = [
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
      course: "BS Psychology",
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

  // ✅ SAMPLE ATTENDANCE
  state.logs = {
    "2025-0001_MAY 14, 2026": {
      in: { status: "green", time: "08:00 AM" },
      out: { status: "green", time: "05:00 PM" },
    },

    "2025-0002_MAY 14, 2026": {
      in: { status: "yellow", time: "08:20 AM" },
      out: { status: "green", time: "05:00 PM" },
    },

    "2025-0003_MAY 14, 2026": {
      in: { status: "red", time: "--" },
      out: { status: "red", time: "--" },
    },
  };

  updateDisplay();
};
