import { route, resource } from "./route-utils.js";

export const usersRoutes = [
  route("GET", resource("users"), { module: "users" }),
  route("POST", resource("users"), { module: "users" }),
  route("PUT", resource("users"), { module: "users" }),
  route("DELETE", resource("users"), { module: "users" }),
];
