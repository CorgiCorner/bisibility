import "server-only";
import { readBodyWithLimit } from "@/lib/http/bounded-body";

export async function validateOneClickForm(request: Request): Promise<400 | 413 | null> {
  const contentType = request.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/x-www-form-urlencoded" && mediaType !== "multipart/form-data") {
    return 400;
  }
  const body = await readBodyWithLimit(request, 4096);
  if (!body.ok) return body.reason === "too_large" ? 413 : 400;
  try {
    const form = await new Request("https://example.com", {
      method: "POST",
      headers: { "content-type": contentType },
      body: Uint8Array.from(body.bytes),
    }).formData();
    const values = form.getAll("List-Unsubscribe");
    return values.length === 1 && values[0] === "One-Click" ? null : 400;
  } catch {
    return 400;
  }
}
