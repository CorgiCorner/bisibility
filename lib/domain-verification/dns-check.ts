import { timingSafeEqual } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import type { CheckResult } from "./model";

export async function checkDnsProof(
  domain: string,
  token: string,
  resolve: (host: string) => Promise<string[][]> = resolveTxt,
  timeoutMs = 5_000,
): Promise<CheckResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expected = Buffer.from(`bisibility-site-verification=${token}`);
  try {
    return await Promise.race([
      resolve(`_bisibility.${domain}`).then(
        (records): CheckResult =>
          records.some((chunks) => {
            const value = Buffer.from(chunks.join(""));
            return value.length === expected.length && timingSafeEqual(value, expected);
          })
            ? "verified"
            : "missing",
      ),
      new Promise<CheckResult>((resolve) => {
        timer = setTimeout(() => resolve("timeout"), timeoutMs);
      }),
    ]);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      ["ENOTFOUND", "ENODATA"].includes(String(error.code))
    )
      return "missing";
    // Resolver errors can contain the query or token; persist only a fixed result.
    return "unavailable";
  } finally {
    clearTimeout(timer);
  }
}
