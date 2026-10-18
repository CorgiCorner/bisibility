export const securityHeaders = {
  "Content-Security-Policy":
    "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; upgrade-insecure-requests",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
} as const;
