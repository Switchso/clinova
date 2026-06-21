import { config } from "../../config.js";

export function inviteUrl(req, token) {
  const proto = req.headers["x-forwarded-proto"] || (config.cookieSecure ? "https" : "http");
  const host = req.headers["x-forwarded-host"] || req.headers.host || "127.0.0.1:3000";
  return `${proto}://${host}/?invite=${encodeURIComponent(token)}`;
}
