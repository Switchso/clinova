import { resource, route } from "./route-utils.js";

export const consentsRoutes = [
  route("GET", resource("consents"), { module: "consents" }),
  route("POST", resource("consents"), { module: "consents" }),
  route("DELETE", resource("consents"), { module: "consents" }),
];
