import { exact, matches, route } from "./route-utils.js";

export const whatsappRoutes = [
  route("GET", exact("/api/message-logs"), { module: "whatsapp" }),
  route("POST", matches(/^\/api\/appointments\/\d+\/whatsapp$/), { module: "whatsapp" }),
  route("POST", matches(/^\/api\/gifts\/\d+\/whatsapp$/), { module: "whatsapp" }),
];
