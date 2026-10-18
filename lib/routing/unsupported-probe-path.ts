import { NextResponse } from "next/server";
import { securityHeaders } from "./security-headers";

/** Reject paths for server secrets or software that this application does not serve. */
export function unsupportedProbeResponse(pathname: string): NextResponse | null {
  if (!/^(?:\/\.git(?:\/|$)|\/\.env(?:[./]|$)|\/wp-(?:admin|content)(?:\/|$))/i.test(pathname)) {
    return null;
  }
  return new NextResponse(null, {
    status: 404,
    headers: { "Cache-Control": "no-store", ...securityHeaders },
  });
}
