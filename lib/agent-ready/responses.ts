function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

const discoveryCacheControl = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

export function jsonResponse(body: unknown, contentType = "application/json; charset=utf-8") {
  return new Response(`${prettyJson(body)}\n`, {
    headers: {
      "Cache-Control": discoveryCacheControl,
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function textResponse(body: string, contentType: string, headers?: HeadersInit) {
  return new Response(body.endsWith("\n") ? body : `${body}\n`, {
    headers: {
      "Cache-Control": discoveryCacheControl,
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}
