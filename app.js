const state = {
  user: null,
  page: "dashboard",
  data: { users: [], categories: [], services: [], clients: [], appointments: [], audits: [] },
  filters: { appointments: "", appointmentStatus: "all", clients: "" },
  reportTab: "overview",
};

const labels = {
  dashboard: "لوحة التحكم",
  appointments: "المواعيد",
  clients: "العملاء",
  categories: "الأقسام",
  services: "الخدمات",
  users: "المستخدمون",
  reports: "التقارير",
  audit: "سجل النشاط",
  settings: "الإعدادات",
};

const navByRole = {
  admin: ["dashboard", "appointments", "clients", "categories", "services", "users", "reports", "audit", "settings"],
  reception: ["dashboard", "appointments", "clients", "settings"],
  therapist: ["dashboard", "appointments", "clients", "settings"],
};

const statusLabel = { pending: "قيد الانتظار", done: "تم", cancelled: "ملغي" };

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "حدث خطأ");
  return data;
}

function html(strings, ...values) {
  return strings.map((part, index) => part + (values[index] ?? "")).join("");
}

function mount(markup) {
  document.getElementById("app").innerHTML = markup;
}

async function boot() {
  const me = await api("/api/me");
  if (!me.user) {
    renderLogin();
    return;
  }
  state.user = me.user;
  await loadData();
  renderApp();
}

function renderLogin(error = "") {
  mount(html`
    <main class="login">
      <form class="login-card" id="loginForm">
        <div class="brand">
          <img class="brand-logo" src="/logo.svg" alt="Clinova">
          <div>
            <h1>Clinova</h1>
            <div class="muted">نظام إدارة العيادة</div>
          </div>
        </div>
        <div class="login-note">
          <strong>Clinova</strong>
          <span>إدارة المواعيد والعملاء والخدمات والتقارير من مكان واحد آمن.</span>
        </div>
        ${error ? `<div class="alert">${error}</div>` : ""}
        <div class="field"><label>اسم المستخدم</label><input name="username" autocomplete="username" required></div>
        <div class="field"><label>كلمة المرور</label><input name="password" type="password" autocomplete="current-password" required></div>
        <button class="btn" style="width:100%">تسجيل الدخول</button>
        <p class="muted">الحساب الأول بعد التثبيت: admin / ChangeMe123!</p>
      </form>
    </main>
  `);
  document.getElementById("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await api("/api/login", { method: "POST", body: form });
      state.user = result.user;
      await loadData();
      renderApp();
    } catch (err) {
      renderLogin(err.message);
    }
  });
}

async function loadData() {
  const data = await api("/api/bootstrap");
  state.user = data.user;
  state.data = data;
}

function renderApp() {
  const nav = navByRole[state.user.role] || [];
  if (!nav.includes(state.page)) state.page = nav[0] || "dashboard";
  mount(html`
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <img class="brand-logo" src="/logo.svg" alt="Clinova">
          <div><h3>Clinova</h3><div style="opacity:.75;font-size:12px">إدارة العيادة</div></div>
        </div>
        <nav class="nav">
          ${nav.map((page) => `<button data-page="${page}" class="${state.page === page ? "active" : ""}">${labels[page]}</button>`).join("")}
        </nav>
        <div class="user-box">
          <strong>${state.user.name}</strong>
          <span style="opacity:.75">${roleLabel(state.user.role)}</span>
          <button class="btn ghost" id="logoutBtn" style="color:white;border-color:rgba(255,255,255,.35)">خروج</button>
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div>
            <h2>${labels[state.page]}</h2>
            <div class="muted page-subtitle">${pageSubtitle()}</div>
          </div>
          <div class="topbar-actions">${topAction()}</div>
        </header>
        <section class="content">${renderPage()}</section>
      </main>
    </div>
    <div id="modalRoot"></div>
  `);
  document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => {
    state.page = button.dataset.page;
    renderApp();
  }));
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    state.user = null;
    renderLogin();
  });
  bindPageActions();
}

function pageSubtitle() {
  const subtitles = {
    dashboard: "نظرة سريعة على يوم العمل والأداء",
    appointments: "تنظيم المواعيد ومنع التعارضات",
    clients: "ملفات العملاء وبيانات التواصل",
    categories: "تصنيف الخدمات داخل العيادة",
    services: "الأسعار والمدد والخدمات الفعالة",
    users: "الصلاحيات وحسابات الفريق",
    reports: "ملخصات الإيراد والإنجاز",
    audit: "آخر النشاطات داخل النظام",
    settings: "إعدادات الحساب والأمان",
  };
  return subtitles[state.page] || "";
}

function topAction() {
  if (state.page === "appointments") return `<button class="btn" data-new="appointments">موعد جديد</button>`;
  if (state.page === "clients" && state.user.role !== "therapist") return `<button class="btn" data-new="clients">عميل جديد</button>`;
  if (["users", "categories", "services"].includes(state.page)) return `<button class="btn" data-new="${state.page}">إضافة</button>`;
  return "";
}

function renderPage() {
  if (state.page === "dashboard") return renderDashboard();
  if (state.page === "appointments") return renderAppointments();
  if (state.page === "clients") return renderClients();
  if (state.page === "categories") return renderCategories();
  if (state.page === "services") return renderServices();
  if (state.page === "users") return renderUsers();
  if (state.page === "reports") return renderReports();
  if (state.page === "audit") return renderAudit();
  if (state.page === "settings") return renderSettings();
  return "";
}

function renderDashboard() {
  const { appointments, clients } = state.data;
  const today = new Date().toISOString().slice(0, 10);
  const done = appointments.filter((a) => a.status === "done");
  const revenue = done.reduce((sum, a) => sum + Number(a.price || 0), 0);
  return html`
    <div class="grid stats">
      ${stat("مواعيد اليوم", appointments.filter((a) => a.date === today).length)}
      ${stat("إجمالي العملاء", clients.length)}
      ${stat("مواعيد مكتملة", done.length)}
      ${stat("الإيرادات", `₪${revenue.toLocaleString()}`)}
    </div>
    <div class="card">
      <h3>آخر المواعيد</h3>
      ${appointmentTable(appointments.slice(0, 6), false)}
    </div>
  `;
}

function stat(label, value) {
  const meta = label.includes("اليوم") ? ["📅", "blue"]
    : label.includes("العملاء") ? ["👥", "green"]
    : label.includes("مكتملة") ? ["✅", "green"]
    : label.includes("الإيرادات") ? ["💰", "gold"]
    : ["●", "green"];
  return statCard(meta[0], value, label, meta[1]);
}

function renderAppointments() {
  const search = state.filters.appointments.trim().toLowerCase();
  const status = state.filters.appointmentStatus;
  const rows = state.data.appointments.filter((a) => {
    const text = `${a.clientName} ${a.clientPhone} ${a.serviceName} ${a.therapistName} ${a.date} ${a.time}`.toLowerCase();
    return (!search || text.includes(search)) && (status === "all" || a.status === status);
  });
  return html`
    <div class="toolbar">
      <input data-filter="appointments" placeholder="بحث في المواعيد..." value="${escapeAttr(state.filters.appointments)}">
      <select data-filter="appointmentStatus">
        <option value="all" ${status === "all" ? "selected" : ""}>كل الحالات</option>
        <option value="pending" ${status === "pending" ? "selected" : ""}>قيد الانتظار</option>
        <option value="done" ${status === "done" ? "selected" : ""}>تم</option>
        <option value="cancelled" ${status === "cancelled" ? "selected" : ""}>ملغي</option>
      </select>
      <button class="btn secondary" data-export="appointments">تصدير CSV</button>
    </div>
    <div class="card">${appointmentTable(rows, true)}</div>
  `;
}

function appointmentTable(rows, actions) {
  return html`
    <div class="table-wrap">
      <table>
        <thead><tr><th>التاريخ</th><th>الوقت</th><th>العميل</th><th>الخدمة</th><th>المعالجة</th><th>السعر</th><th>الحالة</th>${actions ? "<th></th>" : ""}</tr></thead>
        <tbody>
          ${rows.length ? rows.map((a) => html`
            <tr>
              <td>${a.date}</td><td>${a.time}</td><td>${a.clientName}</td><td>${a.serviceName}</td><td>${a.therapistName}</td>
              <td>₪${Number(a.price || 0).toLocaleString()}</td><td><span class="pill ${a.status}">${statusLabel[a.status]}</span></td>
              ${actions ? `<td class="actions"><button class="btn secondary" data-edit="appointments" data-id="${a.id}">تعديل</button>${state.user.role === "admin" ? `<button class="btn danger" data-delete="appointments" data-id="${a.id}">حذف</button>` : ""}</td>` : ""}
            </tr>`).join("") : `<tr><td colspan="${actions ? 8 : 7}" class="muted">لا توجد بيانات</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderClients() {
  const canWrite = state.user.role !== "therapist";
  const search = state.filters.clients.trim().toLowerCase();
  const clients = state.data.clients.filter((c) => `${c.fname} ${c.lname} ${c.phone} ${c.email || ""} ${c.notes || ""}`.toLowerCase().includes(search));
  return html`
    <div class="toolbar">
      <input data-filter="clients" placeholder="بحث عن عميل..." value="${escapeAttr(state.filters.clients)}">
      <button class="btn secondary" data-export="clients">تصدير CSV</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>الاسم</th><th>الهاتف</th><th>البريد</th><th>المعالجة</th><th>ملاحظات</th>${canWrite ? "<th></th>" : ""}</tr></thead>
        <tbody>
          ${clients.map((c) => html`
            <tr>
              <td>${c.fname} ${c.lname}</td><td>${c.phone}</td><td>${c.email || "-"}</td><td>${userName(c.therapistId)}</td><td>${c.notes || "-"}</td>
              ${canWrite ? `<td class="actions"><button class="btn secondary" data-edit="clients" data-id="${c.id}">تعديل</button><button class="btn danger" data-delete="clients" data-id="${c.id}">حذف</button></td>` : ""}
            </tr>`).join("") || `<tr><td colspan="${canWrite ? 6 : 5}" class="muted">لا توجد بيانات</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderAudit() {
  const actions = {
    login: "تسجيل دخول",
    create: "إضافة",
    update: "تعديل",
    delete: "حذف",
    archive: "أرشفة",
    deactivate: "تعطيل",
    change_password: "تغيير كلمة مرور",
  };
  return html`
    <div class="table-wrap">
      <table>
        <thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>النوع</th><th>الرقم</th></tr></thead>
        <tbody>
          ${(state.data.audits || []).map((row) => html`
            <tr>
              <td>${row.createdAt}</td>
              <td>${row.userName || "-"}</td>
              <td>${actions[row.action] || row.action}</td>
              <td>${row.entity}</td>
              <td>${row.entityId || "-"}</td>
            </tr>
          `).join("") || `<tr><td colspan="5" class="muted">لا توجد بيانات</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderCategories() {
  return simpleTable("categories", ["الاسم"], state.data.categories, (c) => [c.name]);
}

function renderServices() {
  return simpleTable("services", ["الاسم", "القسم", "المدة", "السعر", "فعال"], state.data.services, (s) => [s.name, categoryName(s.categoryId), `${s.duration} دقيقة`, `₪${s.price}`, s.active ? "نعم" : "لا"]);
}

function renderUsers() {
  return simpleTable("users", ["اسم المستخدم", "الاسم", "الدور", "فعال"], state.data.users, (u) => [u.username, u.name, roleLabel(u.role), u.active ? "نعم" : "لا"]);
}

function simpleTable(resource, heads, rows, mapRow) {
  return html`
    <div class="table-wrap">
      <table>
        <thead><tr>${heads.map((h) => `<th>${h}</th>`).join("")}<th></th></tr></thead>
        <tbody>
          ${rows.map((row) => `<tr>${mapRow(row).map((cell) => `<td>${cell}</td>`).join("")}<td class="actions"><button class="btn secondary" data-edit="${resource}" data-id="${row.id}">تعديل</button><button class="btn danger" data-delete="${resource}" data-id="${row.id}">حذف</button></td></tr>`).join("") || `<tr><td colspan="${heads.length + 1}" class="muted">لا توجد بيانات</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderReports() {
  const done = state.data.appointments.filter((a) => a.status === "done");
  const revenue = done.reduce((sum, a) => sum + Number(a.price || 0), 0);
  const byTherapist = groupRevenue(done, "therapistName");
  const byService = groupRevenue(done, "serviceName");
  const conflicts = findReportConflicts();
  return html`
    <div class="reports-shell">
      <div class="reports-tabs">
        ${reportTabButton("overview", "📊 نظرة عامة")}
        ${reportTabButton("revenue", "💰 الإيرادات")}
        ${reportTabButton("appointments", "📅 المواعيد")}
        ${reportTabButton("clients", "👥 العملاء")}
        ${reportTabButton("therapists", "👩‍⚕️ المعالجات")}
        ${reportTabButton("conflicts", "⚠️ التعارضات")}
      </div>
      <div class="filter-row">
        <div class="report-alert ${conflicts.length ? "warning" : "success"}">
          ${conflicts.length ? `⚠️ يوجد ${conflicts.length} تعارض يحتاج مراجعة` : "✅ لا توجد تعارضات في المواعيد الحالية"}
        </div>
        <div class="export-btns">
          <button class="btn secondary" data-export="appointments">تصدير المواعيد CSV</button>
          <button class="btn secondary" data-export="clients">تصدير العملاء CSV</button>
        </div>
      </div>
      <div class="report-content">
        ${renderReportTab(done, revenue, byTherapist, byService, conflicts)}
      </div>
    </div>
  `;
}

function reportTabButton(tab, label) {
  return `<button class="rtab ${state.reportTab === tab ? "active" : ""}" data-report-tab="${tab}">${label}</button>`;
}

function renderReportTab(done, revenue, byTherapist, byService, conflicts) {
  const appointments = state.data.appointments;
  if (state.reportTab === "revenue") {
    return html`
      <div class="grid stats">
        ${statCard("💰", `₪${revenue.toLocaleString()}`, "إجمالي الإيرادات", "gold")}
        ${statCard("📈", `₪${done.length ? Math.round(revenue / done.length).toLocaleString() : 0}`, "متوسط الموعد", "green")}
        ${statCard("🎯", done.length, "مواعيد مدفوعة/منجزة", "blue")}
        ${statCard("🧾", byService.length, "خدمات حققت إيراد", "purple")}
      </div>
      <div class="report-grid-2">
        <div class="card"><h3>الإيراد حسب الخدمة</h3>${rankList(byService)}</div>
        <div class="card"><h3>الإيراد حسب المعالجة</h3>${rankList(byTherapist)}</div>
      </div>
    `;
  }
  if (state.reportTab === "appointments") {
    return html`
      <div class="grid stats">
        ${statCard("📅", appointments.length, "إجمالي المواعيد", "blue")}
        ${statCard("✅", done.length, "مكتملة", "green")}
        ${statCard("⏳", appointments.filter((a) => a.status === "pending").length, "قيد الانتظار", "gold")}
        ${statCard("❌", appointments.filter((a) => a.status === "cancelled").length, "ملغية", "red")}
      </div>
      ${appointmentTable(appointments, false)}
    `;
  }
  if (state.reportTab === "clients") {
    const activeClientIds = new Set(appointments.map((a) => a.clientId));
    const topClients = [...activeClientIds].map((id) => {
      const rows = appointments.filter((a) => a.clientId === id && a.status === "done");
      const client = state.data.clients.find((c) => c.id === id);
      return [client ? `${client.fname} ${client.lname}` : "-", rows.reduce((sum, a) => sum + Number(a.price || 0), 0)];
    }).sort((a, b) => b[1] - a[1]);
    return html`
      <div class="grid stats">
        ${statCard("👥", state.data.clients.length, "إجمالي العملاء", "green")}
        ${statCard("⚡", activeClientIds.size, "عملاء لديهم مواعيد", "blue")}
        ${statCard("🆕", state.data.clients.filter((c) => c.email || c.phone).length, "ملفات مكتملة", "gold")}
        ${statCard("💎", topClients.length ? topClients[0][0] : "-", "أفضل عميل", "purple")}
      </div>
      <div class="card"><h3>أفضل العملاء حسب الإيراد</h3>${rankList(topClients)}</div>
    `;
  }
  if (state.reportTab === "therapists") {
    const rows = therapists().map(([id, name]) => {
      const all = appointments.filter((a) => a.therapistId === Number(id));
      const completed = all.filter((a) => a.status === "done");
      const rev = completed.reduce((sum, a) => sum + Number(a.price || 0), 0);
      return { name, all: all.length, completed: completed.length, cancelled: all.filter((a) => a.status === "cancelled").length, rev };
    });
    return html`
      <div class="table-wrap">
        <table>
          <thead><tr><th>المعالجة</th><th>كل المواعيد</th><th>مكتملة</th><th>ملغية</th><th>نسبة الإنجاز</th><th>الإيراد</th></tr></thead>
          <tbody>
            ${rows.map((r) => `<tr><td>${r.name}</td><td>${r.all}</td><td>${r.completed}</td><td>${r.cancelled}</td><td>${r.all ? Math.round(r.completed / r.all * 100) : 0}%</td><td>₪${r.rev.toLocaleString()}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">لا توجد بيانات</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }
  if (state.reportTab === "conflicts") {
    return html`
      <div class="grid stats">
        ${statCard("⚠️", conflicts.length, "إجمالي التعارضات", "red")}
        ${statCard("👩‍⚕️", conflicts.filter((c) => c.reason === "نفس المعالجة").length, "نفس المعالجة", "gold")}
        ${statCard("⏱️", conflicts.filter((c) => c.reason === "تداخل وقت").length, "تداخل وقت", "blue")}
        ${statCard("✅", conflicts.length ? "راجع" : "سليم", "حالة الجدول", "green")}
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>التاريخ</th><th>الوقت</th><th>الموعد الأول</th><th>الموعد الثاني</th><th>السبب</th></tr></thead>
          <tbody>
            ${conflicts.map((c) => `<tr><td>${c.a.date}</td><td>${c.a.time} / ${c.b.time}</td><td>${c.a.clientName} - ${c.a.serviceName}</td><td>${c.b.clientName} - ${c.b.serviceName}</td><td><span class="pill cancelled">${c.reason}</span></td></tr>`).join("") || `<tr><td colspan="5" class="muted">لا توجد تعارضات - ممتاز</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }
  return html`
    <div class="grid stats">
      ${statCard("📅", appointments.length, "إجمالي المواعيد", "blue")}
      ${statCard("✅", done.length, "مكتملة", "green")}
      ${statCard("💰", `₪${revenue.toLocaleString()}`, "إجمالي الإيرادات", "gold")}
      ${statCard("⚠️", conflicts.length, "تعارضات", conflicts.length ? "red" : "green")}
    </div>
    <div class="report-grid-2">
      <div class="card"><h3>الإيراد حسب الخدمة</h3>${rankList(byService)}</div>
      <div class="card"><h3>الإيراد حسب المعالجة</h3>${rankList(byTherapist)}</div>
    </div>
  `;
}

function statCard(icon, value, label, tone = "green") {
  return `<div class="stat-card"><div class="stat-icon ${tone}">${icon}</div><div><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div></div>`;
}

function findReportConflicts() {
  const rows = state.data.appointments.filter((a) => a.status !== "cancelled").sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const conflicts = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i];
      const b = rows[j];
      if (a.date !== b.date) break;
      const aStart = toMinutes(a.time);
      const aEnd = aStart + Number(a.duration || 0);
      const bStart = toMinutes(b.time);
      const bEnd = bStart + Number(b.duration || 0);
      const overlaps = !(aEnd <= bStart || aStart >= bEnd);
      if (overlaps && a.therapistId === b.therapistId) conflicts.push({ a, b, reason: "نفس المعالجة" });
      else if (overlaps) conflicts.push({ a, b, reason: "تداخل وقت" });
    }
  }
  return conflicts;
}

function toMinutes(time) {
  const [h, m] = String(time || "00:00").split(":").map(Number);
  return h * 60 + m;
}

function renderSettings(message = "") {
  return html`
    <div class="card" style="max-width:560px">
      <h3>تغيير كلمة المرور</h3>
      <p class="muted">بعد الحفظ سيتم تسجيل خروجك لتدخل بكلمة المرور الجديدة.</p>
      ${message ? `<div class="alert">${message}</div>` : ""}
      <form id="passwordForm">
        <div class="field"><label>كلمة المرور الحالية</label><input name="currentPassword" type="password" required></div>
        <div class="field"><label>كلمة المرور الجديدة</label><input name="newPassword" type="password" minlength="8" required></div>
        <button class="btn">تغيير كلمة المرور</button>
      </form>
    </div>
  `;
}

function groupRevenue(rows, key) {
  const result = new Map();
  for (const row of rows) result.set(row[key], (result.get(row[key]) || 0) + Number(row.price || 0));
  return [...result.entries()].sort((a, b) => b[1] - a[1]);
}

function rankList(rows) {
  if (!rows.length) return `<p class="muted">لا توجد بيانات</p>`;
  return rows.map(([name, value]) => `<div class="rank-row"><span>${name}</span><strong>₪${value.toLocaleString()}</strong></div>`).join("");
}

function bindPageActions() {
  document.querySelectorAll("[data-new]").forEach((button) => button.addEventListener("click", () => openForm(button.dataset.new)));
  document.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => openForm(button.dataset.edit, Number(button.dataset.id))));
  document.querySelectorAll("[data-filter]").forEach((input) => input.addEventListener("input", () => {
    state.filters[input.dataset.filter] = input.value;
    renderApp();
  }));
  document.querySelectorAll("[data-export]").forEach((button) => button.addEventListener("click", () => exportCsv(button.dataset.export)));
  document.querySelectorAll("[data-report-tab]").forEach((button) => button.addEventListener("click", () => {
    state.reportTab = button.dataset.reportTab;
    renderApp();
  }));
  const passwordForm = document.getElementById("passwordForm");
  if (passwordForm) passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/api/account/password", { method: "POST", body: Object.fromEntries(new FormData(passwordForm)) });
      state.user = null;
      renderLogin("تم تغيير كلمة المرور. سجل الدخول من جديد.");
    } catch (err) {
      document.querySelector(".content").innerHTML = renderSettings(err.message);
      bindPageActions();
    }
  });
  document.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirm("هل أنت متأكد من الحذف؟")) return;
    await api(`/api/${button.dataset.delete}/${button.dataset.id}`, { method: "DELETE" });
    await loadData();
    renderApp();
  }));
}

function exportCsv(resource) {
  const rows = resource === "clients"
    ? state.data.clients.map((c) => ({
      name: `${c.fname} ${c.lname}`,
      phone: c.phone,
      email: c.email || "",
      therapist: userName(c.therapistId),
      notes: c.notes || "",
    }))
    : state.data.appointments.map((a) => ({
      date: a.date,
      time: a.time,
      client: a.clientName,
      phone: a.clientPhone,
      service: a.serviceName,
      therapist: a.therapistName,
      status: statusLabel[a.status],
      price: a.price,
    }));
  const csv = toCsv(rows);
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${resource}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [headers.join(","), ...rows.map((row) => headers.map((key) => escape(row[key])).join(","))].join("\n");
}

function escapeAttr(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function openForm(resource, id = null) {
  const row = id ? state.data[resource].find((item) => item.id === id) : {};
  const title = id ? "تعديل" : "إضافة";
  document.getElementById("modalRoot").innerHTML = html`
    <div class="modal">
      <form class="modal-card" id="entityForm">
        <div class="modal-head"><h3>${title} ${labels[resource] || ""}</h3><button type="button" class="btn ghost" id="closeModal">إغلاق</button></div>
        <div class="modal-body">${formFields(resource, row || {})}</div>
        <div class="modal-foot"><button class="btn">حفظ</button><div id="formError" class="muted"></div></div>
      </form>
    </div>
  `;
  document.getElementById("closeModal").addEventListener("click", closeModal);
  document.getElementById("entityForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const body = formPayload(resource, Object.fromEntries(new FormData(event.currentTarget)));
      await api(`/api/${resource}${id ? `/${id}` : ""}`, { method: id ? "PUT" : "POST", body });
      closeModal();
      await loadData();
      renderApp();
    } catch (err) {
      document.getElementById("formError").textContent = err.message;
    }
  });
}

function closeModal() {
  document.getElementById("modalRoot").innerHTML = "";
}

function formFields(resource, row) {
  if (resource === "clients") return html`
    ${field("fname", "الاسم الأول", row.fname)}
    ${field("lname", "اسم العائلة", row.lname)}
    ${field("phone", "الهاتف", row.phone)}
    ${field("email", "البريد", row.email, "email", false)}
    ${select("therapistId", "المعالجة", therapists(), row.therapistId, false)}
    ${field("notes", "ملاحظات", row.notes, "textarea", false, "full")}
  `;
  if (resource === "appointments") return html`
    ${select("clientId", "العميل", state.data.clients.map((c) => [c.id, `${c.fname} ${c.lname}`]), row.clientId)}
    ${select("serviceId", "الخدمة", state.data.services.filter((s) => s.active).map((s) => [s.id, s.name]), row.serviceId)}
    ${select("therapistId", "المعالجة", therapists(), row.therapistId || state.user.id, state.user.role !== "therapist")}
    ${field("date", "التاريخ", row.date || new Date().toISOString().slice(0, 10), "date")}
    ${field("time", "الوقت", row.time || "09:00", "time")}
    ${select("status", "الحالة", [["pending", "قيد الانتظار"], ["done", "تم"], ["cancelled", "ملغي"]], row.status || "pending")}
    ${field("notes", "ملاحظات", row.notes, "textarea", false, "full")}
  `;
  if (resource === "categories") return field("name", "اسم القسم", row.name);
  if (resource === "services") return html`
    ${field("name", "اسم الخدمة", row.name)}
    ${select("categoryId", "القسم", state.data.categories.map((c) => [c.id, c.name]), row.categoryId)}
    ${field("duration", "المدة بالدقائق", row.duration || 60, "number")}
    ${field("price", "السعر", row.price || 0, "number")}
    ${select("active", "فعال", [["true", "نعم"], ["false", "لا"]], String(row.active !== false))}
  `;
  if (resource === "users") return html`
    ${field("username", "اسم المستخدم", row.username)}
    ${field("password", row.id ? "كلمة مرور جديدة اختياري" : "كلمة المرور", "", "password", !row.id)}
    ${field("name", "الاسم", row.name)}
    ${field("title", "الوصف الوظيفي", row.title, "text", false)}
    ${select("role", "الدور", [["admin", "مدير"], ["reception", "استقبال"], ["therapist", "معالجة"]], row.role || "therapist")}
    ${select("active", "فعال", [["true", "نعم"], ["false", "لا"]], String(row.active !== false))}
  `;
  return "";
}

function field(name, label, value = "", type = "text", required = true, className = "") {
  if (type === "textarea") return `<div class="field ${className}"><label>${label}</label><textarea name="${name}" ${required ? "required" : ""}>${value || ""}</textarea></div>`;
  return `<div class="field ${className}"><label>${label}</label><input name="${name}" type="${type}" value="${value ?? ""}" ${required ? "required" : ""}></div>`;
}

function select(name, label, options, value = "", required = true) {
  return `<div class="field"><label>${label}</label><select name="${name}" ${required ? "required" : ""}>${required ? "" : `<option value="">-</option>`}${options.map(([id, text]) => `<option value="${id}" ${String(id) === String(value) ? "selected" : ""}>${text}</option>`).join("")}</select></div>`;
}

function formPayload(resource, form) {
  if (resource === "clients") return { ...form, therapistId: numberOrNull(form.therapistId) };
  if (resource === "appointments") return { ...form, clientId: Number(form.clientId), serviceId: Number(form.serviceId), therapistId: Number(form.therapistId) };
  if (resource === "services") return { ...form, categoryId: Number(form.categoryId), duration: Number(form.duration), price: Number(form.price), active: form.active === "true" };
  if (resource === "users") return { ...form, active: form.active === "true", workdays: [], serviceIds: [] };
  return form;
}

function numberOrNull(value) {
  return value ? Number(value) : null;
}

function therapists() {
  return state.data.users.filter((u) => u.role === "therapist" && u.active).map((u) => [u.id, u.name]);
}

function userName(id) {
  return state.data.users.find((u) => u.id === id)?.name || "-";
}

function categoryName(id) {
  return state.data.categories.find((c) => c.id === id)?.name || "-";
}

function roleLabel(role) {
  return { admin: "مدير", reception: "استقبال", therapist: "معالجة" }[role] || role;
}

boot().catch((err) => renderLogin(err.message));
