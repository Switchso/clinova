import { json } from "../../shared/http/json-response.js";
import { currentUser, parseCookies } from "../../services/auth.service.js";
import { changePassword } from "./account.service.js";

const loginRequiredError = "״¬״¨ ״×״³״¬„ ״§„״¯״®ˆ„";

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Invalid JSON body");
    error.status = 400;
    throw error;
  }
}

export async function handleAccountRoute(req, res, url) {
  if (req.method !== "POST" || url.pathname !== "/api/account/password") return false;

  const user = await currentUser(parseCookies(req).clinic_session);
  if (!user) {
    json(res, 401, { error: loginRequiredError });
    return true;
  }

  const result = await changePassword(user, await readBody(req));
  if (result.cookie) res.setHeader("Set-Cookie", result.cookie);
  json(res, result.status, result.body);
  return true;
}
