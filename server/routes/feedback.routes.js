import { exact, matches, route } from "./route-utils.js";

export const feedbackRoutes = [
  route("GET", matches(/^\/api\/public\/feedback\/[^/]+$/), { module: "feedback" }),
  route("POST", matches(/^\/api\/public\/feedback\/[^/]+$/), { module: "feedback" }),
  route("GET", exact("/api/feedback"), { module: "feedback" }),
  route("POST", exact("/api/feedback"), { module: "feedback" }),
];
