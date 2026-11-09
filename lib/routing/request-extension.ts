import type { NextRequest, NextResponse } from "next/server";

export function extendRequestHeaders(_request: NextRequest, _headers: Headers): void {}
export function extendResponse(_request: NextRequest, response: NextResponse): NextResponse {
  return response;
}
