import { exact, route } from "../../routes/route-utils.js";

export const signupRoutes = [
  route("POST", exact("/api/signup"), { module: "signup" }),
];
