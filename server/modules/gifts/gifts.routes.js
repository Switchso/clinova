import { exact, matches, route } from "../../routes/route-utils.js";

export const giftsRoutes = [
  route("GET", exact("/api/gifts"), { module: "gifts" }),
  route("POST", exact("/api/gifts"), { module: "gifts" }),
  route("PUT", matches(/^\/api\/gifts\/\d+$/), { module: "gifts" }),
];
