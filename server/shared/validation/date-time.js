export function isValidIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function isValidTime(value) {
  if (typeof value !== "string") return false;
  const match = value.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return false;
  const [, hours, minutes, seconds = "0"] = match;
  return Number(hours) <= 23 && Number(minutes) <= 59 && Number(seconds) <= 59;
}

export function isValidLocalDateTime(value) {
  if (typeof value !== "string") return false;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)(Z|[+-]\d{2}:\d{2})?$/);
  if (!match || !isValidIsoDate(match[1]) || !isValidTime(match[2].split(".")[0])) return false;
  if (!match[3] || match[3] === "Z") return true;
  const [hours, minutes] = match[3].slice(1).split(":").map(Number);
  return hours <= 23 && minutes <= 59;
}
