// The iOS app claims this HTTPS redirect through associated domains (ADR-021), so the
// authorization response normally never reaches a browser. When it does, the URL carries a
// one-time code: answer with a static page that loads nothing and sends no referrer.
const FALLBACK_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Return to the app</title>
</head>
<body>
<p>Open the Bisibility app on this device to finish signing in.</p>
</body>
</html>
`;

export function GET() {
  return new Response(FALLBACK_PAGE, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; base-uri 'none'; form-action 'none'",
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
    },
  });
}
