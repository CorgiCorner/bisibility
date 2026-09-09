import { describe, expect, it, vi } from "vitest";
import { resolveExpectedUrl } from "./resolve";

const canonical = "https://example.com/canonical";
const rows = [
  { canonicalKey: "ES-es", targetUrl: canonical },
  { canonicalKey: "ES-es", targetUrl: "https://example.com/es" },
];

function resolverInput(overrides: Partial<Parameters<typeof resolveExpectedUrl>[0]> = {}) {
  return {
    allowedHosts: ["example.com"],
    canonicalRows: rows,
    defaultLocationKey: "ES-es",
    fetchDocument: vi.fn(async () => ({
      body: '<link rel="alternate" hreflang="es-ES" href="https://example.com/es/self-host" />',
      contentType: "text/html",
      url: canonical,
    })),
    logger: vi.fn(),
    row: { canonicalKey: "ES-es", countryCode: "ES", languageCode: "es", targetUrl: null },
    ...overrides,
  };
}

describe("resolveExpectedUrl", () => {
  it.each([
    [
      "explicit",
      { targetUrl: "https://example.com/explicit" },
      "https://example.com/explicit",
      "explicit",
      undefined,
    ],
    ["exact hreflang", {}, "https://example.com/es/self-host", "hreflang", undefined],
    [
      "bare language hreflang",
      {},
      "https://example.com/es/language",
      "hreflang",
      '<link rel="alternate" hreflang="es" href="https://example.com/es/language" />',
    ],
    [
      "x-default hreflang",
      {},
      "https://example.com/default",
      "hreflang",
      '<link rel="alternate" hreflang="x-default" href="https://example.com/default" />',
    ],
  ])("uses %s before canonical fallback", async (_name, row, url, source, body) => {
    const input = resolverInput({
      row: {
        canonicalKey: "ES-es",
        countryCode: "ES",
        languageCode: "es",
        targetUrl: null,
        ...row,
      },
      ...(body
        ? {
            fetchDocument: vi.fn(async () => ({
              body,
              contentType: "text/html",
              url: canonical,
            })),
          }
        : {}),
    });

    await expect(resolveExpectedUrl(input)).resolves.toEqual({ url, source });
  });

  it("falls back to the default-market target then the first target and then null", async () => {
    const noAlternate = vi.fn(async () => ({
      body: "<html />",
      contentType: "text/html",
      url: canonical,
    }));
    await expect(
      resolveExpectedUrl(resolverInput({ fetchDocument: noAlternate })),
    ).resolves.toEqual({
      source: "canonical",
      url: canonical,
    });
    await expect(
      resolveExpectedUrl(
        resolverInput({
          canonicalRows: [
            { canonicalKey: "FR-fr", targetUrl: null },
            { canonicalKey: "NL-nl", targetUrl: "https://example.com/first" },
          ],
          defaultLocationKey: "FR-fr",
          fetchDocument: noAlternate,
        }),
      ),
    ).resolves.toEqual({ source: "canonical", url: "https://example.com/first" });
    await expect(
      resolveExpectedUrl(
        resolverInput({
          canonicalRows: [{ canonicalKey: "FR-fr", targetUrl: null }],
          fetchDocument: noAlternate,
        }),
      ),
    ).resolves.toEqual({ source: null, url: null });
  });

  it("fetches a relative canonical target from the project domain", async () => {
    const fetchDocument = vi.fn(async (url: string) => ({
      body: '<link rel="alternate" hreflang="es-ES" href="https://example.com/es/self-host" />',
      contentType: "text/html",
      url,
    }));

    await expect(
      resolveExpectedUrl(
        resolverInput({
          canonicalBaseUrl: "https://example.com",
          canonicalRows: [{ canonicalKey: "ES-es", targetUrl: "/canonical" }],
          fetchDocument,
        }),
      ),
    ).resolves.toEqual({ source: "hreflang", url: "https://example.com/es/self-host" });
    expect(fetchDocument).toHaveBeenCalledWith("https://example.com/canonical");
  });

  it("rejects malformed explicit values and unallowed cross-host alternates without throwing", async () => {
    const logger = vi.fn();
    await expect(
      resolveExpectedUrl(
        resolverInput({
          fetchDocument: vi.fn(async () => ({
            body: '<link rel="alternate" hreflang="es" href="https://other.example.org/es" />',
            contentType: "text/html",
            url: canonical,
          })),
          logger,
          row: {
            canonicalKey: "ES-es",
            countryCode: "ES",
            languageCode: "es",
            targetUrl: "javascript:alert(1)",
          },
        }),
      ),
    ).resolves.toEqual({ source: "canonical", url: canonical });
    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "invalid_explicit_url" }),
    );
    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "alternate_host_not_allowed" }),
    );
  });

  it("allows an approved cross-host alternate and degrades parser failures to canonical", async () => {
    const crossHost = resolverInput({
      allowedHosts: ["example.com", "translations.example.org"],
      fetchDocument: vi.fn(async () => ({
        body: '<link rel="alternate" hreflang="es" href="https://translations.example.org/es" />',
        contentType: "text/html",
        url: canonical,
      })),
    });
    await expect(resolveExpectedUrl(crossHost)).resolves.toEqual({
      source: "hreflang",
      url: "https://translations.example.org/es",
    });
    await expect(
      resolveExpectedUrl(
        resolverInput({
          fetchDocument: vi.fn(async () => {
            throw new Error("timeout");
          }),
        }),
      ),
    ).resolves.toEqual({ source: "canonical", url: canonical });
  });
});
