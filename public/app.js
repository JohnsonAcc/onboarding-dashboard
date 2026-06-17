const isAdminRoute = location.pathname === "/admin";
const stateLabels = ["Not Started", "In Progress", "Completed"];
const stateClasses = ["not-started", "in-progress", "completed"];
const stateIcons = ["", "↻", "✓"];
const progressKey = "onboarding_progress_v1";
const emailKey = "onboarding_admin_email";
const passwordKey = "onboarding_admin_password";

let data = null;
let progress = loadProgress();
let openPhases = { 0: true };
let adminEmail = localStorage.getItem(emailKey) || "";
let adminPassword = sessionStorage.getItem(passwordKey) || "";
let dirty = false;

const $ = selector => document.querySelector(selector);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(progressKey)) || {};
  } catch {
    return {};
  }
}

function saveProgress() {
  localStorage.setItem(progressKey, JSON.stringify(progress));
}

function taskState(phaseIndex, taskIndex) {
  return progress[`${phaseIndex}_${taskIndex}`] || 0;
}

function setTaskState(phaseIndex, taskIndex, value) {
  progress[`${phaseIndex}_${taskIndex}`] = value;
  saveProgress();
}

function phaseStats(phaseIndex) {
  const tasks = data.phases[phaseIndex].tasks;
  const done = tasks.reduce((count, _task, taskIndex) => count + (taskState(phaseIndex, taskIndex) === 2 ? 1 : 0), 0);
  return { done, total: tasks.length };
}

function phaseComplete(phaseIndex) {
  const stats = phaseStats(phaseIndex);
  return stats.total > 0 && stats.done === stats.total;
}

function phaseLocked(phaseIndex) {
  if (phaseIndex === 0) return false;
  const phase = data.phases[phaseIndex];
  const lockByProgress = phase.lockByProgress ?? true;
  return lockByProgress && !phaseComplete(phaseIndex - 1);
}

function parseDescription(text) {
  return escapeHtml(text).replace(/&lt;t&gt;([^<]+)&lt;\/t&gt;/g, (_match, term) => {
    const tip = data.glossary?.[term] || "";
    if (!tip) return term;
    return `<span class="term">${term}<span class="tip">${escapeHtml(tip)}</span></span>`;
  });
}

function fileChip(file, options = {}) {
  const label = escapeHtml(file.label || "File");
  const href = escapeHtml(file.href || "#");
  const remove = options.canDelete ? `<button class="file-delete" type="button" data-delete-file="${href}" title="Delete ${label}">×</button>` : "";
  return `<span class="${options.banner ? "banner-file" : "task-link"}"><a href="${href}" target="_blank" rel="noopener">📄 ${label}</a>${remove}</span>`;
}

function renderBanner() {
  const banner = $("#fileBanner");
  const chips = (data.bannerFiles || []).map(file => fileChip(file, { banner: true, canDelete: isAdminRoute })).join("");
  const upload = isAdminRoute ? uploadControl("banner") : "";
  banner.innerHTML = `
    <span class="banner-folder">📁</span>
    <div class="banner-body">
      <strong>Important:</strong> Onboarding reference files are available below.
      <div class="banner-files">${chips || "<span>No files added yet.</span>"}${upload}</div>
    </div>
    <button class="banner-close" type="button" title="Dismiss">×</button>
  `;
  $(".banner-close").addEventListener("click", () => banner.hidden = true);
}

function uploadControl(target, phaseIndex = "", taskIndex = "") {
  return `
    <label class="upload-chip">
      + Add File
      <input type="file" data-upload-target="${target}" data-phase="${phaseIndex}" data-task="${taskIndex}">
    </label>
  `;
}

function renderSidebar() {
  const sidebar = $("#sidebar");
  let html = `
    <div class="sidebar-logo">
      <div class="logo-icon">P</div>
      <div><div class="logo-text">PVH Onboarding</div><div class="logo-sub">AMS Team Dashboard</div></div>
    </div>
    <div class="sidebar-title">Phases</div>
  `;
  data.phases.forEach((phase, index) => {
    const stats = phaseStats(index);
    const done = stats.total > 0 && stats.done === stats.total;
    html += `
      <button class="sidebar-item ${index === 0 ? "active" : ""} ${done ? "phase-done" : ""}" type="button" data-scroll-phase="${index}">
        <span class="s-icon">${escapeHtml(phase.icon)}</span>
        <span class="s-label">${escapeHtml(phase.title.replace(/Phase \d+: /, ""))}</span>
        <span class="s-count ${done ? "done" : ""}">${stats.done}/${stats.total}</span>
      </button>
    `;
  });
  html += `
    <div class="sidebar-bottom">
      ${isAdminRoute ? "" : "<button class=\"admin-nav-btn\" type=\"button\" id=\"openAdmin\">Admin</button>"}
      ${isAdminRoute ? "" : "<button class=\"ghost-btn\" type=\"button\" id=\"helpBtn\">? Help</button>"}
      <button class="reset-btn" type="button" id="resetProgress">↺ Reset My Progress</button>
    </div>
  `;
  sidebar.innerHTML = html;
}

function renderContent() {
  const content = $("#content");
  content.innerHTML = data.phases.map((phase, phaseIndex) => {
    const stats = phaseStats(phaseIndex);
    const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
    const locked = !isAdminRoute && phaseLocked(phaseIndex);
    const tasks = phase.tasks.map((task, taskIndex) => renderTask(task, phaseIndex, taskIndex, locked)).join("");
    return `
      <article class="phase-card ${openPhases[phaseIndex] ? "open" : ""}" id="phase-${phaseIndex}">
        <div class="phase-header" data-toggle-phase="${phaseIndex}">
          <span class="phase-chevron">›</span>
          <span class="phase-icon">${escapeHtml(phase.icon)}</span>
          <div class="phase-title-wrap">
            <div class="phase-title">${escapeHtml(phase.title)}${pct === 100 ? " ✓" : ""}</div>
            <div class="phase-desc">${escapeHtml(phase.desc)}</div>
          </div>
          <div class="phase-progress-wrap">
            <div class="phase-bar"><div class="phase-bar-fill ${pct === 100 ? "full" : ""}" style="width:${pct}%"></div></div>
            <span class="phase-count">${stats.done} / ${stats.total}</span>
          </div>
        </div>
        <div class="task-divider"></div>
        <div class="phase-tasks">
          <div class="task-list">
            ${locked ? `<div class="lock-msg">🔒 Complete <strong>${escapeHtml(data.phases[phaseIndex - 1].title)}</strong> first to unlock these tasks.</div>` : ""}
            ${tasks}
          </div>
        </div>
        ${isAdminRoute ? renderPhaseAdmin(phase, phaseIndex) : ""}
      </article>
    `;
  }).join("");
}

function renderTask(task, phaseIndex, taskIndex, locked) {
  const state = taskState(phaseIndex, taskIndex);
  const files = (task.files || []).map(file => fileChip(file, { canDelete: isAdminRoute })).join("");
  const upload = isAdminRoute ? uploadControl("task", phaseIndex, taskIndex) : "";
  return `
    <div class="task-item ${locked ? "locked" : ""} ${state === 2 ? "done" : ""}">
      <button class="task-check" type="button" data-state="${state}" data-task-state="${phaseIndex}:${taskIndex}">${stateIcons[state]}</button>
      <div class="task-body">
        <div class="task-name">Step ${taskIndex + 1}: ${escapeHtml(task.name)}</div>
        <div class="task-description">${parseDescription(task.desc)}</div>
        <div class="task-meta">
          <div class="file-list">${files || "<span class=\"task-owner\">No files attached</span>"}${upload}</div>
          <span class="task-badge ${stateClasses[state]}">${stateLabels[state]}</span>
          <span class="task-owner">👤 ${escapeHtml(task.owner)}</span>
        </div>
      </div>
    </div>
  `;
}

function renderPhaseAdmin(phase, phaseIndex) {
  const taskForms = phase.tasks.map((task, taskIndex) => `
    <div class="edit-grid" data-task-edit="${phaseIndex}:${taskIndex}">
      <input value="${escapeHtml(task.name)}" data-field="task.name" aria-label="Task name">
      <textarea data-field="task.desc" aria-label="Task description">${escapeHtml(task.desc)}</textarea>
      <input value="${escapeHtml(task.owner)}" data-field="task.owner" aria-label="Task owner">
      <div class="edit-actions">
        <button class="small-btn danger" type="button" data-delete-task="${phaseIndex}:${taskIndex}">Delete Task</button>
      </div>
    </div>
  `).join("");
  const lockByProgress = phase.lockByProgress ?? true;
  const lockLabel = lockByProgress ? "Unlock always" : "Lock by progress";
  return `
    <div class="admin-panel">
      <div class="edit-grid" data-phase-edit="${phaseIndex}">
        <input value="${escapeHtml(phase.icon)}" data-field="phase.icon" aria-label="Phase icon">
        <input value="${escapeHtml(phase.title)}" data-field="phase.title" aria-label="Phase title">
        <input value="${escapeHtml(phase.desc)}" data-field="phase.desc" aria-label="Phase description">
      </div>
      <div class="admin-panel-meta">
        <div class="admin-panel-meta-item">Lock mode: <strong>${lockByProgress ? "By progress" : "Always unlocked"}</strong></div>
        <button class="small-btn ghost-btn" type="button" data-toggle-phase-lock="${phaseIndex}">${lockLabel}</button>
      </div>
      ${taskForms}
      <div class="edit-actions">
        <button class="small-btn" type="button" data-add-task="${phaseIndex}">+ Add Task</button>
        <button class="small-btn danger" type="button" data-delete-phase="${phaseIndex}">Delete Phase</button>
      </div>
    </div>
  `;
}

function updateHeader() {
  const total = data.phases.reduce((sum, phase) => sum + phase.tasks.length, 0);
  let done = 0;
  let inProgress = 0;
  data.phases.forEach((phase, phaseIndex) => {
    phase.tasks.forEach((_task, taskIndex) => {
      const state = taskState(phaseIndex, taskIndex);
      if (state === 2) done += 1;
      if (state === 1) inProgress += 1;
    });
  });
  const todo = total - done - inProgress;
  const pct = total ? Math.round((done / total) * 100) : 0;
  $("#appTitle").textContent = data.title;
  $("#appSubtitle").textContent = data.subtitle;
  $("#modeLine").textContent = isAdminRoute ? "Admin Mode" : "";
  $("#pctLabel").textContent = `${pct}%`;
  $("#statDone").textContent = done;
  $("#statProg").textContent = inProgress;
  $("#statTodo").textContent = todo;
  $("#statTotal").textContent = total;
  $("#ringFg").style.strokeDashoffset = 201.06 - ((201.06 * pct) / 100);
}

function renderAll() {
  renderSidebar();
  renderContent();
  updateHeader();
}

function getProgressSummary() {
  const total = data.phases.reduce((sum, phase) => sum + phase.tasks.length, 0);
  let done = 0;
  let inProgress = 0;
  data.phases.forEach((phase, phaseIndex) => {
    phase.tasks.forEach((_task, taskIndex) => {
      const state = taskState(phaseIndex, taskIndex);
      if (state === 2) done += 1;
      if (state === 1) inProgress += 1;
    });
  });
  const todo = total - done - inProgress;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const phaseLines = data.phases.map((phase, phaseIndex) => {
    const stats = phaseStats(phaseIndex);
    return `${phase.title}: ${stats.done}/${stats.total}`;
  });
  return [
    `${data.title}`,
    `${data.subtitle}`,
    "",
    `Progress: ${done}/${total} completed (${pct}%)`,
    `In progress: ${inProgress}`,
    `Not started: ${todo}`,
    "",
    ...phaseLines,
    "",
    `View the dashboard: ${location.origin}${location.pathname}`
  ].join("\n");
}

async function shareProgress() {
  const summary = getProgressSummary();
  try {
    if (navigator.share) {
      await navigator.share({
        title: `${data.title} Progress`,
        text: summary,
        url: location.href
      });
      toast("Progress shared successfully.");
      return;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(summary);
      toast("Progress copied to clipboard.");
      return;
    }
    window.prompt("Copy your progress summary", summary);
  } catch (error) {
    toast(error.message || "Unable to share progress.");
  }
}

function markDirty() {
  dirty = true;
  const saveBtn = $("#saveBtn");
  if (saveBtn) saveBtn.textContent = "Save Changes *";
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if (adminEmail) headers["x-admin-email"] = adminEmail;
  if (adminPassword) headers["x-admin-password"] = adminPassword;
  const response = await fetch(path, { ...options, headers });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body;
}

async function saveData() {
  await api("/api/admin/onboarding", { method: "PUT", body: JSON.stringify(data) });
  dirty = false;
  $("#saveBtn").textContent = "Save Changes";
  toast("Saved.");
}

async function uploadFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  const uploaded = await api("/api/admin/upload", { method: "POST", body: form, headers: {} });
  if (input.dataset.uploadTarget === "banner") {
    data.bannerFiles = data.bannerFiles || [];
    data.bannerFiles.push(uploaded);
  } else {
    const phaseIndex = Number(input.dataset.phase);
    const taskIndex = Number(input.dataset.task);
    const task = data.phases[phaseIndex].tasks[taskIndex];
    task.files = task.files || [];
    task.files.push(uploaded);
  }
  markDirty();
  await saveData();
  renderAll();
}

async function deleteFile(href) {
  if (!confirm("Delete this file and remove it from the guide?")) return;
  await api("/api/admin/file", { method: "DELETE", body: JSON.stringify({ href }) });
  data.bannerFiles = (data.bannerFiles || []).filter(file => file.href !== href);
  data.phases.forEach(phase => phase.tasks.forEach(task => {
    task.files = (task.files || []).filter(file => file.href !== href);
  }));
  renderAll();
  toast("File deleted.");
}

function addPhase() {
  const number = data.phases.length + 1;
  data.phases.push({
    id: `phase_${Date.now()}`,
    icon: "📌",
    title: `Phase ${number}: New Phase`,
    desc: "Describe this onboarding phase.",
    tasks: [{ name: "New checkpoint", desc: "Describe what the new joiner should complete.", owner: "User", files: [] }]
  });
  openPhases[data.phases.length - 1] = true;
  markDirty();
  renderAll();
}

function addTask(phaseIndex) {
  data.phases[phaseIndex].tasks.push({ name: "New checkpoint", desc: "Describe what the new joiner should complete.", owner: "User", files: [] });
  markDirty();
  renderAll();
}

function deleteTask(phaseIndex, taskIndex) {
  if (!confirm("Delete this task?")) return;
  data.phases[phaseIndex].tasks.splice(taskIndex, 1);
  markDirty();
  renderAll();
}

function deletePhase(phaseIndex) {
  if (!confirm("Delete this phase?")) return;
  data.phases.splice(phaseIndex, 1);
  data.phases.forEach((phase, index) => {
    phase.title = phase.title.replace(/^Phase \d+:/, `Phase ${index + 1}:`);
  });
  markDirty();
  renderAll();
}

function handleAdminInput(target) {
  const field = target.dataset.field;
  if (!field) return;
  const phaseEdit = target.closest("[data-phase-edit]");
  const taskEdit = target.closest("[data-task-edit]");
  if (phaseEdit) {
    const phase = data.phases[Number(phaseEdit.dataset.phaseEdit)];
    phase[field.split(".")[1]] = target.value;
  }
  if (taskEdit) {
    const [phaseIndex, taskIndex] = taskEdit.dataset.taskEdit.split(":").map(Number);
    data.phases[phaseIndex].tasks[taskIndex][field.split(".")[1]] = target.value;
  }
  markDirty();
}

function bindEvents() {
  document.addEventListener("click", async event => {
    const target = event.target;
    const toggle = target.closest("[data-toggle-phase]");
    if (toggle && !target.closest(".admin-panel")) {
      const index = Number(toggle.dataset.togglePhase);
      openPhases[index] = !openPhases[index];
      renderAll();
      return;
    }
    const stateButton = target.closest("[data-task-state]");
    if (stateButton) {
      const [phaseIndex, taskIndex] = stateButton.dataset.taskState.split(":").map(Number);
      setTaskState(phaseIndex, taskIndex, (taskState(phaseIndex, taskIndex) + 1) % 3);
      if (phaseComplete(phaseIndex) && phaseIndex < data.phases.length - 1) openPhases[phaseIndex + 1] = true;
      renderAll();
      return;
    }
    const sidebarButton = target.closest("[data-scroll-phase]");
    if (sidebarButton) {
      const index = Number(sidebarButton.dataset.scrollPhase);
      document.querySelectorAll(".sidebar-item").forEach((item, itemIndex) => item.classList.toggle("active", itemIndex === index));
      openPhases[index] = true;
      renderAll();
      setTimeout(() => $(`#phase-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
      return;
    }
    if (target.id === "resetProgress") {
      if (confirm("Reset your checklist progress?")) {
        progress = {};
        saveProgress();
        renderAll();
      }
      return;
    }
    if (target.id === "shareProgressBtn") {
      await shareProgress();
      return;
    }
    if (target.id === "openAdmin") {
      location.href = "/admin";
      return;
    }
    if (target.id === "helpBtn") {
      const supportIndex = data.phases.findIndex(phase => phase.id === "support" || phase.title.toLowerCase().includes("support"));
      if (supportIndex >= 0) {
        openPhases[supportIndex] = true;
        renderAll();
        setTimeout(() => document.querySelector(`#phase-${supportIndex}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
      }
      return;
    }
    if (target.dataset.togglePhaseLock) {
      const phaseIndex = Number(target.dataset.togglePhaseLock);
      const phase = data.phases[phaseIndex];
      phase.lockByProgress = !((phase.lockByProgress ?? true));
      markDirty();
      renderAll();
      return;
    }
    if (target.id === "addPhaseBtn") return addPhase();
    if (target.id === "saveBtn") {
      try { await saveData(); } catch (error) { toast(error.message); }
      return;
    }
    if (target.id === "logoutBtn") {
      localStorage.removeItem(emailKey);
      sessionStorage.removeItem(passwordKey);
      location.href = "/";
      return;
    }
    if (target.dataset.addTask) return addTask(Number(target.dataset.addTask));
    if (target.dataset.deleteTask) {
      const [phaseIndex, taskIndex] = target.dataset.deleteTask.split(":").map(Number);
      return deleteTask(phaseIndex, taskIndex);
    }
    if (target.dataset.deletePhase) return deletePhase(Number(target.dataset.deletePhase));
    if (target.dataset.deleteFile) {
      event.preventDefault();
      try { await deleteFile(target.dataset.deleteFile); } catch (error) { toast(error.message); }
    }
  });

  document.addEventListener("input", event => {
    if (isAdminRoute) handleAdminInput(event.target);
  });

  document.addEventListener("change", async event => {
    if (event.target.matches("[data-upload-target]")) {
      try { await uploadFile(event.target); } catch (error) { toast(error.message); }
    }
  });

  $("#loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    const email = $("#adminEmail").value.trim();
    const password = $("#adminPassword").value;
    $("#loginError").textContent = "";
    try {
      await api("/api/admin/verify", { method: "POST", body: JSON.stringify({ email, password }) });
      adminEmail = email;
      adminPassword = password;
      localStorage.setItem(emailKey, email);
      sessionStorage.setItem(passwordKey, password);
      await startApp();
    } catch (error) {
      $("#loginError").textContent = error.message;
    }
  });
}

function toast(message) {
  const old = $(".toast");
  if (old) old.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 2600);
}

async function fetchData() {
  data = await api("/api/onboarding", { headers: {} });
}

async function startApp() {
  await fetchData();
  if (isAdminRoute) {
    try {
      await api("/api/admin/verify", { method: "POST", body: JSON.stringify({ email: adminEmail, password: adminPassword }) });
      $("#adminLogin").hidden = true;
      $("#appShell").hidden = false;
      $("#adminActions").hidden = false;
    } catch {
      $("#adminLogin").hidden = false;
      $("#appShell").hidden = true;
      $("#adminEmail").value = adminEmail;
      $("#adminPassword").value = adminPassword;
      return;
    }
  } else {
    $("#adminLogin").hidden = true;
    $("#appShell").hidden = false;
    $("#publicActions").hidden = false;
  }
  renderAll();
}

bindEvents();
startApp().catch(error => {
  document.body.innerHTML = `<div class="admin-login"><div class="login-box"><h1>Unable to load app</h1><p>${escapeHtml(error.message)}</p></div></div>`;
});
