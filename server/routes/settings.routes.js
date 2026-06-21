import { exact, matches, route } from "./route-utils.js";

export const settingsRoutes = [
  route("GET", exact("/api/settings"), { module: "settings" }),
  route("PUT", exact("/api/settings"), { module: "settings" }),
  route("GET", exact("/api/tenant"), { module: "settings" }),
  route("PUT", exact("/api/tenant"), { module: "settings" }),
  route("GET", exact("/api/tenant/domains"), { module: "tenant-domains" }),
  route("POST", exact("/api/tenant/domains"), { module: "tenant-domains" }),
  route("PUT", matches(/^\/api\/tenant\/domains\/\d+$/), { module: "tenant-domains" }),
  route("DELETE", matches(/^\/api\/tenant\/domains\/\d+$/), { module: "tenant-domains" }),
];
