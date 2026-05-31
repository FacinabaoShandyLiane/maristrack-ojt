const API_BASE = "/api/nstp";

function getStudentSchoolId() {
  return (
    localStorage.getItem("nstp_school_id") ||
    localStorage.getItem("student_school_id") ||
    localStorage.getItem("school_id") ||
    sessionStorage.getItem("nstp_school_id") ||
    sessionStorage.getItem("student_school_id") ||
    sessionStorage.getItem("school_id") ||
    ""
  );
}

let STUDENT_TERM_ID = null;
let historyRows = [];
let studentProfile = null;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function safeText(v, fallback = "--") {
  const s = String(v ?? "").trim();
  return s ? s : fallback;
}

// ✅ safer for MySQL DATE (YYYY-MM-DD) to avoid timezone shifting
function formatSessionDateLong(isoDate) {
  if (!isoDate) return "Date";

  const s = String(isoDate).slice(0, 10); // "YYYY-MM-DD"
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(y, mo, d); // local date (no timezone shift)
    return dt.toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" });
  }

  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" });
}

function formatTimeMySQL(timeStr) {
  if (!timeStr) return "--:--";
  const t = String(timeStr).trim();
  if (!t) return "--:--";
  if (/[AP]M$/i.test(t)) return t;

  const parts = t.split(":");
  if (parts.length < 2) return t;

  let hh = parseInt(parts[0], 10);
  const mm = parts[1];
  if (isNaN(hh)) return t;

  const ampm = hh >= 12 ? "PM" : "AM";
  hh = hh % 12;
  if (hh === 0) hh = 12;

  return `${pad2(hh)}:${mm} ${ampm}`;
}

function computeMark(inStatus, outStatus) {
  const IN = (inStatus || "").toLowerCase().trim();
  const OUT = (outStatus || "").toLowerCase().trim();

  if (IN === "gray" || OUT === "gray") return "excused";

  const inMissing = !IN;
  const outMissing = !OUT;

  const inRed = IN === "red";
  const outRed = OUT === "red";

  if ((inMissing && outMissing) || (inRed && outRed)) return "absent";

  // ✅ keep your rule (blue = early out) IF that is your actual DB meaning
  if (IN === "green" && OUT === "blue") return "early_out";
  if (IN === "blue" || OUT === "blue") return "early_out";

  if ((IN === "yellow" && OUT === "green") || (inMissing && OUT === "green")) return "late";
  if (IN === "green" && OUT === "green") return "present";

  if (IN === "red" || OUT === "red") return "absent";
  return "present";
}

function markToDotTheme(mark) {
  const colors = {
    present: "bg-emerald-500 shadow-emerald-100",
    late: "bg-amber-400 shadow-amber-100",
    excused: "bg-slate-300 shadow-slate-100",
    absent: "bg-rose-500 shadow-rose-100",
    early_out: "bg-sky-500 shadow-sky-100",
  };
  return colors[mark] || colors.present;
}

function markToBadgeTheme(mark) {
  if (mark === "present") return "bg-emerald-100 text-emerald-600";
  if (mark === "late") return "bg-amber-100 text-amber-600";
  if (mark === "early_out") return "bg-sky-100 text-sky-700";
  if (mark === "absent") return "bg-rose-100 text-rose-600";
  if (mark === "excused") return "bg-slate-100 text-slate-600";
  return "bg-slate-100 text-slate-600";
}

function markToLabel(mark) {
  if (mark === "early_out") return "early out";
  return mark;
}

async function fetchStudentProfile(schoolId) {
  const res = await fetch(`${API_BASE}/student/profile/${encodeURIComponent(schoolId)}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Profile fetch failed (${res.status})`);
  return res.json();
}

async function fetchAttendanceRows(schoolId, termId = null) {
  const qs = termId ? `?term_id=${encodeURIComponent(termId)}` : "";
  const res = await fetch(`${API_BASE}/student/attendance/${encodeURIComponent(schoolId)}${qs}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Attendance fetch failed (${res.status})`);
  return res.json();
}

window.onload = async () => {
  try {
    toggleNav(true);

    const schoolId = getStudentSchoolId();
    if (!schoolId) {
      notify("Missing Session", "No student ID found. Please login again.", "error");
      return;
    }

    const prof = await fetchStudentProfile(schoolId);
    studentProfile = prof.student || null;
    STUDENT_TERM_ID = studentProfile?.term_id ?? null;

    renderStudentProfile(prof);

    const att = await fetchAttendanceRows(schoolId, STUDENT_TERM_ID);
    historyRows = Array.isArray(att.rows) ? att.rows : [];

    renderAttendanceGrid(historyRows);
    checkStatus(historyRows);
  } catch (err) {
    console.error(err);
    notify("Load Failed", err.message || "Unable to load student data.", "error");
  }
};

function toggleNav(show) {
  const nav = document.getElementById("main-nav");
  if (!nav) return;
  if (show) nav.classList.remove("nav-hidden");
  else nav.classList.add("nav-hidden");
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}

function renderStudentProfile(payload) {
  const s = payload.student || {};
  const lookups = payload.lookups || {};

  const fullName = `${safeText(s.first_name, "")} ${safeText(s.last_name, "")}`.trim() || "Student";
  const schoolId = safeText(s.school_id, "--");
  const section = safeText(s.section, "--");
  const programName = safeText(lookups.program_name, "NSTP");

  // ✅ this will now work because backend returns it
  const termLabel = safeText(lookups.term_label, "Current Term");

  const elName = document.getElementById("student-fullname");
  const elSub = document.getElementById("student-subinfo");
  const elTerm = document.getElementById("student-termlabel");

  if (elName) elName.innerText = fullName.toUpperCase();
  if (elSub) elSub.innerText = `${schoolId} • ${String(programName).toUpperCase()} • SECTION ${String(section).toUpperCase()}`;
  if (elTerm) elTerm.innerText = String(termLabel).toUpperCase();

  setText("pf-name", fullName);
  setText("pf-id", schoolId);
  setText("pf-email", safeText(s.email, "--"));
  setText("pf-section", `SECTION ${String(section).toUpperCase()}`);
  setText("pf-program", String(programName).toUpperCase());

  // optional: show term somewhere in profile modal if you have an element
  const pfTerm = document.getElementById("pf-term");
  if (pfTerm) pfTerm.innerText = String(termLabel).toUpperCase();
}

function renderAttendanceGrid(rows) {
  const grid = document.getElementById("attendance-grid");
  if (!grid) return;

  grid.innerHTML = "";

  const sorted = [...rows].sort((a, b) => {
    const da = new Date(String(a.session_date).slice(0, 10));
    const db = new Date(String(b.session_date).slice(0, 10));
    return da - db;
  });

  sorted.forEach((r, i) => {
    const mark = computeMark(r.in_status, r.out_status);
    const dot = document.createElement("div");
    dot.className =
      `attendance-dot aspect-square rounded-2xl flex items-center justify-center text-[10px] text-white font-black shadow-lg ` +
      `${markToDotTheme(mark)}`;
    dot.innerText = pad2(i + 1);
    dot.onclick = () => openSessionModal(r, mark);
    grid.appendChild(dot);
  });

  if (sorted.length === 0) {
    const empty = document.createElement("div");
    empty.className = "col-span-full text-center text-sm text-slate-400 font-semibold py-6";
    empty.innerText = "No attendance records found for your account.";
    grid.appendChild(empty);
  }
}

function openSessionModal(row, mark) {
  setText("s-date", formatSessionDateLong(row.session_date));
  setText("s-in", formatTimeMySQL(row.in_time));
  setText("s-out", formatTimeMySQL(row.out_time));

  const badge = document.getElementById("s-badge");
  if (badge) {
    badge.innerText = markToLabel(mark);
    badge.className =
      `inline-block px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest mb-6 ` +
      `${markToBadgeTheme(mark)}`;
  }

  document.getElementById("modal-session")?.classList.remove("hidden");
  toggleNav(false);
}

function switchTab(tab) {
  const list = document.querySelectorAll(".list");
  list.forEach((item) => item.classList.remove("active"));

  if (tab === "home") {
    document.getElementById("li-home")?.classList.add("active");
    document.getElementById("page-home")?.classList.remove("page-hidden");
    document.getElementById("page-settings")?.classList.add("page-hidden");
  } else {
    document.getElementById("li-settings")?.classList.add("active");
    document.getElementById("page-home")?.classList.add("page-hidden");
    document.getElementById("page-settings")?.classList.remove("page-hidden");
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function checkStatus(rows) {
  const marks = (rows || []).map((r) => computeMark(r.in_status, r.out_status));

  const abs = marks.filter((m) => m === "absent").length;
  const lat = marks.filter((m) => m === "late").length;
  const eo = marks.filter((m) => m === "early_out").length;
  const exc = marks.filter((m) => m === "excused").length;
  const total = marks.length;
  const pres = marks.filter((m) => m === "present").length;

  const ic = document.getElementById("status-icon");
  const tit = document.getElementById("status-title");
  const des = document.getElementById("status-desc");
  const cont = document.getElementById("remarks-container");
  if (!ic || !tit || !des || !cont) return;

  if (total === 0) {
    tit.innerText = "No Records Yet";
    des.innerText = "Your attendance dots will appear here once sessions are logged.";
    ic.className = "w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-lg bg-slate-400 text-white";
    ic.innerHTML = '<i class="fas fa-clock text-2xl"></i>';
    cont.className =
      "mt-12 p-8 rounded-[2.5rem] border-2 border-dashed flex flex-col sm:flex-row items-center gap-8 transition-all border-slate-100 bg-slate-50/30";
    tit.className = "font-black text-2xl tracking-tighter uppercase text-slate-600";
    return;
  }

  let s_title = "";
  let s_msg = "";
  let s_theme = "emerald";

  if (pres === total) {
    s_title = "Excellent Attendance";
    s_msg = "Perfect record maintained. Your commitment to the program is exemplary.";
  } else if (abs >= 3) {
    s_title = "Drop Out";
    s_msg = "Maximum allowable absences reached. Please contact your coordinator.";
    s_theme = "rose";
  } else if (abs === 0 && (lat + eo) > 0 && (lat + eo) <= 2) {
    s_title = "On Time Performance is Encouraged";
    s_msg = "Your record is good, but try to arrive earlier to maintain a perfect standing.";
    s_theme = "teal";
  } else if ((lat + eo) >= 3 && (lat + eo) <= 5 && abs === 0) {
    s_title = "Attendance Warning";
    s_msg = "Multiple late/early-out records detected. Continued issues may affect your final grade.";
    s_theme = "amber";
  } else if ((lat + eo) >= 6) {
    s_title = "High Risk Due to Attendance Issues";
    s_msg = "Frequent late/early-out has put your standing at risk. Immediate improvement is required.";
    s_theme = "amber";
  } else if (exc > 0 && pres + exc === total) {
    s_title = "Approved Excused Attendance";
    s_msg = "Your absences have been officially excused. No penalty applied.";
    s_theme = "slate";
  } else if ((lat + eo) > 0 && abs === 1) {
    s_title = "Needs Improvement";
    s_msg = "A combination of late/early-out entries and one absence requires your attention.";
    s_theme = "amber";
  } else if (abs === 2 && (lat + eo) === 2) {
    s_title = "At Risk of Drop Out";
    s_msg = "Critical status: You are one absence away from being dropped from the program.";
    s_theme = "rose";
  } else {
    s_title = "Very Good Attendance";
    s_msg = "High attendance record with only occasional lapses. Keep it up.";
    s_theme = "teal";
  }

  const themes = {
    emerald: "bg-emerald-500 border-emerald-100 text-emerald-600",
    rose: "bg-rose-500 border-rose-100 text-rose-600",
    amber: "bg-amber-400 border-amber-100 text-amber-600",
    teal: "bg-teal-600 border-teal-100 text-teal-700",
    slate: "bg-slate-400 border-slate-100 text-slate-600",
  };

  const bgMap = {
    emerald: "bg-emerald-50/30",
    rose: "bg-rose-50/30",
    amber: "bg-amber-50/30",
    teal: "bg-teal-50/30",
    slate: "bg-slate-50/30",
  };

  tit.innerText = s_title;
  des.innerText = s_msg;

  ic.className = `w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${themes[s_theme].split(" ")[0]} text-white`;
  ic.innerHTML =
    s_theme === "rose"
      ? '<i class="fas fa-times text-2xl"></i>'
      : s_theme === "amber"
      ? '<i class="fas fa-exclamation text-2xl"></i>'
      : '<i class="fas fa-check-double text-2xl"></i>';

  cont.className = `mt-12 p-8 rounded-[2.5rem] border-2 border-dashed flex flex-col sm:flex-row items-center gap-8 transition-all ${themes[s_theme].split(" ")[1]} ${bgMap[s_theme]}`;
  tit.className = `font-black text-2xl tracking-tighter uppercase ${themes[s_theme].split(" ")[2]}`;
}

function showLogoutModal() {
  document.getElementById("modal-logout")?.classList.remove("hidden");
  toggleNav(false);
}

function closeModal(id) {
  document.getElementById(id)?.classList.add("hidden");
  toggleNav(true);
}

function performLogout() {
  closeModal("modal-logout");
  notify("Sign Out", "Session ended safely.", "success");
  localStorage.removeItem("nstp_school_id");
  localStorage.removeItem("nstp_user");
  localStorage.removeItem("student_school_id");
  localStorage.removeItem("school_id");
  sessionStorage.removeItem("nstp_school_id");
  sessionStorage.removeItem("student_school_id");
  sessionStorage.removeItem("school_id");
}

function toggleView(id) {
  const input = document.getElementById(id);
  if (!input) return;
  input.type = input.type === "password" ? "text" : "password";
}

async function handlePass(e) {
  e.preventDefault();

  const current = document.getElementById("p1")?.value || "";
  const n = document.getElementById("p2")?.value || "";
  const c = document.getElementById("p3")?.value || "";

  if (n !== c) return notify("Sync Error", "New passwords do not match.", "error");
  if (!n || n.length < 6) return notify("Weak Password", "Use at least 6 characters.", "error");

  try {
    const schoolId = getStudentSchoolId();
    if (!schoolId) throw new Error("No student ID in session.");

    const res = await fetch(`${API_BASE}/student/password`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ school_id: schoolId, currentPassword: current, newPassword: n }),
    });

    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text || null;
    }

    if (!res.ok) {
      const msg =
        (data && typeof data === "object" && (data.message || data.error)) ||
        (typeof data === "string" && data) ||
        `Password update failed (${res.status})`;
      throw new Error(msg);
    }

    notify("Success", "Security updated.", "success");
    e.target.reset();
  } catch (err) {
    console.error(err);
    notify("Error", err.message || "Unable to update password.", "error");
  }
}

function notify(t, m, type) {
  const ico = document.getElementById("notif-ico");
  const title = document.getElementById("notif-title");
  const msg = document.getElementById("notif-msg");
  const modal = document.getElementById("modal-notify");

  if (title) title.innerText = t;
  if (msg) msg.innerText = m;

  if (ico) {
    ico.className = `w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 text-2xl ${
      type === "success" ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
    }`;
    ico.innerHTML = type === "success" ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-exclamation-triangle"></i>';
  }

  if (modal) modal.classList.remove("hidden");
  toggleNav(false);
}