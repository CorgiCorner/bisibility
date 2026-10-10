import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import { describe, expect, it, vi } from "vitest";
import {
  dataForSeoBillingStatusCode,
  dataForSeoLabsLocationParams,
  envelopeMessage,
  extractDataForSeoBalance,
  requestEnvelope,
} from "./dataforseo-client";

it("preserves a known budget refusal without issuing or retrying a paid POST", async () => {
  const denied = new DeploymentAdmissionExhaustedError("budget"),
    fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  try {
    await expect(
      requestEnvelope(
        "https://api.dataforseo.com/fixture",
        { method: "POST" },
        {
          usageObserver: { begin: vi.fn().mockRejectedValue(denied), settle: vi.fn() },
        },
      ),
    ).rejects.toBe(denied);
    expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

describe("DataForSEO task failures", () => {
  const taskFailure = {
    status_code: 20000,
    status_message: "Ok.",
    tasks: [{ status_code: 40210, status_message: "Insufficient funds" }],
  };

  it("uses a non-OK task message ahead of the successful envelope", () => {
    expect(envelopeMessage(taskFailure)).toBe("Insufficient funds");
  });

  it("classifies task status 40210 as billing", () => {
    expect(dataForSeoBillingStatusCode(taskFailure)).toBe(40210);
  });

  it("falls back to the envelope when failed tasks have no message", () => {
    expect(
      envelopeMessage({
        status_code: 40000,
        status_message: "Envelope failed",
        tasks: [{ status_code: 40501, status_message: "  " }],
      }),
    ).toBe("Envelope failed");
  });
});

describe("DataForSEO Labs location parameters", () => {
  it("uses the country handle while preserving the selected language", () => {
    expect(
      dataForSeoLabsLocationParams({
        gl: "es",
        hl: "ca",
        primaryGeoCode: 12_345,
        primaryGeoName: "Barcelona, Spain",
        secondaryGeoName: "Barcelona, Catalonia, Spain",
      }),
    ).toEqual({ language_code: "ca", location_name: "Spain" });
  });
});

describe("DataForSEO balance extraction", () => {
  it("reads the nested money balance returned by user_data", () => {
    expect(
      extractDataForSeoBalance({ tasks: [{ result: [{ money: { balance: 41.2, total: 100 } }] }] }),
    ).toBe(41.2);
  });

  it("keeps compatibility with direct balance shapes", () => {
    expect(extractDataForSeoBalance({ tasks: [{ result: [{ balance: 12.5 }] }] })).toBe(12.5);
    expect(extractDataForSeoBalance({ balance: 8.75 })).toBe(8.75);
  });
});

describe("DataForSEO account verification receipts", () => {
  it.each([0, 0.002, undefined])(
    "preserves receipt cost %s for numeric account failures",
    async (cost) => {
      const fetchMock = vi.fn().mockResolvedValue(
        Response.json({
          ...(cost === undefined ? {} : { cost }),
          status_code: 20000,
          tasks: [{ status_code: 20000 }, { status_code: 40104 }],
        }),
      );
      vi.stubGlobal("fetch", fetchMock);
      try {
        await expect(
          requestEnvelope("https://api.dataforseo.com/fixture", { method: "POST" }, {}),
        ).rejects.toMatchObject({
          code: "provider_account_restricted",
          costCents: cost === undefined ? null : cost * 100,
        });
        expect(fetchMock).toHaveBeenCalledOnce();
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it("settles the failed zero-cost request once before rejecting without retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ cost: 0, status_code: 40104 }));
    const observer = { begin: vi.fn().mockResolvedValue("attempt_fixture"), settle: vi.fn() };
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(
        requestEnvelope(
          "https://api.dataforseo.com/fixture",
          { method: "POST" },
          { usageObserver: observer },
        ),
      ).rejects.toMatchObject({ code: "provider_account_restricted", costCents: 0 });
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(observer.begin).toHaveBeenCalledOnce();
      expect(observer.settle).toHaveBeenCalledExactlyOnceWith(
        "attempt_fixture",
        expect.objectContaining({ failed: true, costCents: 0, quantity: 1 }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
