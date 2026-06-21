import { exact, resource, route } from "./route-utils.js";

export const crmRoutes = [
  route("GET", exact("/api/crm"), { module: "crm" }),
  route("GET", resource("crm-tasks"), { module: "crm" }),
  route("POST", resource("crm-tasks"), { module: "crm" }),
  route("PUT", resource("crm-tasks"), { module: "crm" }),
];
