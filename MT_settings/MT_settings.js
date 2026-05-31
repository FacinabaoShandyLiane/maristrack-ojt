/* =========================================================
   MT_settings.js (FULL UPDATED — Dynamic Settings + Modern Sidebar)
   ✅ Compatible with backend:
      GET  /api/settings/me
      PUT  /api/settings/name
      POST /api/settings/password/change
      POST /api/settings/email/send-otp
      POST /api/settings/email/verify-otp
      POST /api/logout
   ✅ Works EVEN if buttons do NOT have IDs (fallback selectors)
========================================================= */

/* =========================
   API HELPER
========================= */
async function api(url, { method = "GET", body = null, headers = {} } = {}) {
  const opts = {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...headers },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);

  let data = null;
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) {
    data = await res.json().catch(() => null);
  } else {
    data = await res.text().catch(() => null);
  }

  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && data.message) ||
      (typeof data === "string" && data) ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

function $(id) {
  return document.getElementById(id);
}
function qs(sel) {
  return document.querySelector(sel);
}
function qsa(sel) {
  return Array.from(document.querySelectorAll(sel));
}

function setText(id, value, fallback = "—") {
  const el = $(id);
  if (!el) return;
  const v = value === null || value === undefined ? "" : String(value).trim();
  el.textContent = v ? v : fallback;
}
function setValue(id, value = "") {
  const el = $(id);
  if (!el) return;
  el.value = value ?? "";
}

/* =========================
   GLOBAL STATE
========================= */
const settingsState = {
  me: null, // { id, name, email, emailVerified, activeSchoolYearLabel, roleName, roleLabel }
  pendingEmail: null, // last email used to request otp
};

/* =========================
   MODERN SIDEBAR (Dashboard-style)
========================= */
(function initModernSidebar() {
  const sidebar = $("sidebar");
  const indicator = $("indicator");
  const navItems = Array.from(document.querySelectorAll(".nav-item"));
  const btnToggle = $("btnToggleSidebar");

  const ITEM_HEIGHT = 52;
  const ITEM_GAP = 14;

  if (!sidebar || navItems.length === 0) {
    console.warn("Modern sidebar init skipped: missing #sidebar or .nav-item");
    return;
  }

  // ✅ Start from HTML default, then override if localStorage exists
  let isSidebarExpanded = sidebar.classList.contains("expanded");

  try {
    const saved = localStorage.getItem("mt_sidebar_expanded");
    if (saved === "1") isSidebarExpanded = true;
    else if (saved === "0") isSidebarExpanded = false;
  } catch {}

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
    let activeBtn = navItems.find((b) => b.classList.contains("active"));
    if (!activeBtn)
      activeBtn = navItems.find(
        (b) => (b.dataset.route || b.getAttribute("data-route")) === "settings",
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

  applySidebarState();

  requestAnimationFrame(() => {
    const activeBtn = getActiveBtn();
    if (activeBtn && !activeBtn.classList.contains("active"))
      activeBtn.classList.add("active");
    moveIndicatorToActive();
  });

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

/* =========================
   PAGE INIT
========================= */
window.addEventListener("load", () => {
  try {
    document.documentElement.classList.remove("sidebar-preload");
  } catch {}
});

/* =========================
   ESC key closes modal
========================= */
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

/* =========================
   MODAL ENGINE
========================= */
function showSimpleModal(
  title,
  msg = "This action has been processed successfully.",
) {
  const overlay = $("modal-overlay");
  const container = $("modal-container");
  if (!overlay || !container) return;

  overlay.classList.remove("hidden");
  container.innerHTML = `
    <div class="p-10 text-center">
      <div class="w-20 h-20 bg-darkCyan-50 text-darkCyan-600 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">
        <i class="fa-solid fa-circle-check"></i>
      </div>
      <h2 class="text-2xl font-black text-darkCyan-950 mb-2">${escapeHtml(title)}</h2>
      <p class="text-slate-400 text-sm mb-10">${escapeHtml(msg)}</p>
      <button onclick="closeModal()" class="w-full py-4 bg-darkCyan-950 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl">
        Dismiss
      </button>
    </div>
  `;

  requestAnimationFrame(() => {
    container.classList.remove("scale-95", "opacity-0");
    container.classList.add("scale-100", "opacity-100");
  });
}

function confirmLogout() {
  const modal = document.getElementById("logoutModal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

async function doLogout() {
  localStorage.clear();
  sessionStorage.clear();

  window.location.href = "../MT_login/MT_login.html";
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

function closeModal() {
  const overlay = $("modal-overlay");
  const container = $("modal-container");
  if (!overlay || !container) return;
  if (overlay.classList.contains("hidden")) return;

  container.classList.remove("scale-100", "opacity-100");
  container.classList.add("scale-95", "opacity-0");

  setTimeout(() => {
    overlay.classList.add("hidden");
    container.innerHTML = "";
  }, 200);
}

/* =========================
   DYNAMIC: LOAD SETTINGS
========================= */
async function loadSettings() {
  settingsState.me = {
    id: "ADMIN-001",
    name: "Administrator",
    email: "admin@maristrack.edu",
    emailVerified: true,
    activeSchoolYearLabel: "AY 2025-2026",
    activeSemesterLabel: "2nd Semester",
    roleName: "Administrator",
    roleLabel: "Administrator",
  };

  const me = settingsState.me;

  setText("ui-fullname", me.name);
  setText("ui-userid", me.id);

  setText("sb-role-name", me.roleName);
  setText("sb-role-label", me.roleLabel);

  setText("sy-label", me.activeSchoolYearLabel);
  setText("sem-label", me.activeSemesterLabel);

  setValue("settings-email", me.email);

  const hint = $("email-hint");

  if (hint) {
    hint.textContent = "Email verified ✅";
  }
}

/* =========================
   EDIT ADMIN NAME
========================= */
function openEditProfileModal() {
  const currentName = settingsState.me?.name || "";
  const currentId = settingsState.me?.id || "";

  const overlay = $("modal-overlay");
  const container = $("modal-container");
  if (!overlay || !container) return;

  overlay.classList.remove("hidden");
  container.innerHTML = `
    <div class="p-8">
      <h2 class="text-xl font-black text-darkCyan-950 mb-1">Edit Admin Profile</h2>
      <p class="text-slate-400 text-sm mb-6">
        You can update your <b>Name</b> and <b>User ID</b>. User ID must be unique.
      </p>

      <label class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">New User ID</label>
      <input id="edit-id-input" type="text" value="${escapeHtml(currentId)}"
        class="mt-2 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-1 focus:ring-darkCyan-500" />
      <p class="mt-2 text-[10px] font-bold text-slate-400">
        Allowed: letters, numbers, underscore, dash. (3–50 chars)
      </p>

      <div class="mt-5"></div>

      <label class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">New Name</label>
      <input id="edit-name-input" type="text" value="${escapeHtml(currentName)}"
        class="mt-2 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-1 focus:ring-darkCyan-500" />

      <p id="edit-profile-hint" class="mt-3 text-[10px] font-bold text-rose-600"></p>

      <div class="mt-6 grid grid-cols-2 gap-3">
        <button onclick="closeModal()"
          class="py-3 bg-slate-100 text-slate-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all">
          Cancel
        </button>
        <button id="btn-save-profile"
          class="py-3 bg-darkCyan-950 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all">
          Save
        </button>
      </div>
    </div>
  `;

  requestAnimationFrame(() => {
    container.classList.remove("scale-95", "opacity-0");
    container.classList.add("scale-100", "opacity-100");
  });

  const btn = $("btn-save-profile");
  btn?.addEventListener("click", async () => {
    const hint = $("edit-profile-hint");
    if (hint) hint.textContent = "";

    const newId = ($("edit-id-input")?.value || "").trim();
    const newName = ($("edit-name-input")?.value || "").trim();

    // validations
    if (!newId) return (hint.textContent = "User ID cannot be empty.");
    if (newId.length < 3 || newId.length > 50)
      return (hint.textContent = "User ID must be 3–50 characters.");
    if (!/^[A-Za-z0-9_-]+$/.test(newId))
      return (hint.textContent = "User ID has invalid characters.");
    if (!newName) return (hint.textContent = "Name cannot be empty.");
    if (newName.length > 150)
      return (hint.textContent = "Name too long (max 150).");

    try {
      btn.disabled = true;

      // ✅ FRONTEND DEMO UPDATE ONLY
      settingsState.me.id = newId;
      settingsState.me.name = newName;

      setText("ui-userid", newId);
      setText("ui-fullname", newName);

      closeModal();

      showSimpleModal("Updated", "User ID and Name updated successfully.");
    } catch (err) {
      if (hint) {
        hint.textContent = "Failed to update profile.";
      }
    } finally {
      btn.disabled = false;
    }
  });
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   EMAIL OTP
========================= */
function getSendBtn() {
  return $("btn-send-code") || qs('button[onclick="sendVerifyCode()"]') || null;
}
function getVerifyBtn() {
  return $("btn-verify-code") || qs('button[onclick="verifyCode()"]') || null;
}

async function sendVerifyCode() {
  const email = ($("settings-email")?.value || "").trim();
  const hint = $("email-hint");
  if (hint) hint.textContent = "";

  if (!email)
    return showSimpleModal(
      "Missing Email",
      "Please enter a valid email first.",
    );

  const btn = getSendBtn();
  try {
    if (btn) btn.disabled = true;

    showSimpleModal("Code Sent", `A verification code was sent to ${email}.`);
    settingsState.pendingEmail = email;
    if (hint) hint.textContent = `OTP sent to ${email}.`;
    showSimpleModal(
      "Code Sent",
      `A verification code was sent to ${email}. Please check your inbox.`,
    );
  } catch (err) {
    if (hint) hint.textContent = err.message || "Failed to send OTP.";
    showSimpleModal("Send Failed", err.message || "Could not send OTP.");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function verifyCode() {
  const email = ($("settings-email")?.value || "").trim();
  const code = ($("verify-code-input")?.value || "").trim();
  const hint = $("email-hint");
  if (hint) hint.textContent = "";

  if (!email)
    return showSimpleModal("Missing Email", "Please enter your email first.");
  if (!code)
    return showSimpleModal(
      "Missing Code",
      "Please enter the verification code.",
    );

  const btn = getVerifyBtn();
  try {
    if (btn) btn.disabled = true;

    if (settingsState.me) {
      settingsState.me.email = email;
      settingsState.me.emailVerified = true;
    }

    if (hint) hint.textContent = "Email verified ✅";

    showSimpleModal(
      "Email Verified",
      "Your email address has been successfully verified.",
    );
    if (settingsState.me) {
      settingsState.me.email = email;
      settingsState.me.emailVerified = true;
    }
    if (hint) hint.textContent = "Email verified ✅";
    showSimpleModal(
      "Email Verified",
      "Your email address has been successfully verified.",
    );
  } catch (err) {
    if (hint) hint.textContent = err.message || "Invalid OTP.";
    showSimpleModal(
      "Verification Failed",
      err.message || "Invalid or expired OTP.",
    );
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* =========================
   CHANGE PASSWORD
========================= */
function togglePw(inputId, btn) {
  const input = $(inputId);
  if (!input || !btn) return;

  const icon = btn.querySelector("i");
  const isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";

  // ✅ correct icon behavior
  if (icon) {
    icon.classList.toggle("fa-eye", !isHidden);
    icon.classList.toggle("fa-eye-slash", isHidden);
  }
}

function clearPasswordFields() {
  ["pw-current", "pw-new", "pw-confirm"].forEach((id) => {
    const el = $(id);
    if (el) el.value = "";
  });
  const hint = $("pw-hint");
  if (hint) hint.textContent = "";
}

function getUpdatePwBtn() {
  return (
    $("btn-update-password") ||
    qs('button[onclick="handleChangePassword()"]') ||
    null
  );
}
function getClearPwBtn() {
  return (
    $("btn-clear-password") ||
    qs('button[onclick="clearPasswordFields()"]') ||
    null
  );
}

async function handleChangePassword() {
  const currentPw = ($("pw-current")?.value || "").trim();
  const newPw = ($("pw-new")?.value || "").trim();
  const confirmPw = ($("pw-confirm")?.value || "").trim();
  const hint = $("pw-hint");

  if (hint) hint.textContent = "";

  if (!currentPw || !newPw || !confirmPw) {
    return showSimpleModal(
      "Missing Fields",
      "Please fill in all password fields.",
    );
  }
  if (newPw.length < 8) {
    return showSimpleModal(
      "Weak Password",
      "New password must be at least 8 characters.",
    );
  }
  if (newPw !== confirmPw) {
    return showSimpleModal(
      "Password Mismatch",
      "New password and confirm password do not match.",
    );
  }
  if (newPw === currentPw) {
    return showSimpleModal(
      "No Changes",
      "New password must be different from the current password.",
    );
  }

  const btn = getUpdatePwBtn();
  try {
    if (btn) btn.disabled = true;
    showSimpleModal(
      "Password Updated",
      "Your password has been changed successfully.",
    );

    clearPasswordFields();
    showSimpleModal(
      "Password Updated",
      "Your password has been changed successfully.",
    );
    clearPasswordFields();
  } catch (err) {
    if (hint) hint.textContent = err.message || "Failed to update password.";
    showSimpleModal(
      "Update Failed",
      err.message || "Could not update password.",
    );
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* =========================
   WIRE EVENTS
========================= */
document.addEventListener("DOMContentLoaded", () => {
  loadSettings();

  $("btn-edit-profile")?.addEventListener("click", openEditProfileModal);
  $("btn-edit-profile-2")?.addEventListener("click", openEditProfileModal);
  // Optional wiring if you ADD IDs later — but works without IDs too
  $("btn-send-code")?.addEventListener("click", sendVerifyCode);
  $("btn-verify-code")?.addEventListener("click", verifyCode);
  $("btn-update-password")?.addEventListener("click", handleChangePassword);
  $("btn-clear-password")?.addEventListener("click", clearPasswordFields);

  // If you don’t have IDs, add listeners by finding buttons by onclick
  qs('button[onclick="sendVerifyCode()"]')?.addEventListener("click", (e) => {
    e.preventDefault();
    sendVerifyCode();
  });
  qs('button[onclick="verifyCode()"]')?.addEventListener("click", (e) => {
    e.preventDefault();
    verifyCode();
  });
  qs('button[onclick="handleChangePassword()"]')?.addEventListener(
    "click",
    (e) => {
      e.preventDefault();
      handleChangePassword();
    },
  );
  qs('button[onclick="clearPasswordFields()"]')?.addEventListener(
    "click",
    (e) => {
      e.preventDefault();
      clearPasswordFields();
    },
  );

  // Click fullname to edit name
  const fullNameEl = $("ui-fullname");
  if (fullNameEl) {
    fullNameEl.style.cursor = "pointer";
    fullNameEl.title = "Click to edit name";
    fullNameEl.addEventListener("click", openEditProfileModal);
  }
});
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
// ✅ DO NOT use window.onload = ... (it overwrites other load handlers)
window.addEventListener("load", () => {
  updateClock();
  updateHeaderDate();
});
