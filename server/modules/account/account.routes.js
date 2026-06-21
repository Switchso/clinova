import { exact, route } from "../../routes/route-utils.js";

export const accountRoutes = [
  route("POST", exact("/api/account/password"), { module: "account" }),
];
