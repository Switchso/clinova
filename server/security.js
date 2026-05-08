import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || "").split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const actual = Buffer.from(scryptSync(password, salt, 64).toString("hex"), "hex");
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function sign(value, secret) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function createSessionToken(secret) {
  const id = randomBytes(32).toString("hex");
  return `${id}.${sign(id, secret)}`;
}

export function readSignedToken(raw, secret) {
  const [id, signature] = String(raw || "").split(".");
  if (!id || !signature) return null;
  const expected = sign(id, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return id;
}
