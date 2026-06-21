import { exact, route } from "./route-utils.js";

export const searchRoutes = [
  route("GET", exact("/api/search"), { module: "search" }),
];
