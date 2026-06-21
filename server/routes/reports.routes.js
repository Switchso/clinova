import { exact, resource, route } from "./route-utils.js";

export const reportsRoutes = [
  route("GET", resource("reports"), { module: "reports" }),
  route("GET", exact("/api/bootstrap")),
  route("GET", exact("/api/health")),
  route("GET", exact("/api/version")),
];
