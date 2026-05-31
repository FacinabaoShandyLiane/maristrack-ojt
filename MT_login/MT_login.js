/* ================================
   CONFIG
================================ */
const API_BASE = "/api/nstp"; // server.js: app.use("/api/nstp", nstpRoutes);

/* ================================
   NAVIGATION / SESSION UI
================================ */
function goToDashboard() {
  window.location.href = "/MarisTrack/MT_dashboard/MT_dashboard.html";
}

function goToStudents() {
  window.location.href = "/MarisTrack/MT_student/MT_student.html";
}

function logoutSession() {
  document.getElementById("success-page")?.classList.add("hidden");
  document.getElementById("role-page")?.classList.remove("hidden");
  document.querySelectorAll("input").forEach((i) => (i.value = ""));
  try {
    localStorage.removeItem("nstp_user");
    localStorage.removeItem("nstp_school_id");
  } catch {}
}

/* ================================
   AUTH PAGE SWITCHING
================================ */
function openAuth(type) {
  document.getElementById("role-page")?.classList.add("hidden");
  document.getElementById("auth-page")?.classList.remove("hidden");
  switchAuth(type);

  if (type === "register") {
    initRegisterDropdowns().catch((e) => {
      console.error(e);
      showSimpleModal(
        "Error",
        e?.message || "Failed to load registration lists.",
        "error",
      );
    });
  }
}

function goBackToRole() {
  document.getElementById("auth-page")?.classList.add("hidden");
  document.getElementById("role-page")?.classList.remove("hidden");
}

function switchAuth(state) {
  const containers = [
    "login-container",
    "forgot-container",
    "reset-container",
    "register-container",
  ];
  containers.forEach((id) =>
    document.getElementById(id)?.classList.add("hidden"),
  );

  const target = document.getElementById(`${state}-container`);
  if (target) target.classList.remove("hidden");
}

/* ================================
   FETCH HELPERS
================================ */
async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...options,
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
      `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data;
}

/* ================================
   DYNAMIC DROPDOWNS (DB)
   ✅ ONLY NSTP PROGRAM is used
================================ */
let __listsLoaded = false;

function setSelectOptions(
  selectEl,
  items,
  placeholderText,
  valueKey,
  labelKey,
) {
  if (!selectEl) return;
  selectEl.innerHTML = `<option value="">${placeholderText}</option>`;
  (items || []).forEach((it) => {
    const opt = document.createElement("option");
    opt.value = String(it[valueKey]);
    opt.textContent = it[labelKey];
    selectEl.appendChild(opt);
  });
}

function setSelectDisabled(selectEl, disabled = true) {
  if (!selectEl) return;
  selectEl.disabled = disabled;
  if (disabled) selectEl.classList.add("opacity-60", "cursor-not-allowed");
  else selectEl.classList.remove("opacity-60", "cursor-not-allowed");
}

async function initRegisterDropdowns() {
  if (__listsLoaded) return;

  const programSelect = document.getElementById("reg-program");

  // Disable + hide old selects if they exist
  const deptSelect = document.getElementById("reg-department");
  const courseSelect = document.getElementById("reg-course");
  const yearSelect = document.getElementById("reg-year");

  [deptSelect, courseSelect, yearSelect].forEach((el) => {
    if (!el) return;
    setSelectDisabled(el, true);
    const wrapper =
      el.closest(
        ".field, .form-field, .space-y-2, .w-full, .col-span-1, .col-span-2",
      ) || el.parentElement;
    if (wrapper) wrapper.classList.add("hidden");
  });

  const programs = await fetchJSON(`${API_BASE}/programs`);
  setSelectOptions(
    programSelect,
    programs,
    "Select NSTP Program",
    "id",
    "program_name",
  );
  setSelectDisabled(programSelect, false);

  __listsLoaded = true;
}

/* ================================
   LOGIN (DB) — ADMIN first, else STUDENT
================================ */
async function handleLogin() {
  const school_id =
    document.getElementById("login-email")?.value.trim() || "demo_user";

  try {
    localStorage.setItem("nstp_school_id", String(school_id));

    localStorage.setItem(
      "nstp_user",
      JSON.stringify({
        school_id: String(school_id),
        role: "admin",
      }),
    );

    // ✅ fake auth/session
    localStorage.setItem("token", "demo-token");
    localStorage.setItem("isLoggedIn", "true");

    localStorage.setItem("mt_sidebar_expanded", "1");
  } catch {}

  window.location.href = "../MT_dashboard/MT_dashboard.html";
}

/* ================================
   FORGOT / RESET (DB)
   ✅ This sends email via backend nodemailer
================================ */
function getPublicBaseURL() {
  return window.location.origin;
}

function getResetLink(token) {
  // This is where you want user to land after clicking email link:
  // It will auto-open reset container because of token param.
  const base = getPublicBaseURL();
  return `${base}/MarisTrack/MT_login/MT_login.html?token=${encodeURIComponent(token)}`;
}

async function sendResetEmail() {
  const email = document.getElementById("forgot-email").value.trim();
  if (!email)
    return showSimpleModal(
      "Required",
      "Please enter your registered email.",
      "error",
    );

  try {
    await fetchJSON(`${API_BASE}/auth/forgot`, {
      method: "POST",
      body: JSON.stringify({ email }),
    });

    // ✅ DO NOT show a "Go to Reset" button
    // ✅ DO NOT switch to reset container
    showSimpleModal(
      "Check your Email",
      `If an account exists for ${email}, a reset link has been sent. Please open the link from your email to continue.`,
      "success",
    );

    // Optional: clear field
    document.getElementById("forgot-email").value = "";
  } catch (e) {
    showSimpleModal(
      "Error",
      e.message || "Failed to send reset link.",
      "error",
    );
  }
}

function getTokenFromURL() {
  try {
    const u = new URL(window.location.href);
    return u.searchParams.get("token");
  } catch {
    return null;
  }
}

async function submitNewPassword() {
  const p1 = document.getElementById("new-password")?.value;
  const p2 = document.getElementById("confirm-new-password")?.value;

  if (!p1 || !p2)
    return showSimpleModal("Error", "All fields are required.", "error");
  if (p1.length < 8)
    return showSimpleModal(
      "Error",
      "Password must be at least 8 characters.",
      "error",
    );
  if (p1 !== p2)
    return showSimpleModal("Error", "Passwords do not match.", "error");

  const token = getTokenFromURL();
  if (!token) {
    return showSimpleModal(
      "Error",
      "Reset token is missing. Please open the reset link from your email.",
      "error",
    );
  }

  try {
    await fetchJSON(`${API_BASE}/auth/reset`, {
      method: "POST",
      body: JSON.stringify({ token, password: p1 }),
    });

    showActionModal(
      "Success",
      "You have successfully changed your password!",
      "Back to Login",
      () => {
        switchAuth("login");
        document.querySelectorAll("input").forEach((i) => (i.value = ""));
        try {
          const u = new URL(window.location.href);
          u.searchParams.delete("token");
          window.history.replaceState({}, document.title, u.toString());
        } catch {}
      },
    );
  } catch (e) {
    showSimpleModal("Error", e.message || "Failed to reset password.", "error");
  }
}

// Backward compatible: keep old function name if your HTML calls it
function simulateResetEmail() {
  return sendResetEmail();
}

/* ================================
   REGISTER (DB)
================================ */
async function handleRegister() {
  const school_id = document.getElementById("reg-school-id")?.value.trim();

  const fname = document.getElementById("reg-fname")?.value.trim();
  const lname = document.getElementById("reg-lname")?.value.trim();
  const email = document.getElementById("reg-email")?.value.trim();
  const password = document.getElementById("reg-password")?.value;

  const nstp_program_id = document.getElementById("reg-program")?.value;

  if (
    !school_id ||
    !fname ||
    !lname ||
    !email ||
    !password ||
    !nstp_program_id
  ) {
    return showSimpleModal("Error", "All fields are required.", "error");
  }

  try {
    await fetchJSON(`${API_BASE}/students/register`, {
      method: "POST",
      body: JSON.stringify({
        school_id,
        first_name: fname,
        last_name: lname,
        email,
        password,
        nstp_program_id: Number(nstp_program_id),
      }),
    });

    showActionModal(
      "Registration Successful",
      `Welcome ${fname} ${lname}!`,
      "Proceed to Login",
      () => {
        switchAuth("login");
        document
          .querySelectorAll(
            "#register-container input, #register-container select",
          )
          .forEach((i) => (i.value = ""));
      },
    );
  } catch (e) {
    showSimpleModal(
      "Registration Failed",
      e.message || "Unable to register student.",
      "error",
    );
  }
}

/* ================================
   MODAL UTILS (UNCHANGED UI)
================================ */
function closeModal() {
  document.getElementById("modal-overlay")?.classList.add("hidden");
}

function showSimpleModal(title, msg, type = "success") {
  const overlay = document.getElementById("modal-overlay");
  const content = document.getElementById("modal-content");
  if (!overlay || !content) return;

  overlay.classList.remove("hidden");

  content.innerHTML = `
    <div class="p-10 text-center">
      <div class="w-16 h-16 ${type === "success" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"} rounded-3xl flex items-center justify-center mx-auto mb-6">
        <i class="fa-solid ${type === "success" ? "fa-circle-check" : "fa-circle-xmark"} text-3xl"></i>
      </div>
      <h2 class="text-xl font-black text-teal-950 mb-2">${title}</h2>
      <p class="text-slate-400 text-xs font-bold mb-10 leading-relaxed">${msg}</p>
      <button onclick="closeModal()" class="w-full py-4 bg-teal-950 text-white rounded-2xl font-bold uppercase tracking-widest text-[10px] shadow-lg active:scale-95 transition-all">Dismiss</button>
    </div>
  `;
}

function showActionModal(title, msg, btnText, onConfirm) {
  const overlay = document.getElementById("modal-overlay");
  const content = document.getElementById("modal-content");
  if (!overlay || !content) return;

  overlay.classList.remove("hidden");

  content.innerHTML = `
    <div class="p-10 text-center">
      <div class="w-16 h-16 bg-teal-50 text-teal-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
        <i class="fa-solid fa-bell text-2xl"></i>
      </div>
      <h2 class="text-xl font-black text-teal-950 mb-2">${title}</h2>
      <p class="text-slate-400 text-xs font-bold mb-10 px-2">${msg}</p>
      <button id="modal-action-btn" class="w-full py-4 bg-teal-600 text-white rounded-2xl font-bold uppercase tracking-widest text-[10px] shadow-lg active:scale-95 transition-all">${btnText}</button>
    </div>
  `;

  document.getElementById("modal-action-btn").onclick = () => {
    onConfirm();
    closeModal();
  };
}

/* ================================
   BOOT
================================ */
document.addEventListener("DOMContentLoaded", () => {
  // If register container is visible, load lists
  const reg = document.getElementById("register-container");
  if (reg && !reg.classList.contains("hidden")) {
    initRegisterDropdowns().catch(console.error);
  }

  // If opened with token, auto-open reset container
  const token = getTokenFromURL();
  if (token) {
    try {
      document.getElementById("role-page")?.classList.add("hidden");
      document.getElementById("auth-page")?.classList.remove("hidden");
      switchAuth("reset");
    } catch {}
  }
});
