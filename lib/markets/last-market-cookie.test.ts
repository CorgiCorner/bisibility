import { isPublicIdOfType } from "@/lib/db/public-id";
import { describe, expect, it, vi } from "vitest";
import {
  LAST_MARKET_COOKIE_OPTIONS,
  lastMarketCookieName,
  lastMarketCookieWrite,
} from "./last-market-cookie";

const PROJECT_REF = `prj_${"a".repeat(24)}`;
const OTHER_PROJECT_REF = `prj_${"b".repeat(24)}`;
const MARKET_REF = `pmkt_${"c".repeat(24)}`;
const COOKIE_NAME = `bv_last_market_${PROJECT_REF}`;

/** No cookie on the request, which is the state every "does it write" case starts from. */
const noCookie = () => undefined;

function write(pathname: string, method = "GET", stored?: Record<string, string>) {
  return lastMarketCookieWrite({
    method,
    pathname,
    readCookie: (name) => stored?.[name],
  });
}

describe("last-market cookie", () => {
  it("keeps the remembered market for this session only", () => {
    expect(LAST_MARKET_COOKIE_OPTIONS).not.toHaveProperty("expires");
    expect(LAST_MARKET_COOKIE_OPTIONS).not.toHaveProperty("maxAge");
  });

  it("keys the cookie by project so each project remembers its own market", () => {
    expect(lastMarketCookieName(PROJECT_REF)).toBe(COOKIE_NAME);
    expect(lastMarketCookieName(PROJECT_REF)).not.toBe(lastMarketCookieName(OTHER_PROJECT_REF));
  });

  it("writes on a request that renders a market route", () => {
    expect(write(`/app/${PROJECT_REF}/m/${MARKET_REF}/rank-tracker`)).toEqual({
      name: COOKIE_NAME,
      value: MARKET_REF,
    });
    expect(write(`/app/${PROJECT_REF}/m/${MARKET_REF}/rank-tracker`, "HEAD")).toEqual({
      name: COOKIE_NAME,
      value: MARKET_REF,
    });
  });

  it("replaces a value that names a different market", () => {
    expect(
      write(`/app/${PROJECT_REF}/m/${MARKET_REF}/rank-tracker`, "GET", {
        [COOKIE_NAME]: `pmkt_${"d".repeat(24)}`,
      }),
    ).toEqual({ name: COOKIE_NAME, value: MARKET_REF });
  });

  it("writes nothing when the stored value is already this market, so the response stays cacheable", () => {
    expect(
      write(`/app/${PROJECT_REF}/m/${MARKET_REF}/rank-tracker`, "GET", {
        [COOKIE_NAME]: MARKET_REF,
      }),
    ).toBeNull();
  });

  it("reads the cookie keyed by this project and no other", () => {
    const readCookie = vi.fn(noCookie);
    lastMarketCookieWrite({
      method: "GET",
      pathname: `/app/${PROJECT_REF}/m/${MARKET_REF}/rank-tracker`,
      readCookie,
    });

    expect(readCookie).toHaveBeenCalledWith(COOKIE_NAME);
  });

  it("writes nothing for a URL the app redirects out of", () => {
    // Each of these is served at the project level, so the market segment the reader sent is a
    // URL they never see. Remembering it would let it steer their next `~`.
    expect(write(`/app/${PROJECT_REF}/m/${MARKET_REF}/settings/tracking`)).toBeNull();
    expect(write(`/app/${PROJECT_REF}/m/${MARKET_REF}/competitors`)).toBeNull();
    expect(write(`/app/${PROJECT_REF}/m/${MARKET_REF}/rank-tracker/kw_1`)).toBeNull();
    expect(write(`/app/${PROJECT_REF}/m/${MARKET_REF}/not-a-page`)).toBeNull();
    expect(write(`/app/${PROJECT_REF}/m/${MARKET_REF}`)).toBeNull();
  });

  it("writes nothing outside a market route", () => {
    expect(write(`/app/${PROJECT_REF}/rank-tracker`)).toBeNull();
    expect(write(`/app/${PROJECT_REF}/~/rank-tracker`)).toBeNull();
    expect(write(`/app/${PROJECT_REF}/e/gpt/ai-citations`)).toBeNull();
    expect(write("/app/account/security")).toBeNull();
  });

  it("writes nothing for a method that is not a navigation", () => {
    expect(write(`/app/${PROJECT_REF}/m/${MARKET_REF}/rank-tracker`, "POST")).toBeNull();
  });

  it("refuses path segments that are not public ids, because both reach a Set-Cookie header", () => {
    expect(write(`/app/prj_a b/m/${MARKET_REF}/rank-tracker`)).toBeNull();
    expect(write(`/app/${PROJECT_REF}/m/evil;value/rank-tracker`)).toBeNull();
    expect(write(`/app/${PROJECT_REF}/m/loc_frankfurt/rank-tracker`)).toBeNull();
  });

  it("agrees with the canonical public-id parser it deliberately does not import", () => {
    const accepted = [
      [PROJECT_REF, "prj"],
      [MARKET_REF, "pmkt"],
    ] as const;
    const rejected = [
      ["prj_short", "prj"],
      ["pmkt_UPPER0000000000000000000", "pmkt"],
      ["evil;value", "pmkt"],
      ["loc_frankfurt", "pmkt"],
    ] as const;

    for (const [value, prefix] of accepted) {
      expect(isPublicIdOfType(value, prefix)).toBe(true);
    }
    for (const [value, prefix] of rejected) {
      expect(isPublicIdOfType(value, prefix)).toBe(false);
    }
    // The middleware-side predicate must reach the same verdicts as the parser above.
    expect(write(`/app/${PROJECT_REF}/m/${MARKET_REF}/rank-tracker`)).not.toBeNull();
    expect(write("/app/prj_short/m/pmkt_x/rank-tracker")).toBeNull();
    expect(write(`/app/${PROJECT_REF}/m/pmkt_UPPER0000000000000000000/rank-tracker`)).toBeNull();
  });
});
