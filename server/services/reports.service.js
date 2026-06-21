import { listReportAppointmentRows } from "../repositories/reports.repository.js";

export async function getReports(user) {
  const rows = await listReportAppointmentRows(user.tenantId);
  const done = rows.filter((row) => row.status === "done");
  const revenue = done.reduce((sum, row) => sum + Number(row.price), 0);
  return {
    status: 200,
    body: {
      totalAppointments: rows.length,
      completedAppointments: done.length,
      pendingAppointments: rows.filter((row) => row.status === "pending").length,
      cancelledAppointments: rows.filter((row) => row.status === "cancelled").length,
      totalRevenue: revenue,
      averageAppointment: done.length ? Math.round(revenue / done.length) : 0,
    },
  };
}
