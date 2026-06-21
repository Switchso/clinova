import { json } from "../shared/http/json-response.js";
import { requireUser } from "../services/permissions.service.js";
import { globalSearch } from "../services/search.service.js";

export async function handleSearchRoute(req, res, url) {
  if (req.method !== "GET" || url.pathname !== "/api/search") return false;

  const auth = await requireUser(req);
  if (!auth.ok) {
    json(res, auth.status, auth.body);
    return true;
  }

  const result = await globalSearch(auth.user, url.searchParams.get("q"));
  json(res, result.status, result.body);
  return true;
}
