const state = {
  user: null,
  page: "dashboard",
  data: { users: [], categories: [], services: [], clients: [], appointments: [], audits: [], settings: {} },
  filters: { appointments: "", appointmentStatus: "all", clients: "" },
  calendarView: "week",
  calendarDate: new Date().toISOString().slice(0, 10),
  quickSearch: "",
  quickResults: null,
  lang: localStorage.getItem("cms-suzan-lang") || "he",
  reportTab: "overview",
};

const APP_VERSION = "1.3.0";

const labels = {
  calendar: "التقويم",
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
  admin: ["dashboard", "calendar", "appointments", "clients", "categories", "services", "users", "reports", "audit", "settings"],
  reception: ["dashboard", "calendar", "appointments", "clients", "settings"],
  therapist: ["dashboard", "calendar", "appointments", "clients", "settings"],
};

const i18n = {
  ar: {
    clinicSystem: "إدارة العيادة",
    quickSearch: "بحث سريع...",
    language: "اللغة",
    logout: "خروج",
    add: "إضافة",
    edit: "تعديل",
    delete: "حذف",
    close: "إغلاق",
    save: "حفظ",
    receipt: "إيصال",
    newAppointment: "موعد جديد",
    newClient: "عميل جديد",
    noData: "لا توجد بيانات",
    searching: "جاري البحث...",
    noResults: "لا توجد نتائج",
    labels: {
      dashboard: "لوحة التحكم",
      calendar: "التقويم",
      appointments: "المواعيد",
      clients: "العملاء",
      categories: "الأقسام",
      services: "الخدمات",
      users: "المستخدمون",
      reports: "التقارير",
      audit: "سجل النشاط",
      settings: "الإعدادات",
    },
    subtitles: {
      dashboard: "نظرة سريعة على يوم العمل والأداء",
      calendar: "عرض المواعيد حسب الشهر أو الأسبوع أو اليوم",
      appointments: "تنظيم المواعيد ومنع التعارضات",
      clients: "ملفات العملاء وبيانات التواصل",
      categories: "تصنيف الخدمات داخل العيادة",
      services: "الأسعار والمدد والخدمات الفعالة",
      users: "الصلاحيات وحسابات الفريق",
      reports: "ملخصات الإيراد والإنجاز",
      audit: "آخر النشاطات داخل النظام",
      settings: "إعدادات الحساب والعيادة",
    },
    roles: { admin: "مدير", reception: "استقبال", therapist: "معالجة" },
    status: { pending: "قيد الانتظار", done: "تم", cancelled: "ملغي" },
    payment: { unpaid: "غير مدفوع", paid: "مدفوع", deposit: "عربون" },
    searchGroups: { clients: "العملاء", appointments: "المواعيد", services: "الخدمات", file: "ملف", appointment: "موعد" },
    table: { date: "التاريخ", time: "الوقت", client: "العميل", service: "الخدمة", therapist: "المعالجة", price: "السعر", payment: "الدفع", status: "الحالة" },
  },
  he: {
    clinicSystem: "ניהול קליניקה",
    quickSearch: "חיפוש מהיר...",
    language: "שפה",
    logout: "יציאה",
    add: "הוספה",
    edit: "עריכה",
    delete: "מחיקה",
    close: "סגירה",
    save: "שמירה",
    receipt: "קבלה",
    newAppointment: "תור חדש",
    newClient: "לקוח חדש",
    noData: "אין נתונים",
    searching: "מחפש...",
    noResults: "לא נמצאו תוצאות",
    labels: {
      dashboard: "לוח בקרה",
      calendar: "יומן",
      appointments: "תורים",
      clients: "לקוחות",
      categories: "קטגוריות",
      services: "שירותים",
      users: "משתמשים",
      reports: "דוחות",
      audit: "יומן פעילות",
      settings: "הגדרות",
    },
    subtitles: {
      dashboard: "מבט מהיר על יום העבודה והביצועים",
      calendar: "תצוגת תורים לפי חודש, שבוע או יום",
      appointments: "ניהול תורים ומניעת התנגשויות",
      clients: "תיקי לקוחות ופרטי קשר",
      categories: "סיווג השירותים בקליניקה",
      services: "מחירים, משכים ושירותים פעילים",
      users: "הרשאות וחשבונות צוות",
      reports: "סיכומי הכנסות וביצועים",
      audit: "פעילות אחרונה במערכת",
      settings: "הגדרות חשבון וקליניקה",
    },
    roles: { admin: "מנהל", reception: "קבלה", therapist: "מטפלת" },
    status: { pending: "ממתין", done: "בוצע", cancelled: "בוטל" },
    payment: { unpaid: "לא שולם", paid: "שולם", deposit: "מקדמה" },
    searchGroups: { clients: "לקוחות", appointments: "תורים", services: "שירותים", file: "תיק", appointment: "תור" },
    table: { date: "תאריך", time: "שעה", client: "לקוח", service: "שירות", therapist: "מטפלת", price: "מחיר", payment: "תשלום", status: "סטטוס" },
  },
};

function tr(key) {
  return key.split(".").reduce((obj, part) => obj?.[part], i18n[state.lang]) ?? key;
}

function pageLabel(page) {
  return tr(`labels.${page}`);
}

const statusLabel = new Proxy({}, { get: (_, key) => tr(`status.${String(key)}`) });
const paymentLabel = new Proxy({}, { get: (_, key) => tr(`payment.${String(key)}`) });

async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(path, {
    credentials: "include",
    headers: isFormData ? (options.headers || {}) : { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
    body: options.body ? (isFormData ? options.body : JSON.stringify(options.body)) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "حدث خطأ");
    error.code = data.error || "";
    error.details = data.details || {};
    throw error;
  }
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

function renderLoginLegacy(error = "") {
  mount(html`
    <main class="login">
      <form class="login-card" id="loginForm">
        <div class="brand">
          <img class="brand-logo" src="${logoSrc()}" alt="CMS SUZAN">
          <div>
            <h1>CMS SUZAN</h1>
            <div class="muted">نظام إدارة العيادة</div>
          </div>
        </div>
        ${error ? `<div class="alert">${error}</div>` : ""}
        <div class="field"><label>اسم المستخدم</label><input name="username" autocomplete="username" required></div>
        <div class="field"><label>كلمة المرور</label><input name="password" type="password" autocomplete="current-password" required></div>
        <button class="btn" style="width:100%">تسجيل الدخول</button>
        <div class="version-badge">v${APP_VERSION}</div>
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

function renderAppLegacy() {
  const nav = navByRole[state.user.role] || [];
  if (!nav.includes(state.page)) state.page = nav[0] || "dashboard";
  document.documentElement.lang = state.lang;
  document.documentElement.dir = "rtl";
  mount(html`
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <img class="brand-logo" src="${logoSrc()}" alt="CMS SUZAN">
          <div><h3>CMS SUZAN</h3><div style="opacity:.75;font-size:12px">إدارة العيادة</div></div>
        </div>
        <nav class="nav">
          ${nav.map((page) => `<button data-page="${page}" class="${state.page === page ? "active" : ""}">${pageLabel(page)}</button>`).join("")}
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
            <h2>${pageLabel(state.page)}</h2>
            <div class="muted page-subtitle">${pageSubtitle()}</div>
          </div>
          <div class="topbar-actions">
            ${languagePicker()}
            ${renderQuickSearchLive()}
            ${topActionI18n()}
          </div>
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
  return tr(`subtitles.${state.page}`);
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

function topActionI18n() {
  if (state.page === "appointments") return `<button class="btn" data-new="appointments">${tr("newAppointment")}</button>`;
  if (state.page === "clients" && state.user.role !== "therapist") return `<button class="btn" data-new="clients">${tr("newClient")}</button>`;
  if (["users", "categories", "services"].includes(state.page)) return `<button class="btn" data-new="${state.page}">${tr("add")}</button>`;
  return "";
}

function languagePicker() {
  return `<label class="language-picker"><span>${tr("language")}</span><select id="languageSelect"><option value="ar" ${state.lang === "ar" ? "selected" : ""}>العربية</option><option value="he" ${state.lang === "he" ? "selected" : ""}>עברית</option></select></label>`;
}

function renderQuickSearch() {
  const results = state.quickResults;
  return html`
    <div class="quick-search">
      <input id="quickSearch" value="${escapeAttr(state.quickSearch)}" placeholder="بحث سريع..." autocomplete="off">
      ${results && (results.clients.length || results.appointments.length) ? `
        <div class="quick-results">
          ${results.clients.map((c) => `<button data-profile="${c.id}"><strong>${c.name}</strong><span>${c.phone || ""}</span></button>`).join("")}
          ${results.appointments.map((a) => `<button data-open-appointment="${a.id}"><strong>${a.clientName}</strong><span>${a.date} ${a.time} - ${a.serviceName}</span></button>`).join("")}
        </div>` : ""}
    </div>
  `;
}

function renderQuickSearchLiveLegacy() {
  return html`
    <div class="quick-search">
      <input id="quickSearch" value="${escapeAttr(state.quickSearch)}" placeholder="بحث سريع..." autocomplete="off">
      <div id="quickResults" class="quick-results hidden"></div>
    </div>
  `;
}

function quickResultsMarkup(results) {
  if (!results || (!results.clients.length && !results.appointments.length && !(results.services || []).length)) return `<div class="quick-empty">${tr("noResults")}</div>`;
  return html`
    ${results.clients.length ? `<div class="quick-group"><div class="quick-title">${tr("searchGroups.clients")}</div>${results.clients.map((c) => `
      <div class="quick-item">
        <button data-profile="${c.id}"><strong>${c.name}</strong><span>${c.phone || ""}${c.therapistName ? ` - ${c.therapistName}` : ""}</span></button>
        <button class="quick-action" data-new-client-appointment="${c.id}">${tr("searchGroups.appointment")}</button>
      </div>`).join("")}</div>` : ""}
    ${results.appointments.length ? `<div class="quick-group"><div class="quick-title">${tr("searchGroups.appointments")}</div>${results.appointments.map((a) => `
      <div class="quick-item">
        <button data-open-appointment="${a.id}"><strong>${a.clientName}</strong><span>${a.date} ${a.time} - ${a.serviceName} - ${paymentLabel[a.paymentStatus || "unpaid"]}</span></button>
        <button class="quick-action" data-profile="${a.clientId}">${tr("searchGroups.file")}</button>
      </div>`).join("")}</div>` : ""}
    ${(results.services || []).length ? `<div class="quick-group"><div class="quick-title">${tr("searchGroups.services")}</div>${results.services.map((s) => `
      <div class="quick-item">
        <button data-service-filter="${s.name}"><strong>${s.name}</strong><span>${s.categoryName} - ${s.duration} دقيقة - ${currency()}${Number(s.price || 0).toLocaleString()}</span></button>
      </div>`).join("")}</div>` : ""}
  `;
}

function bindQuickResultActions(root) {
  root.querySelectorAll("[data-profile]").forEach((button) => button.addEventListener("click", () => {
    state.quickResults = null;
    openClientProfile(Number(button.dataset.profile));
  }));
  root.querySelectorAll("[data-open-appointment]").forEach((button) => button.addEventListener("click", () => {
    state.quickResults = null;
    openForm("appointments", Number(button.dataset.openAppointment));
  }));
  root.querySelectorAll("[data-new-client-appointment]").forEach((button) => button.addEventListener("click", () => {
    state.quickResults = null;
    openForm("appointments", null, { clientId: Number(button.dataset.newClientAppointment) });
  }));
  root.querySelectorAll("[data-service-filter]").forEach((button) => button.addEventListener("click", () => {
    state.quickResults = null;
    state.page = "services";
    renderApp();
  }));
}

function positionQuickResults() {
  const input = document.getElementById("quickSearch");
  const box = document.getElementById("quickResults");
  if (!input || !box || box.classList.contains("hidden")) return;
  const rect = input.getBoundingClientRect();
  const margin = window.innerWidth <= 600 ? 16 : 12;
  const width = Math.min(420, window.innerWidth - margin * 2);
  const preferredLeft = rect.right - width;
  const left = Math.min(Math.max(margin, preferredLeft), window.innerWidth - width - margin);
  const top = Math.min(rect.bottom + 8, window.innerHeight - Math.min(520, window.innerHeight - 88) - margin);
  box.style.width = `${width}px`;
  box.style.maxWidth = `${width}px`;
  box.style.left = `${left}px`;
  box.style.right = "auto";
  box.style.top = `${Math.max(margin, top)}px`;
}

function renderPage() {
  if (state.page === "dashboard") return renderDashboardHe();
  if (state.page === "calendar") return renderCalendarHe();
  if (state.page === "appointments") return renderAppointmentsHe();
  if (state.page === "clients") return renderClientsHe();
  if (state.page === "categories") return renderCategoriesHe();
  if (state.page === "services") return renderServicesHe();
  if (state.page === "users") return renderUsersHe();
  if (state.page === "reports") return renderReports();
  if (state.page === "audit") return renderAudit();
  if (state.page === "settings") return renderSettingsHe();
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

function renderCalendar() {
  const anchor = parseDate(state.calendarDate);
  const view = state.calendarView;
  const days = view === "day" ? [anchor] : view === "week" ? weekDays(anchor) : monthDays(anchor);
  return html`
    <div class="calendar-shell">
      <div class="toolbar calendar-toolbar">
        <div class="segmented">
          ${["month", "week", "day"].map((item) => `<button class="${view === item ? "active" : ""}" data-calendar-view="${item}">${item === "month" ? "شهر" : item === "week" ? "أسبوع" : "يوم"}</button>`).join("")}
        </div>
        <div class="calendar-nav">
          <button class="btn secondary" data-calendar-move="-1">السابق</button>
          <button class="btn secondary" data-calendar-today>اليوم</button>
          <button class="btn secondary" data-calendar-move="1">التالي</button>
        </div>
        <strong>${calendarTitle(anchor, view)}</strong>
      </div>
      <div class="calendar-grid ${view}">
        ${days.map((day) => calendarDay(day, view)).join("")}
      </div>
    </div>
  `;
}

function calendarDayLegacy(day, view) {
  const date = toDateInput(day);
  const rows = state.data.appointments.filter((a) => a.date === date).sort((a, b) => a.time.localeCompare(b.time));
  return html`
    <section class="calendar-day ${date === new Date().toISOString().slice(0, 10) ? "today" : ""}">
      <header><strong>${day.getDate()}</strong><span>${date}</span></header>
      <div class="calendar-events">
        ${rows.map((a) => `<button data-open-appointment="${a.id}" class="calendar-event ${a.status}"><span>${a.time}</span><strong>${a.clientName}</strong><em>${a.serviceName}</em></button>`).join("") || `<div class="calendar-empty">${view === "month" ? "" : "لا توجد مواعيد"}</div>`}
      </div>
    </section>
  `;
}

function calendarTitle(date, view) {
  if (view === "day") return toDateInput(date);
  if (view === "week") {
    const days = weekDays(date);
    return `${toDateInput(days[0])} - ${toDateInput(days[6])}`;
  }
  return `${date.getFullYear()} / ${date.getMonth() + 1}`;
}

function parseDate(value) {
  const [y, m, d] = String(value).split("-").map(Number);
  return new Date(y || new Date().getFullYear(), (m || 1) - 1, d || 1);
}

function toDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function weekDays(date) {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}

function monthDays(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = new Date(first);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
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

function renderSettingsEnhanced(message = "") {
  const settings = state.data.settings || {};
  return html`
    <div class="settings-grid">
      ${state.user.role === "admin" ? `
      <div class="card">
        <h3>إعدادات العيادة</h3>
        <form id="clinicSettingsForm">
          ${field("clinicName", "اسم العيادة", settings.clinicName || "CMS SUZAN")}
          ${field("logoUrl", "رابط الشعار", settings.logoUrl || "/logo.svg", "text", false)}
          ${field("currency", "العملة", settings.currency || "₪")}
          ${field("workStart", "بداية الدوام", settings.workStart || "09:00", "time")}
          ${field("workEnd", "نهاية الدوام", settings.workEnd || "18:00", "time")}
          ${field("workDays", "أيام العمل", settings.workDays || "[0,1,2,3,4,5]", "text", false)}
          ${field("whatsappTemplate", "رسالة WhatsApp", settings.whatsappTemplate || "", "textarea", false, "full")}
          <button class="btn">حفظ الإعدادات</button>
        </form>
      </div>` : ""}
      <div class="card">
        <h3>تغيير كلمة المرور</h3>
        <p class="muted">بعد الحفظ سيتم تسجيل خروجك لتدخل بكلمة المرور الجديدة.</p>
        ${message ? `<div class="alert">${message}</div>` : ""}
        <form id="passwordForm">
          <div class="field"><label>كلمة المرور الحالية</label><input name="currentPassword" type="password" required></div>
          <div class="field"><label>كلمة المرور الجديدة</label><input name="newPassword" type="password" minlength="8" required></div>
          <button class="btn">تغيير كلمة المرور</button>
        </form>
      </div>
    </div>
  `;
}

function renderClientsEnhanced() {
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
        <thead><tr><th>الاسم</th><th>الهاتف</th><th>البريد</th><th>المعالجة</th><th>ملاحظات</th><th></th></tr></thead>
        <tbody>
          ${clients.map((c) => html`
            <tr>
              <td>${c.fname} ${c.lname}</td><td>${c.phone}</td><td>${c.email || "-"}</td><td>${userName(c.therapistId)}</td><td>${c.notes || "-"}</td>
              <td class="actions"><button class="btn secondary" data-profile="${c.id}">ملف</button>${canWrite ? `<button class="btn secondary" data-edit="clients" data-id="${c.id}">تعديل</button><button class="btn danger" data-delete="clients" data-id="${c.id}">حذف</button>` : ""}</td>
            </tr>`).join("") || `<tr><td colspan="6" class="muted">لا توجد بيانات</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function appointmentTableLegacy(rows, actions) {
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

function renderAuditLegacy() {
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

function simpleTableLegacyFinal(resource, heads, rows, mapRow) {
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

function renderReportsLegacy() {
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

function reportTabButtonLegacy(tab, label) {
  return `<button class="rtab ${state.reportTab === tab ? "active" : ""}" data-report-tab="${tab}">${label}</button>`;
}

function renderReportTabLegacy(done, revenue, byTherapist, byService, conflicts) {
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

function findReportConflictsLegacy() {
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

function rankListLegacy(rows) {
  if (!rows.length) return `<p class="muted">لا توجد بيانات</p>`;
  return rows.map(([name, value]) => `<div class="rank-row"><span>${name}</span><strong>₪${value.toLocaleString()}</strong></div>`).join("");
}

function appointmentTableLegacyI18n(rows, actions) {
  return html`
    <div class="table-wrap">
      <table>
        <thead><tr><th>التاريخ</th><th>الوقت</th><th>العميل</th><th>الخدمة</th><th>المعالجة</th><th>السعر</th><th>الدفع</th><th>الحالة</th>${actions ? "<th></th>" : ""}</tr></thead>
        <tbody>
          ${rows.length ? rows.map((a) => html`
            <tr>
              <td>${a.date}</td><td>${a.time}</td><td>${a.clientName}</td><td>${a.serviceName}</td><td>${a.therapistName}</td>
              <td>${currency()}${Number(a.price || 0).toLocaleString()}</td>
              <td><span class="pill ${a.paymentStatus || "unpaid"}">${paymentLabel[a.paymentStatus || "unpaid"]}</span></td>
              <td><span class="pill ${a.status}">${statusLabel[a.status]}</span></td>
              ${actions ? `<td class="actions"><button class="btn secondary" data-receipt="${a.id}">إيصال</button><button class="btn secondary" data-whatsapp="${a.id}">WhatsApp</button><button class="btn secondary" data-edit="appointments" data-id="${a.id}">تعديل</button>${state.user.role === "admin" ? `<button class="btn danger" data-delete="appointments" data-id="${a.id}">حذف</button>` : ""}</td>` : ""}
            </tr>`).join("") : `<tr><td colspan="${actions ? 9 : 8}" class="muted">لا توجد بيانات</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderSettingsProduct(message = "") {
  const settings = state.data.settings || {};
  return html`
    <div class="settings-grid">
      ${state.user.role === "admin" ? `
      <div class="card">
        <h3>إعدادات العيادة</h3>
        <form id="clinicSettingsForm">
          ${field("clinicName", "اسم العيادة", settings.clinicName || "CMS SUZAN")}
          <div class="field">
            <label>لوغو النظام</label>
            <div class="logo-upload">
              <img id="logoPreview" src="${logoSrc()}" alt="CMS SUZAN">
              <input name="logoFile" id="logoFile" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp">
              <input name="logoUrl" id="logoUrlInput" type="hidden" value="${escapeAttr(settings.logoUrl || "/logo.svg")}">
            </div>
          </div>
          ${field("currency", "العملة", settings.currency || "₪")}
          ${field("workStart", "بداية الدوام", settings.workStart || "09:00", "time")}
          ${field("workEnd", "نهاية الدوام", settings.workEnd || "18:00", "time")}
          <div class="field full"><label>أيام العمل</label>${workDaysPicker(settings.workDays)}</div>
          ${field("whatsappTemplate", "رسالة WhatsApp", settings.whatsappTemplate || "", "textarea", false, "full")}
          <button class="btn">حفظ الإعدادات</button>
        </form>
        <div class="backup-panel">
          <h3>نسخة خارجية من النظام</h3>
          <p class="muted">تحميل نسخة قاعدة البيانات على جهاز الكمبيوتر للاحتفاظ بها خارج السيرفر.</p>
          <a class="btn secondary" href="/api/system/export" download>تحميل النسخة الخارجية</a>
        </div>
      </div>` : ""}
      <div class="card">
        <h3>تغيير كلمة المرور</h3>
        <p class="muted">بعد الحفظ سيتم تسجيل خروجك لتدخل بكلمة المرور الجديدة.</p>
        ${message ? `<div class="alert">${message}</div>` : ""}
        <form id="passwordForm">
          <div class="field"><label>كلمة المرور الحالية</label><input name="currentPassword" type="password" required></div>
          <div class="field"><label>كلمة المرور الجديدة</label><input name="newPassword" type="password" minlength="8" required></div>
          <button class="btn">تغيير كلمة المرور</button>
        </form>
      </div>
    </div>
  `;
}

function bindPageActions() {
  const languageSelect = document.getElementById("languageSelect");
  if (languageSelect) languageSelect.addEventListener("change", () => {
    state.lang = languageSelect.value;
    localStorage.setItem("cms-suzan-lang", state.lang);
    renderApp();
  });
  const quickSearch = document.getElementById("quickSearch");
  if (quickSearch) quickSearch.addEventListener("input", debounce(async () => {
    state.quickSearch = quickSearch.value;
    const box = document.getElementById("quickResults");
    if (!box) return;
    if (state.quickSearch.trim().length < 2) {
      state.quickResults = null;
      box.innerHTML = "";
      box.classList.add("hidden");
      return;
    }
    box.innerHTML = `<div class="quick-empty">${tr("searching")}</div>`;
    box.classList.remove("hidden");
    positionQuickResults();
    state.quickResults = await api(`/api/search?q=${encodeURIComponent(state.quickSearch.trim())}`);
    box.innerHTML = quickResultsMarkup(state.quickResults);
    box.classList.toggle("hidden", !box.innerHTML.trim());
    positionQuickResults();
    bindQuickResultActions(box);
  }, 250));
  if (quickSearch) quickSearch.addEventListener("focus", positionQuickResults);
  window.addEventListener("resize", positionQuickResults, { once: true });
  window.addEventListener("scroll", positionQuickResults, { once: true, passive: true });
  bindQuickResultActions(document);
  document.querySelectorAll("[data-calendar-view]").forEach((button) => button.addEventListener("click", () => {
    state.calendarView = button.dataset.calendarView;
    renderApp();
  }));
  document.querySelectorAll("[data-calendar-move]").forEach((button) => button.addEventListener("click", () => {
    const date = parseDate(state.calendarDate);
    const step = Number(button.dataset.calendarMove);
    if (state.calendarView === "month") date.setMonth(date.getMonth() + step);
    if (state.calendarView === "week") date.setDate(date.getDate() + step * 7);
    if (state.calendarView === "day") date.setDate(date.getDate() + step);
    state.calendarDate = toDateInput(date);
    renderApp();
  }));
  document.querySelectorAll("[data-calendar-today]").forEach((button) => button.addEventListener("click", () => {
    state.calendarDate = new Date().toISOString().slice(0, 10);
    renderApp();
  }));
  document.querySelectorAll("[data-receipt]").forEach((button) => button.addEventListener("click", () => printReceipt(Number(button.dataset.receipt))));
  document.querySelectorAll("[data-whatsapp]").forEach((button) => button.addEventListener("click", () => sendReminder(Number(button.dataset.whatsapp), "whatsapp")));
  const logoFile = document.getElementById("logoFile");
  if (logoFile) logoFile.addEventListener("change", () => readLogoFile(logoFile));
  const clinicSettingsForm = document.getElementById("clinicSettingsForm");
  if (clinicSettingsForm) clinicSettingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(clinicSettingsForm));
    form.workDays = JSON.stringify([...clinicSettingsForm.querySelectorAll("[name='workDay']:checked")].map((input) => Number(input.value)));
    delete form.logoFile;
    delete form.workDay;
    const result = await api("/api/settings", { method: "PUT", body: form });
    state.data.settings = result.settings;
    renderApp();
  });
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
      renderLogin();
    } catch (err) {
      document.querySelector(".content").innerHTML = renderSettingsProduct(err.message);
      bindPageActions();
    }
  });
  document.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirm("האם אתה בטוח שברצונך למחוק?")) return;
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

function openFormLegacy(resource, id = null, defaults = {}) {
  const row = id ? state.data[resource].find((item) => item.id === id) : defaults;
  const title = id ? "تعديل" : "إضافة";
  document.getElementById("modalRoot").innerHTML = html`
    <div class="modal">
      <form class="modal-card" id="entityForm">
        <div class="modal-head"><h3>${title} ${labels[resource] || ""}</h3><button type="button" class="btn ghost" id="closeModal">إغلاق</button></div>
        <div class="modal-body">${formFieldsHe(resource, row || {})}</div>
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

function showCenterError(message) {
  const existing = document.querySelector(".center-error-overlay");
  if (existing) existing.remove();
  const overlay = document.createElement("div");
  overlay.className = "center-error-overlay";
  overlay.innerHTML = `<div class="center-error-card"><strong>${message}</strong><button class="btn" type="button">סגירה</button></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("button").addEventListener("click", () => overlay.remove());
  window.setTimeout(() => overlay.remove(), 7000);
}

function localizedError(err) {
  if (err.code === "appointment_category_conflict") {
    const details = err.details || {};
    if (state.lang === "he") {
      return `לא ניתן לקבוע תור באותה קטגוריה בשעה זו. קיים כבר תור ${details.serviceName || ""} עם ${details.clientName || ""} בשעה ${details.time || ""}`;
    }
    return `لا يمكن حجز موعد في نفس القسم بهذا الوقت. يوجد موعد ${details.serviceName || ""} مع ${details.clientName || ""} الساعة ${details.time || ""}`;
  }
  return err.message;
}

function formFieldsLegacy(resource, row) {
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

function formPayloadLegacy(resource, form) {
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

function roleLabelLegacy(role) {
  return { admin: "مدير", reception: "استقبال", therapist: "معالجة" }[role] || role;
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
    ${select("paymentStatus", "حالة الدفع", [["unpaid", "غير مدفوع"], ["paid", "مدفوع"], ["deposit", "عربون"]], row.paymentStatus || "unpaid")}
    ${field("paidAmount", "المبلغ المدفوع", row.paidAmount || 0, "number", false)}
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
    ${field("password", row.id ? "كلمة مرور جديدة اختيارية" : "كلمة المرور", "", "password", !row.id)}
    ${field("name", "الاسم", row.name)}
    ${field("title", "الوصف الوظيفي", row.title, "text", false)}
    ${select("role", "الدور", [["admin", "مدير"], ["reception", "استقبال"], ["therapist", "معالجة"]], row.role || "therapist")}
    ${select("active", "فعال", [["true", "نعم"], ["false", "لا"]], String(row.active !== false))}
  `;
  return "";
}

function formPayload(resource, form) {
  if (resource === "clients") return { ...form, therapistId: numberOrNull(form.therapistId) };
  if (resource === "appointments") return { ...form, clientId: Number(form.clientId), serviceId: Number(form.serviceId), therapistId: Number(form.therapistId), paidAmount: Number(form.paidAmount || 0) };
  if (resource === "services") return { ...form, categoryId: Number(form.categoryId), duration: Number(form.duration), price: Number(form.price), active: form.active === "true" };
  if (resource === "users") return { ...form, active: form.active === "true", workdays: [], serviceIds: [] };
  return form;
}

function currency() {
  return state.data.settings?.currency || "₪";
}

function logoSrc() {
  return state.data.settings?.logoUrl || "/logo.svg";
}

function selectedWorkDays(value) {
  try {
    const days = JSON.parse(value || "[]");
    return Array.isArray(days) ? days.map(Number) : [];
  } catch {
    return [];
  }
}

function workDaysPickerLegacy(value) {
  const selected = new Set(selectedWorkDays(value || "[0,1,2,3,4,5]"));
  const days = [["0", "الأحد"], ["1", "الإثنين"], ["2", "الثلاثاء"], ["3", "الأربعاء"], ["4", "الخميس"], ["5", "الجمعة"], ["6", "السبت"]];
  return `<div class="work-days">${days.map(([id, label]) => `<label><input type="checkbox" name="workDay" value="${id}" ${selected.has(Number(id)) ? "checked" : ""}> <span>${label}</span></label>`).join("")}</div>`;
}

function readLogoFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 700 * 1024) {
    alert("حجم الشعار كبير. اختر صورة أقل من 700KB.");
    input.value = "";
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    document.getElementById("logoUrlInput").value = reader.result;
    document.getElementById("logoPreview").src = reader.result;
  });
  reader.readAsDataURL(file);
}

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function reminderText(appointment, channel) {
  const settings = state.data.settings || {};
  const template = settings.whatsappTemplate;
  return String(template || "مرحبا {client}، نذكرك بموعدك في {clinic} بتاريخ {date} الساعة {time}.")
    .replaceAll("{client}", appointment.clientName || "")
    .replaceAll("{clinic}", settings.clinicName || "CMS SUZAN")
    .replaceAll("{date}", appointment.date || "")
    .replaceAll("{time}", appointment.time || "")
    .replaceAll("{service}", appointment.serviceName || "");
}

function cleanPhone(phone) {
  return String(phone || "").replace(/[^\d+]/g, "");
}

async function sendReminder(id, channel) {
  const appointment = state.data.appointments.find((item) => item.id === id);
  if (!appointment) return;
  try {
    const result = await api(`/api/appointments/${id}/whatsapp`, { method: "POST", body: {} });
    if (result.ok) {
      alert(result.dryRun ? "WhatsApp dry-run בוצע בהצלחה" : "הודעת WhatsApp נשלחה בהצלחה");
      return;
    }
    if (result.fallbackUrl) {
      window.open(result.fallbackUrl, "_blank", "noopener");
      return;
    }
  } catch (error) {
    const phone = cleanPhone(appointment.clientPhone);
    const text = encodeURIComponent(reminderText(appointment, channel));
    const url = `https://wa.me/${phone.replace("+", "")}?text=${text}`;
    window.open(url, "_blank", "noopener");
  }
}

function printReceiptLegacy(id) {
  const a = state.data.appointments.find((item) => item.id === id);
  if (!a) return;
  const settings = state.data.settings || {};
  const paid = Number(a.paidAmount || 0);
  const total = Number(a.price || 0);
  const win = window.open("", "_blank", "width=720,height=820");
  win.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>إيصال</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#102220}.receipt{max-width:560px;margin:auto;border:1px solid #d8e6e1;border-radius:12px;padding:28px}img{width:70px}.row{display:flex;justify-content:space-between;border-bottom:1px solid #eef3f1;padding:10px 0}.total{font-size:20px;font-weight:700}</style></head><body><div class="receipt"><img src="${settings.logoUrl || "/logo.svg"}"><h1>${settings.clinicName || "CMS SUZAN"}</h1><h2>فاتورة / إيصال</h2><div class="row"><span>العميل</span><strong>${a.clientName}</strong></div><div class="row"><span>الخدمة</span><strong>${a.serviceName}</strong></div><div class="row"><span>التاريخ</span><strong>${a.date} ${a.time}</strong></div><div class="row"><span>الحالة</span><strong>${paymentLabel[a.paymentStatus || "unpaid"]}</strong></div><div class="row total"><span>الإجمالي</span><strong>${currency()}${total.toLocaleString()}</strong></div><div class="row"><span>المدفوع</span><strong>${currency()}${paid.toLocaleString()}</strong></div><div class="row"><span>المتبقي</span><strong>${currency()}${Math.max(total - paid, 0).toLocaleString()}</strong></div></div><script>print();</script></body></html>`);
  win.document.close();
}

async function openClientProfileLegacy(id) {
  const data = await api(`/api/clients/${id}/history`);
  const canWrite = state.user.role !== "therapist";
  document.getElementById("modalRoot").innerHTML = html`
    <div class="modal">
      <div class="modal-card wide">
        <div class="modal-head"><h3>ملف العميل - ${data.client ? `${data.client.fname} ${data.client.lname}` : ""}</h3><button type="button" class="btn ghost" id="closeModal">إغلاق</button></div>
        <div class="modal-body client-profile">
          <div class="card mini"><strong>الهاتف</strong><span>${data.client?.phone || "-"}</span></div>
          <div class="card mini"><strong>البريد</strong><span>${data.client?.email || "-"}</span></div>
          <div class="card mini"><strong>الملاحظات</strong><span>${data.client?.notes || "-"}</span></div>
          <div class="profile-section">
            <h4>سجل الزيارات</h4>
            ${appointmentTable(data.appointments || [], false)}
          </div>
          <div class="profile-section">
            <h4>ملفات وصور العميل</h4>
            ${(data.files || []).map((file) => `<div class="file-row"><a href="${file.url}" target="_blank" rel="noopener">${file.name}</a><span>${file.notes || ""}</span>${canWrite ? `<button class="btn danger" data-delete-file="${file.id}" data-client="${id}">حذف</button>` : ""}</div>`).join("") || `<p class="muted">لا توجد ملفات</p>`}
            ${canWrite ? `<form id="clientFileForm" class="inline-form"><input name="name" placeholder="اسم الملف" required><input name="url" placeholder="رابط الصورة أو الملف" required><input name="notes" placeholder="ملاحظة"><button class="btn">إضافة ملف</button></form>` : ""}
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById("closeModal").addEventListener("click", closeModal);
  const fileForm = document.getElementById("clientFileForm");
  if (fileForm) fileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await api(`/api/clients/${id}/files`, { method: "POST", body: Object.fromEntries(new FormData(fileForm)) });
    openClientProfile(id);
  });
  document.querySelectorAll("[data-delete-file]").forEach((button) => button.addEventListener("click", async () => {
    await api(`/api/client-files/${button.dataset.deleteFile}`, { method: "DELETE" });
    openClientProfile(Number(button.dataset.client));
  }));
}

function renderQuickSearchLive() {
  return html`
    <div class="quick-search">
      <input id="quickSearch" value="${escapeAttr(state.quickSearch)}" placeholder="${tr("quickSearch")}" autocomplete="off">
      <div id="quickResults" class="quick-results hidden"></div>
    </div>
  `;
}

function appointmentTable(rows, actions) {
  const heads = [tr("table.date"), tr("table.time"), tr("table.client"), tr("table.service"), tr("table.therapist"), tr("table.price"), tr("table.payment"), tr("table.status")];
  const actionLabel = state.lang === "he" ? "פעולות" : "إجراءات";
  return html`
    <div class="table-wrap responsive-table appointment-table">
      <table>
        <thead><tr>${heads.map((head) => `<th>${head}</th>`).join("")}${actions ? "<th></th>" : ""}</tr></thead>
        <tbody>
          ${rows.length ? rows.map((a) => html`
            <tr>
              <td data-label="${escapeAttr(heads[0])}">${a.date}</td><td data-label="${escapeAttr(heads[1])}">${a.time}</td><td data-label="${escapeAttr(heads[2])}">${a.clientName}</td><td data-label="${escapeAttr(heads[3])}">${a.serviceName}</td><td data-label="${escapeAttr(heads[4])}">${a.therapistName}</td>
              <td data-label="${escapeAttr(heads[5])}">${currency()}${Number(a.price || 0).toLocaleString()}</td>
              <td data-label="${escapeAttr(heads[6])}"><span class="pill ${a.paymentStatus || "unpaid"}">${paymentLabel[a.paymentStatus || "unpaid"]}</span></td>
              <td data-label="${escapeAttr(heads[7])}"><span class="pill ${a.status}">${statusLabel[a.status]}</span></td>
              ${actions ? `<td class="actions" data-label="${escapeAttr(actionLabel)}"><button class="btn secondary" data-receipt="${a.id}">${tr("receipt")}</button><button class="btn secondary" data-whatsapp="${a.id}">WhatsApp</button><button class="btn secondary" data-edit="appointments" data-id="${a.id}">${tr("edit")}</button>${state.user.role === "admin" ? `<button class="btn danger" data-delete="appointments" data-id="${a.id}">${tr("delete")}</button>` : ""}</td>` : ""}
            </tr>`).join("") : `<tr><td colspan="${actions ? 9 : 8}" class="muted">${tr("noData")}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function roleLabelLegacyFinal(role) {
  return tr(`roles.${role}`) || role;
}

function yesNo(value) {
  return value ? (state.lang === "he" ? "כן" : "نعم") : (state.lang === "he" ? "לא" : "لا");
}

function renderDashboardHe() {
  const { appointments, clients } = state.data;
  const today = new Date().toISOString().slice(0, 10);
  const done = appointments.filter((a) => a.status === "done");
  const revenue = done.reduce((sum, a) => sum + Number(a.price || 0), 0);
  return html`
    <div class="grid stats">
      ${statCard("📅", appointments.filter((a) => a.date === today).length, state.lang === "he" ? "תורים היום" : "مواعيد اليوم", "blue")}
      ${statCard("👥", clients.length, state.lang === "he" ? "סה״כ לקוחות" : "إجمالي العملاء", "green")}
      ${statCard("✅", done.length, state.lang === "he" ? "תורים שהושלמו" : "مواعيد مكتملة", "green")}
      ${statCard("₪", `${currency()}${revenue.toLocaleString()}`, state.lang === "he" ? "הכנסות" : "الإيرادات", "gold")}
    </div>
    <div class="card"><h3>${state.lang === "he" ? "תורים אחרונים" : "آخر المواعيد"}</h3>${appointmentTable(appointments.slice(0, 6), false)}</div>
  `;
}

function renderCalendarHe() {
  const anchor = parseDate(state.calendarDate);
  const view = state.calendarView;
  const days = view === "day" ? [anchor] : view === "week" ? weekDays(anchor) : monthDays(anchor);
  const names = state.lang === "he" ? { month: "חודש", week: "שבוע", day: "יום", prev: "הקודם", today: "היום", next: "הבא" } : { month: "شهر", week: "أسبوع", day: "يوم", prev: "السابق", today: "اليوم", next: "التالي" };
  return html`
    <div class="calendar-shell">
      <div class="toolbar calendar-toolbar">
        <div class="segmented">${["month", "week", "day"].map((item) => `<button class="${view === item ? "active" : ""}" data-calendar-view="${item}">${names[item]}</button>`).join("")}</div>
        <div class="calendar-nav"><button class="btn secondary" data-calendar-move="-1">${names.prev}</button><button class="btn secondary" data-calendar-today>${names.today}</button><button class="btn secondary" data-calendar-move="1">${names.next}</button></div>
        <strong>${calendarTitle(anchor, view)}</strong>
      </div>
      <div class="calendar-grid ${view}">${days.map((day) => calendarDay(day, view)).join("")}</div>
    </div>
  `;
}

function renderAppointmentsHe() {
  const search = state.filters.appointments.trim().toLowerCase();
  const status = state.filters.appointmentStatus;
  const rows = state.data.appointments.filter((a) => {
    const text = `${a.clientName} ${a.clientPhone} ${a.serviceName} ${a.therapistName} ${a.date} ${a.time}`.toLowerCase();
    return (!search || text.includes(search)) && (status === "all" || a.status === status);
  });
  return html`
    <div class="toolbar">
      <input data-filter="appointments" placeholder="${state.lang === "he" ? "חיפוש בתורים..." : "بحث في المواعيد..."}" value="${escapeAttr(state.filters.appointments)}">
      <select data-filter="appointmentStatus"><option value="all" ${status === "all" ? "selected" : ""}>${state.lang === "he" ? "כל הסטטוסים" : "كل الحالات"}</option><option value="pending" ${status === "pending" ? "selected" : ""}>${statusLabel.pending}</option><option value="done" ${status === "done" ? "selected" : ""}>${statusLabel.done}</option><option value="cancelled" ${status === "cancelled" ? "selected" : ""}>${statusLabel.cancelled}</option></select>
      <button class="btn secondary" data-export="appointments">CSV</button>
    </div>
    <div class="card">${appointmentTable(rows, true)}</div>
  `;
}

function renderClientsHe() {
  const canWrite = state.user.role !== "therapist";
  const search = state.filters.clients.trim().toLowerCase();
  const clients = state.data.clients.filter((c) => `${c.fname} ${c.lname} ${c.phone} ${c.email || ""} ${c.notes || ""}`.toLowerCase().includes(search));
  const h = state.lang === "he" ? ["שם", "טלפון", "אימייל", "מטפלת", "הערות"] : ["الاسم", "الهاتف", "البريد", "المعالجة", "ملاحظات"];
  return html`
    <div class="toolbar"><input data-filter="clients" placeholder="${state.lang === "he" ? "חיפוש לקוח..." : "بحث عن عميل..."}" value="${escapeAttr(state.filters.clients)}"><button class="btn secondary" data-export="clients">CSV</button></div>
    <div class="table-wrap"><table><thead><tr>${h.map((x) => `<th>${x}</th>`).join("")}<th></th></tr></thead><tbody>
      ${clients.map((c) => `<tr><td>${c.fname} ${c.lname}</td><td>${c.phone}</td><td>${c.email || "-"}</td><td>${userName(c.therapistId)}</td><td>${c.notes || "-"}</td><td class="actions"><button class="btn secondary" data-profile="${c.id}">${tr("searchGroups.file")}</button>${canWrite ? `<button class="btn secondary" data-edit="clients" data-id="${c.id}">${tr("edit")}</button><button class="btn danger" data-delete="clients" data-id="${c.id}">${tr("delete")}</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">${tr("noData")}</td></tr>`}
    </tbody></table></div>
  `;
}

function renderCategoriesHe() {
  return simpleTable("categories", [state.lang === "he" ? "שם" : "الاسم"], state.data.categories, (c) => [c.name]);
}

function renderServicesHe() {
  const h = state.lang === "he" ? ["שם", "קטגוריה", "משך", "מחיר", "פעיל"] : ["الاسم", "القسم", "المدة", "السعر", "فعال"];
  return simpleTable("services", h, state.data.services, (s) => [s.name, categoryName(s.categoryId), `${s.duration} ${state.lang === "he" ? "דקות" : "دقيقة"}`, `${currency()}${s.price}`, yesNo(s.active)]);
}

function renderUsersHe() {
  const h = state.lang === "he" ? ["שם משתמש", "שם", "תפקיד", "פעיל"] : ["اسم المستخدم", "الاسم", "الدور", "فعال"];
  return simpleTable("users", h, state.data.users, (u) => [u.username, u.name, roleLabel(u.role), yesNo(u.active)]);
}

function renderSettingsHe(message = "") {
  const s = state.data.settings || {};
  const he = state.lang === "he";
  return html`
    <div class="settings-grid">
      ${state.user.role === "admin" ? `<div class="card"><h3>${he ? "הגדרות קליניקה" : "إعدادات العيادة"}</h3><form id="clinicSettingsForm">
        ${field("clinicName", he ? "שם הקליניקה" : "اسم العيادة", s.clinicName || "CMS SUZAN")}
        <div class="field"><label>${he ? "לוגו המערכת" : "لوغو النظام"}</label><div class="logo-upload"><img id="logoPreview" src="${logoSrc()}" alt="CMS SUZAN"><input name="logoFile" id="logoFile" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp"><input name="logoUrl" id="logoUrlInput" type="hidden" value="${escapeAttr(s.logoUrl || "/logo.svg")}"></div></div>
        ${field("currency", he ? "מטבע" : "العملة", s.currency || "₪")}
        ${field("workStart", he ? "תחילת יום עבודה" : "بداية الدوام", s.workStart || "09:00", "time")}
        ${field("workEnd", he ? "סיום יום עבודה" : "نهاية الدوام", s.workEnd || "18:00", "time")}
        <div class="field full"><label>${he ? "ימי עבודה" : "أيام العمل"}</label>${workDaysPicker(s.workDays)}</div>
        ${field("whatsappTemplate", he ? "הודעת WhatsApp" : "رسالة WhatsApp", s.whatsappTemplate || "", "textarea", false, "full")}
        <button class="btn">${tr("save")}</button></form>
        <div class="backup-panel"><h3>${he ? "עותק חיצוני של המערכת" : "نسخة خارجية من النظام"}</h3><p class="muted">${he ? "הורדת עותק של בסיס הנתונים למחשב." : "تحميل نسخة قاعدة البيانات على جهاز الكمبيوتر."}</p><a class="btn secondary" href="/api/system/export" download>${he ? "הורדת עותק" : "تحميل النسخة"}</a></div></div>` : ""}
      <div class="card"><h3>${he ? "שינוי סיסמה" : "تغيير كلمة المرور"}</h3>${message ? `<div class="alert">${message}</div>` : ""}<form id="passwordForm"><div class="field"><label>${he ? "סיסמה נוכחית" : "كلمة المرور الحالية"}</label><input name="currentPassword" type="password" required></div><div class="field"><label>${he ? "סיסמה חדשה" : "كلمة المرور الجديدة"}</label><input name="newPassword" type="password" minlength="8" required></div><button class="btn">${he ? "שינוי סיסמה" : "تغيير كلمة المرور"}</button></form></div>
    </div>
  `;
}

function formFieldsHe(resource, row) {
  const he = state.lang === "he";
  if (resource === "clients") return html`${field("fname", he ? "שם פרטי" : "الاسم الأول", row.fname)}${field("lname", he ? "שם משפחה" : "اسم العائلة", row.lname)}${field("phone", he ? "טלפון" : "الهاتف", row.phone)}${field("email", he ? "אימייל" : "البريد", row.email, "email", false)}${select("therapistId", he ? "מטפלת" : "المعالجة", therapists(), row.therapistId, false)}${field("notes", he ? "הערות" : "ملاحظات", row.notes, "textarea", false, "full")}`;
  if (resource === "appointments") return html`${select("clientId", he ? "לקוח" : "العميل", state.data.clients.map((c) => [c.id, `${c.fname} ${c.lname}`]), row.clientId)}${select("serviceId", he ? "שירות" : "الخدمة", state.data.services.filter((s) => s.active).map((s) => [s.id, s.name]), row.serviceId)}${select("therapistId", he ? "מטפלת" : "المعالجة", therapists(), row.therapistId || state.user.id, state.user.role !== "therapist")}${field("date", he ? "תאריך" : "التاريخ", row.date || new Date().toISOString().slice(0, 10), "date")}${field("time", he ? "שעה" : "الوقت", row.time || "09:00", "time")}${select("status", he ? "סטטוס" : "الحالة", [["pending", statusLabel.pending], ["done", statusLabel.done], ["cancelled", statusLabel.cancelled]], row.status || "pending")}${select("paymentStatus", he ? "מצב תשלום" : "حالة الدفع", [["unpaid", paymentLabel.unpaid], ["paid", paymentLabel.paid], ["deposit", paymentLabel.deposit]], row.paymentStatus || "unpaid")}${field("paidAmount", he ? "סכום ששולם" : "المبلغ المدفوع", row.paidAmount || 0, "number", false)}${field("notes", he ? "הערות" : "ملاحظات", row.notes, "textarea", false, "full")}`;
  if (resource === "categories") return field("name", he ? "שם קטגוריה" : "اسم القسم", row.name);
  if (resource === "services") return html`${field("name", he ? "שם שירות" : "اسم الخدمة", row.name)}${select("categoryId", he ? "קטגוריה" : "القسم", state.data.categories.map((c) => [c.id, c.name]), row.categoryId)}${field("duration", he ? "משך בדקות" : "المدة بالدقائق", row.duration || 60, "number")}${field("price", he ? "מחיר" : "السعر", row.price || 0, "number")}${select("active", he ? "פעיל" : "فعال", [["true", yesNo(true)], ["false", yesNo(false)]], String(row.active !== false))}`;
  if (resource === "users") return html`${field("username", he ? "שם משתמש" : "اسم المستخدم", row.username)}${field("password", row.id ? (he ? "סיסמה חדשה אופציונלית" : "كلمة مرور جديدة اختيارية") : (he ? "סיסמה" : "كلمة المرور"), "", "password", !row.id)}${field("name", he ? "שם" : "الاسم", row.name)}${field("title", he ? "תיאור תפקיד" : "الوصف الوظيفي", row.title, "text", false)}${select("role", he ? "תפקיד" : "الدور", [["admin", roleLabel("admin")], ["reception", roleLabel("reception")], ["therapist", roleLabel("therapist")]], row.role || "therapist")}${select("active", he ? "פעיל" : "فعال", [["true", yesNo(true)], ["false", yesNo(false)]], String(row.active !== false))}`;
  return "";
}

function renderApp() {
  const nav = navByRole[state.user.role] || [];
  if (!nav.includes(state.page)) state.page = nav[0] || "dashboard";
  document.documentElement.lang = "he";
  document.documentElement.dir = "rtl";
  mount(html`
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <img class="brand-logo" src="${logoSrc()}" alt="CMS SUZAN">
          <div><h3>CMS SUZAN</h3><div style="opacity:.75;font-size:12px">ניהול קליניקה</div><div class="app-version">v${APP_VERSION}</div></div>
        </div>
        <nav class="nav">${nav.map((page) => `<button data-page="${page}" class="${state.page === page ? "active" : ""}">${pageLabel(page)}</button>`).join("")}</nav>
        <div class="user-box">
          <strong>${state.user.name}</strong>
          <span style="opacity:.75">${roleLabel(state.user.role)}</span>
          <button class="btn ghost" id="logoutBtn" style="color:white;border-color:rgba(255,255,255,.35)">יציאה</button>
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div><h2>${pageLabel(state.page)}</h2><div class="muted page-subtitle">${pageSubtitle()}</div></div>
          <div class="topbar-actions">${languagePicker()}${renderQuickSearchLive()}${topActionI18n()}</div>
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

function calendarDay(day, view) {
  const date = toDateInput(day);
  const rows = state.data.appointments.filter((a) => a.date === date).sort((a, b) => a.time.localeCompare(b.time));
  return html`
    <section class="calendar-day ${date === new Date().toISOString().slice(0, 10) ? "today" : ""}">
      <header><strong>${day.getDate()}</strong><span>${date}</span></header>
      <div class="calendar-events">
        ${rows.map((a) => `<button data-open-appointment="${a.id}" class="calendar-event ${a.status}"><span>${a.time}</span><strong>${a.clientName}</strong><em>${a.serviceName}</em></button>`).join("") || `<div class="calendar-empty">${view === "month" ? "" : "אין תורים"}</div>`}
      </div>
    </section>
  `;
}

function simpleTable(resource, heads, rows, mapRow) {
  const actionLabel = state.lang === "he" ? "פעולות" : "إجراءات";
  return html`
    <div class="table-wrap responsive-table resource-${resource}">
      <table>
        <thead><tr>${heads.map((h) => `<th>${h}</th>`).join("")}<th></th></tr></thead>
        <tbody>
          ${rows.map((row) => `<tr>${mapRow(row).map((cell, index) => `<td data-label="${escapeAttr(heads[index] || "")}">${cell}</td>`).join("")}<td class="actions" data-label="${escapeAttr(actionLabel)}"><button class="btn secondary" data-edit="${resource}" data-id="${row.id}">עריכה</button><button class="btn danger" data-delete="${resource}" data-id="${row.id}">מחיקה</button></td></tr>`).join("") || `<tr><td colspan="${heads.length + 1}" class="muted">אין נתונים</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderAudit() {
  const actions = { login: "כניסה", create: "יצירה", update: "עדכון", delete: "מחיקה", archive: "ארכוב", deactivate: "השבתה", change_password: "שינוי סיסמה", export: "ייצוא" };
  const entities = { users: "משתמשים", clients: "לקוחות", appointments: "תורים", services: "שירותים", categories: "קטגוריות", settings: "הגדרות", session: "כניסה", system: "מערכת", client_files: "קבצי לקוח" };
  return html`
    <div class="table-wrap">
      <table>
        <thead><tr><th>זמן</th><th>משתמש</th><th>פעולה</th><th>סוג</th><th>מספר</th></tr></thead>
        <tbody>${(state.data.audits || []).map((row) => `<tr><td>${row.createdAt}</td><td>${row.userName || "-"}</td><td>${actions[row.action] || row.action}</td><td>${entities[row.entity] || row.entity}</td><td>${row.entityId || "-"}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">אין נתונים</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function rankList(rows) {
  if (!rows.length) return `<p class="muted">אין נתונים</p>`;
  return rows.map(([name, value]) => `<div class="rank-row"><span>${name}</span><strong>${currency()}${Number(value || 0).toLocaleString()}</strong></div>`).join("");
}

function reportTabButton(tab, label) {
  return `<button class="rtab ${state.reportTab === tab ? "active" : ""}" data-report-tab="${tab}">${label}</button>`;
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
        ${reportTabButton("overview", "סקירה")}
        ${reportTabButton("revenue", "הכנסות")}
        ${reportTabButton("appointments", "תורים")}
        ${reportTabButton("clients", "לקוחות")}
        ${reportTabButton("therapists", "מטפלות")}
        ${reportTabButton("conflicts", "התנגשויות")}
      </div>
      <div class="filter-row">
        <div class="report-alert ${conflicts.length ? "warning" : "success"}">${conflicts.length ? `יש ${conflicts.length} התנגשויות לבדיקה` : "אין התנגשויות בתורים הנוכחיים"}</div>
        <div class="export-btns"><button class="btn secondary" data-export="appointments">ייצוא תורים CSV</button><button class="btn secondary" data-export="clients">ייצוא לקוחות CSV</button></div>
      </div>
      <div class="report-content">${renderReportTab(done, revenue, byTherapist, byService, conflicts)}</div>
    </div>
  `;
}

function renderReportTab(done, revenue, byTherapist, byService, conflicts) {
  const appointments = state.data.appointments;
  if (state.reportTab === "revenue") return html`<div class="grid stats">${statCard("₪", `${currency()}${revenue.toLocaleString()}`, "סה״כ הכנסות", "gold")}${statCard("↗", `${currency()}${done.length ? Math.round(revenue / done.length).toLocaleString() : 0}`, "ממוצע לתור", "green")}${statCard("✓", done.length, "תורים שבוצעו", "blue")}${statCard("▣", byService.length, "שירותים עם הכנסה", "purple")}</div><div class="report-grid-2"><div class="card"><h3>הכנסות לפי שירות</h3>${rankList(byService)}</div><div class="card"><h3>הכנסות לפי מטפלת</h3>${rankList(byTherapist)}</div></div>`;
  if (state.reportTab === "appointments") return html`<div class="grid stats">${statCard("📅", appointments.length, "סה״כ תורים", "blue")}${statCard("✓", done.length, "בוצעו", "green")}${statCard("…", appointments.filter((a) => a.status === "pending").length, "ממתינים", "gold")}${statCard("×", appointments.filter((a) => a.status === "cancelled").length, "בוטלו", "red")}</div>${appointmentTable(appointments, false)}`;
  if (state.reportTab === "clients") {
    const activeClientIds = new Set(appointments.map((a) => a.clientId));
    const topClients = [...activeClientIds].map((id) => {
      const rows = appointments.filter((a) => a.clientId === id && a.status === "done");
      const client = state.data.clients.find((c) => c.id === id);
      return [client ? `${client.fname} ${client.lname}` : "-", rows.reduce((sum, a) => sum + Number(a.price || 0), 0)];
    }).sort((a, b) => b[1] - a[1]);
    return html`<div class="grid stats">${statCard("👥", state.data.clients.length, "סה״כ לקוחות", "green")}${statCard("⚡", activeClientIds.size, "לקוחות עם תורים", "blue")}${statCard("◼", state.data.clients.filter((c) => c.email || c.phone).length, "תיקים עם פרטי קשר", "gold")}${statCard("◆", topClients.length ? topClients[0][0] : "-", "לקוח מוביל", "purple")}</div><div class="card"><h3>לקוחות מובילים לפי הכנסה</h3>${rankList(topClients)}</div>`;
  }
  if (state.reportTab === "therapists") {
    const rows = therapists().map(([id, name]) => {
      const all = appointments.filter((a) => a.therapistId === Number(id));
      const completed = all.filter((a) => a.status === "done");
      const rev = completed.reduce((sum, a) => sum + Number(a.price || 0), 0);
      return { name, all: all.length, completed: completed.length, cancelled: all.filter((a) => a.status === "cancelled").length, rev };
    });
    return html`<div class="table-wrap"><table><thead><tr><th>מטפלת</th><th>כל התורים</th><th>בוצעו</th><th>בוטלו</th><th>אחוז ביצוע</th><th>הכנסה</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r.name}</td><td>${r.all}</td><td>${r.completed}</td><td>${r.cancelled}</td><td>${r.all ? Math.round(r.completed / r.all * 100) : 0}%</td><td>${currency()}${r.rev.toLocaleString()}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">אין נתונים</td></tr>`}</tbody></table></div>`;
  }
  if (state.reportTab === "conflicts") return html`<div class="grid stats">${statCard("!", conflicts.length, "סה״כ התנגשויות", conflicts.length ? "red" : "green")}${statCard("👤", conflicts.filter((c) => c.reason === "אותה מטפלת").length, "אותה מטפלת", "gold")}${statCard("⏱", conflicts.filter((c) => c.reason === "חפיפת זמן").length, "חפיפת זמן", "blue")}${statCard("✓", conflicts.length ? "בדיקה" : "תקין", "מצב היומן", "green")}</div><div class="table-wrap"><table><thead><tr><th>תאריך</th><th>שעה</th><th>תור ראשון</th><th>תור שני</th><th>סיבה</th></tr></thead><tbody>${conflicts.map((c) => `<tr><td>${c.a.date}</td><td>${c.a.time} / ${c.b.time}</td><td>${c.a.clientName} - ${c.a.serviceName}</td><td>${c.b.clientName} - ${c.b.serviceName}</td><td><span class="pill cancelled">${c.reason}</span></td></tr>`).join("") || `<tr><td colspan="5" class="muted">אין התנגשויות</td></tr>`}</tbody></table></div>`;
  return html`<div class="grid stats">${statCard("📅", appointments.length, "סה״כ תורים", "blue")}${statCard("✓", done.length, "בוצעו", "green")}${statCard("₪", `${currency()}${revenue.toLocaleString()}`, "סה״כ הכנסות", "gold")}${statCard("!", conflicts.length, "התנגשויות", conflicts.length ? "red" : "green")}</div><div class="report-grid-2"><div class="card"><h3>הכנסות לפי שירות</h3>${rankList(byService)}</div><div class="card"><h3>הכנסות לפי מטפלת</h3>${rankList(byTherapist)}</div></div>`;
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
      if (overlaps && a.therapistId === b.therapistId) conflicts.push({ a, b, reason: "אותה מטפלת" });
      else if (overlaps) conflicts.push({ a, b, reason: "חפיפת זמן" });
    }
  }
  return conflicts;
}

function openForm(resource, id = null, defaults = {}) {
  const row = id ? state.data[resource].find((item) => item.id === id) : defaults;
  document.getElementById("modalRoot").innerHTML = html`
    <div class="modal"><form class="modal-card" id="entityForm">
      <div class="modal-head"><h3>${id ? "עריכת" : "הוספת"} ${pageLabel(resource) || ""}</h3><button type="button" class="btn ghost" id="closeModal">סגירה</button></div>
      <div class="modal-body">${formFieldsHe(resource, row || {})}</div>
      <div class="modal-foot"><button class="btn">שמירה</button><div id="formError" class="muted"></div></div>
    </form></div>`;
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
      const message = localizedError(err);
      document.getElementById("formError").textContent = message;
      showCenterError(message);
    }
  });
}

function roleLabel(role) {
  return tr(`roles.${role}`) || role;
}

function renderLogin(error = "") {
  document.documentElement.lang = "he";
  document.documentElement.dir = "rtl";
  mount(html`
    <main class="login">
      <form class="login-card" id="loginForm">
        <div class="brand">
          <img class="brand-logo" src="${logoSrc()}" alt="CMS SUZAN">
          <div><h1>CMS SUZAN</h1><div class="muted">מערכת ניהול קליניקה</div></div>
        </div>
        ${error ? `<div class="alert">${error}</div>` : ""}
        <div class="field"><label>שם משתמש</label><input name="username" autocomplete="username" required></div>
        <div class="field"><label>סיסמה</label><input name="password" type="password" autocomplete="current-password" required></div>
        <button class="btn" style="width:100%">כניסה</button>
        <div class="version-badge">v${APP_VERSION}</div>
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

async function openClientProfile(id) {
  const data = await api(`/api/clients/${id}/history`);
  const canWrite = state.user.role !== "therapist";
  document.getElementById("modalRoot").innerHTML = html`
    <div class="modal">
      <div class="modal-card wide">
        <div class="modal-head"><h3>תיק לקוח - ${data.client ? `${data.client.fname} ${data.client.lname}` : ""}</h3><button type="button" class="btn ghost" id="closeModal">סגירה</button></div>
        <div class="modal-body client-profile">
          <div class="card mini"><strong>טלפון</strong><span>${data.client?.phone || "-"}</span></div>
          <div class="card mini"><strong>אימייל</strong><span>${data.client?.email || "-"}</span></div>
          <div class="card mini"><strong>הערות</strong><span>${data.client?.notes || "-"}</span></div>
          <div class="profile-section"><h4>היסטוריית ביקורים</h4>${appointmentTable(data.appointments || [], false)}</div>
          <div class="profile-section">
            <h4>קבצים ותמונות לקוח</h4>
            ${(data.files || []).map((file) => `<div class="file-row"><a href="${file.url}" target="_blank" rel="noopener">${file.name}</a><span>${file.notes || file.originalName || ""}</span><small>${file.size ? `${Math.round(file.size / 1024)}KB` : ""}</small>${canWrite ? `<button class="btn danger" data-delete-file="${file.id}" data-client="${id}">מחיקה</button>` : ""}</div>`).join("") || `<p class="muted">אין קבצים</p>`}
            ${canWrite ? `<form id="clientFileForm" class="inline-form upload-form"><input name="name" placeholder="שם הקובץ"><input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required><input name="notes" placeholder="הערה"><button class="btn">העלאה</button></form><div class="muted upload-hint">JPG, PNG, WEBP, PDF · עד 10MB</div>` : ""}
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById("closeModal").addEventListener("click", closeModal);
  const fileForm = document.getElementById("clientFileForm");
  if (fileForm) fileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await api(`/api/clients/${id}/files`, { method: "POST", body: new FormData(fileForm) });
    openClientProfile(id);
  });
  document.querySelectorAll("[data-delete-file]").forEach((button) => button.addEventListener("click", async () => {
    await api(`/api/client-files/${button.dataset.deleteFile}`, { method: "DELETE" });
    openClientProfile(Number(button.dataset.client));
  }));
}

function printReceipt(id) {
  const a = state.data.appointments.find((item) => item.id === id);
  if (!a) return;
  const settings = state.data.settings || {};
  const paid = Number(a.paidAmount || 0);
  const total = Number(a.price || 0);
  const win = window.open("", "_blank", "width=720,height=820");
  win.document.write(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>קבלה</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#102220}.receipt{max-width:560px;margin:auto;border:1px solid #d8e6e1;border-radius:12px;padding:28px}img{width:70px}.row{display:flex;justify-content:space-between;border-bottom:1px solid #eef3f1;padding:10px 0}.total{font-size:20px;font-weight:700}</style></head><body><div class="receipt"><img src="${settings.logoUrl || "/logo.svg"}"><h1>${settings.clinicName || "CMS SUZAN"}</h1><h2>חשבונית / קבלה</h2><div class="row"><span>לקוח</span><strong>${a.clientName}</strong></div><div class="row"><span>שירות</span><strong>${a.serviceName}</strong></div><div class="row"><span>תאריך</span><strong>${a.date} ${a.time}</strong></div><div class="row"><span>מצב תשלום</span><strong>${paymentLabel[a.paymentStatus || "unpaid"]}</strong></div><div class="row total"><span>סה״כ</span><strong>${currency()}${total.toLocaleString()}</strong></div><div class="row"><span>שולם</span><strong>${currency()}${paid.toLocaleString()}</strong></div><div class="row"><span>יתרה</span><strong>${currency()}${Math.max(total - paid, 0).toLocaleString()}</strong></div></div><script>print();</script></body></html>`);
  win.document.close();
}

function workDaysPicker(value) {
  const selected = new Set(selectedWorkDays(value || "[0,1,2,3,4,5]"));
  const days = state.lang === "he"
    ? [["0", "ראשון"], ["1", "שני"], ["2", "שלישי"], ["3", "רביעי"], ["4", "חמישי"], ["5", "שישי"], ["6", "שבת"]]
    : [["0", "الأحد"], ["1", "الإثنين"], ["2", "الثلاثاء"], ["3", "الأربعاء"], ["4", "الخميس"], ["5", "الجمعة"], ["6", "السبت"]];
  return `<div class="work-days">${days.map(([id, label]) => `<label><input type="checkbox" name="workDay" value="${id}" ${selected.has(Number(id)) ? "checked" : ""}> <span>${label}</span></label>`).join("")}</div>`;
}

boot().catch((err) => renderLogin(err.message));
