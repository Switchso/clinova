import {
  listAppointmentRowsForSearch,
  listClientRowsForSearch,
  listServiceRowsForSearch,
} from "../repositories/search.repository.js";

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function searchScore(text, query, phone = "") {
  const source = String(text || "").toLowerCase();
  const needle = String(query || "").toLowerCase();
  const phoneNeedle = digitsOnly(query);
  let score = 0;
  if (source.includes(needle)) score += source.startsWith(needle) ? 80 : 45;
  if (phoneNeedle && digitsOnly(phone).includes(phoneNeedle)) score += 70;
  for (const part of needle.split(/\s+/).filter(Boolean)) if (source.includes(part)) score += 12;
  return score;
}

export async function globalSearch(user, query) {
  const term = String(query || "").trim();
  if (term.length < 2) return { status: 200, body: { clients: [], appointments: [], services: [] } };

  const like = `%${term}%`;
  const digitTerm = `%${digitsOnly(term)}%`;
  const clientRows = await listClientRowsForSearch(user);
  const clients = clientRows
    .map((row) => {
      const name = `${row.fname} ${row.lname}`;
      const score = searchScore(`${name} ${row.email || ""} ${row.notes || ""} ${row.therapistName || ""}`, term, row.phone);
      return { id: row.id, name, phone: row.phone, email: row.email, therapistName: row.therapistName || "", score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return {
    status: 200,
    body: {
      clients,
      appointments: await listAppointmentRowsForSearch(user, like, digitTerm),
      services: await listServiceRowsForSearch(user, like),
    },
  };
}
