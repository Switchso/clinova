import { exact, matches, route } from "./route-utils.js";

export const filesRoutes = [
  route("GET", matches(/^\/api\/clients\/\d+\/files$/), { module: "files" }),
  route("POST", matches(/^\/api\/clients\/\d+\/files$/), { module: "files" }),
  route("GET", matches(/^\/api\/client-files\/\d+\/download$/), { module: "files" }),
  route("DELETE", matches(/^\/api\/client-files\/\d+$/), { module: "files" }),
  route("GET", exact("/api/system/export")),
  route("POST", exact("/api/system/restore")),
];
