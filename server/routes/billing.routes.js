import { exact, matches, route } from "./route-utils.js";

export const billingRoutes = [
  route("GET", exact("/api/billing"), { module: "billing" }),
  route("PUT", exact("/api/billing"), { module: "billing" }),
  route("POST", exact("/api/billing/invoices"), { module: "billing" }),
  route("PUT", matches(/^\/api\/billing\/invoices\/\d+$/), { module: "billing" }),
];
