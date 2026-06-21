import { exact, route } from "./route-utils.js";

export const authRoutes = [
  route("POST", exact("/api/signup")),
  route("POST", exact("/api/login"), { module: "auth" }),
  route("POST", exact("/api/logout"), { module: "auth" }),
  route("POST", exact("/api/account/password")),
  route("GET", exact("/api/me"), { module: "auth" }),
];
