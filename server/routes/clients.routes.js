import { resource, route } from "./route-utils.js";

export const clientsRoutes = [
  route("GET", resource("clients"), { module: "clients" }),
  route("POST", resource("clients"), { module: "clients" }),
  route("PUT", resource("clients"), { module: "clients" }),
  route("DELETE", resource("clients"), { module: "clients" }),
];
