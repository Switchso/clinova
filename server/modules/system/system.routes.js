import { exact, route } from "../../routes/route-utils.js";

export const systemRoutes = [
  route("GET", exact("/api/system/export"), { module: "system" }),
  route("POST", exact("/api/system/restore"), { module: "system" }),
];
