import { json } from "../../shared/http/json-response.js";
import { disabledSignup } from "./signup.service.js";

export async function handleSignupRoute(req, res, url) {
  if (req.method !== "POST" || url.pathname !== "/api/signup") return false;
  const result = disabledSignup();
  json(res, result.status, result.body);
  return true;
}
