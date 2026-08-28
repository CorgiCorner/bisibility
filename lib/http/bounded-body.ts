import "server-only";

export type BoundedBody =
  | { bytes: Buffer; ok: true }
  | { ok: false; reason: "too_large" | "unreadable" };

/**
 * Reads at most `limit` bytes from a request. An oversized body is refused as soon as the
 * limit is crossed and the underlying stream is cancelled, so the process never buffers
 * more than the caller allows. Stream read failures are reported as "unreadable" rather than
 * thrown.
 */
export async function readBodyWithLimit(req: Request, limit: number): Promise<BoundedBody> {
  const declared = Number.parseInt(req.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declared) && declared > limit) {
    return { ok: false, reason: "too_large" };
  }

  const body = req.body;
  if (!body) {
    return { bytes: Buffer.alloc(0), ok: true };
  }

  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      parts.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return { ok: false, reason: "unreadable" };
  } finally {
    reader.releaseLock();
  }

  return { bytes: Buffer.concat(parts, total), ok: true };
}
