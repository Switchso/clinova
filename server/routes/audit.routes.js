import { resource, route } from "./route-utils.js";

export const auditRoutes = [
  route("GET", resource("audit"), { module: "audit" }),
];
