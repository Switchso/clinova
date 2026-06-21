const originalFetch = globalThis.fetch?.bind(globalThis);
const graphPrefix = "https://graph.facebook.com/";

function urlString(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input?.url ? String(input.url) : String(input || "");
}

function isExternalUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return false;
  return !["127.0.0.1", "::1", "localhost"].includes(parsed.hostname);
}

function jsonResponse(status, message) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

globalThis.fetch = async function mockFetch(input, init) {
  const target = urlString(input);

  if (target.startsWith(graphPrefix)) {
    switch (process.env.MOCK_FETCH_MODE) {
      case "provider_400":
        return jsonResponse(400, "Mock WhatsApp provider 400");
      case "provider_500":
        return jsonResponse(500, "Mock WhatsApp provider 500");
      case "network_error":
        throw new Error("Mock WhatsApp provider network error");
      default:
        throw new Error(`Unexpected MOCK_FETCH_MODE for WhatsApp Graph fetch: ${process.env.MOCK_FETCH_MODE || ""}`);
    }
  }

  if (isExternalUrl(target)) {
    throw new Error(`Unexpected external fetch blocked by mock-fetch-preload: ${target}`);
  }

  if (!originalFetch) throw new Error("No original fetch is available for local request delegation.");
  return originalFetch(input, init);
};
