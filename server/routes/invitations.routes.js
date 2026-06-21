import { exact, matches, route } from "./route-utils.js";

export const invitationsRoutes = [
  route("GET", exact("/api/invitations"), { module: "invitations" }),
  route("POST", exact("/api/invitations"), { module: "invitations" }),
  route("GET", matches(/^\/api\/invitations\/[^/]+$/), { module: "invitations" }),
  route("POST", matches(/^\/api\/invitations\/[^/]+\/accept$/), { module: "invitations" }),
  route("DELETE", matches(/^\/api\/invitations\/\d+$/), { module: "invitations" }),
];
