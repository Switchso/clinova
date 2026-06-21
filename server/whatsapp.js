import { config } from "./config.js";

export function normalizeWhatsAppPhone(phone) {
  let value = String(phone || "").replace(/[^\d+]/g, "");
  if (value.startsWith("+")) value = value.slice(1);
  if (value.startsWith("00")) value = value.slice(2);
  if (value.startsWith("0")) value = `${config.whatsapp.defaultCountryCode}${value.slice(1)}`;
  return value;
}

export function whatsappFallbackUrl(phone, message) {
  const to = normalizeWhatsAppPhone(phone);
  return `https://wa.me/${to}?text=${encodeURIComponent(message)}`;
}

export function renderReminderMessage(appointment, settings = {}) {
  const template = settings.whatsappTemplate || "שלום {client}, תזכורת לתור שלך ב-{clinic} בתאריך {date} בשעה {time}.";
  return String(template)
    .replaceAll("{client}", appointment.clientName || "")
    .replaceAll("{clinic}", settings.clinicName || "Clinova")
    .replaceAll("{date}", appointment.date || "")
    .replaceAll("{time}", appointment.time || "")
    .replaceAll("{service}", appointment.serviceName || "");
}

export async function sendWhatsAppText({ to, message }) {
  const phone = normalizeWhatsAppPhone(to);
  if (!phone) {
    const error = new Error("מספר WhatsApp לא תקין");
    error.status = 400;
    throw error;
  }

  if (!config.whatsapp.enabled) {
    return {
      ok: false,
      configured: false,
      fallbackUrl: whatsappFallbackUrl(phone, message),
      message: "WhatsApp API is disabled. Set WHATSAPP_ENABLED=true to send via Meta Cloud API.",
    };
  }

  if (!config.whatsapp.phoneNumberId || !config.whatsapp.accessToken) {
    const error = new Error("WhatsApp API is missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN");
    error.status = 503;
    throw error;
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "text",
    text: {
      preview_url: false,
      body: message,
    },
  };

  if (config.whatsapp.dryRun) {
    return { ok: true, dryRun: true, to: phone, payload };
  }

  const response = await fetch(`https://graph.facebook.com/${config.whatsapp.graphVersion}/${config.whatsapp.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.whatsapp.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error?.message || "WhatsApp API request failed");
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return {
    ok: true,
    to: phone,
    messageId: data.messages?.[0]?.id || "",
    response: data,
  };
}
