import { resource, route } from "../../routes/route-utils.js";

export const catalogRoutes = [
  route("GET", resource("categories"), { module: "catalog" }),
  route("POST", resource("categories"), { module: "catalog" }),
  route("PUT", resource("categories"), { module: "catalog" }),
  route("DELETE", resource("categories"), { module: "catalog" }),
  route("GET", resource("services"), { module: "catalog" }),
  route("POST", resource("services"), { module: "catalog" }),
  route("PUT", resource("services"), { module: "catalog" }),
  route("DELETE", resource("services"), { module: "catalog" }),
];
