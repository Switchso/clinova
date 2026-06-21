export function disabledSignup() {
  return {
    status: 403,
    body: { error: "Clinic creation is managed by the platform owner." },
  };
}
