import { json } from "./json-response.js";

export const apiNotFoundBody = {
  error: "״§„…״³״§״± ״÷״± …ˆ״¬ˆ״¯",
};

export function apiNotFound(res) {
  json(res, 404, apiNotFoundBody);
}
