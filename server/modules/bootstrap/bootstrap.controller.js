import { json } from "../../shared/http/json-response.js";
import { buildBootstrapResponse } from "./bootstrap.service.js";

export async function handleBootstrapRoute(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    const body = await buildBootstrapResponse(req, res);
    if (body) json(res, 200, body);
    return true;
  }
  return false;
}
