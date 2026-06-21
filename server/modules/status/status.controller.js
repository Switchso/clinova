import { json } from "../../shared/http/json-response.js";
import { health, version } from "./status.service.js";

function send(res, result) {
  json(res, result.status, result.body);
  return true;
}

export async function handleStatusRoute(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    return send(res, await health());
  }
  if (req.method === "GET" && url.pathname === "/api/version") {
    return send(res, await version());
  }
  return false;
}
