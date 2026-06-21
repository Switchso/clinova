import { exact, route } from "../../routes/route-utils.js";

export const bootstrapRoutes = [
  route("GET", exact("/api/bootstrap"), { module: "bootstrap" }),
];
