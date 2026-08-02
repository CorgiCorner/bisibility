export function internalProbeHeaders(init: HeadersInit = {}) {
  const headers = new Headers(init);
  const token = process.env.INTERNAL_PROBE_TOKEN?.trim();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}
