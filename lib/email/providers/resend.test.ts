import { EmailSendError } from "@/lib/email/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resendEmailProvider } from "./resend";

const { recordResendSendMock } = vi.hoisted(() => ({
  recordResendSendMock: vi.fn(),
}));

vi.mock("@/lib/email/send-counter", () => ({
  recordResendSend: recordResendSendMock,
}));

const message = {
  from: "Bisibility <reports@example.com>",
  html: "<p>Report ready</p>",
  subject: "Weekly report",
  text: "Report ready",
  to: "owner@example.com",
};

describe("resend email provider", () => {
  afterEach(() => {
    recordResendSendMock.mockReset();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("declares its catalog identity", () => {
    expect(resendEmailProvider.id).toBe("resend");
    expect(resendEmailProvider.label).toBe("Resend");
  });

  it("is configured only when RESEND_API_KEY is set", () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect(resendEmailProvider.isConfigured()).toBe(false);

    vi.stubEnv("RESEND_API_KEY", "email-key");
    expect(resendEmailProvider.isConfigured()).toBe(true);
  });

  it("posts the message to the Resend API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubEnv("RESEND_API_KEY", "email-key");
    vi.stubGlobal("fetch", fetchMock);

    await resendEmailProvider.send(message);

    expect(recordResendSendMock).toHaveBeenCalledWith(false);
    const request = fetchMock.mock.calls[0]?.[1];
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" }),
    );
    expect(request?.headers).toMatchObject({
      Authorization: "Bearer email-key",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(request?.body))).toEqual({
      from: "Bisibility <reports@example.com>",
      html: "<p>Report ready</p>",
      subject: "Weekly report",
      text: "Report ready",
      to: ["owner@example.com"],
    });
  });

  it("increments non-gated sends before transport even when sign-in capacity is exhausted", async () => {
    const order: string[] = [];
    recordResendSendMock.mockImplementation(async () => {
      order.push("count");
    });
    const fetchMock = vi.fn().mockImplementation(async () => {
      order.push("send");
      return new Response(null, { status: 202 });
    });
    vi.stubEnv("RESEND_API_KEY", "email-key");
    vi.stubGlobal("fetch", fetchMock);

    await resendEmailProvider.send(message);

    expect(order).toEqual(["count", "send"]);
  });

  it("does not double-count a transport send that reserved its sign-in slot", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubEnv("RESEND_API_KEY", "email-key");
    vi.stubGlobal("fetch", fetchMock);

    await resendEmailProvider.send({ ...message, sendCounterReserved: true });

    expect(recordResendSendMock).toHaveBeenCalledWith(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("bounds the request with a timeout signal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubEnv("RESEND_API_KEY", "email-key");
    vi.stubGlobal("fetch", fetchMock);

    await resendEmailProvider.send(message);

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("throws before any request when RESEND_API_KEY is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubGlobal("fetch", fetchMock);

    await expect(resendEmailProvider.send(message)).rejects.toThrow(
      "RESEND_API_KEY is required to send email.",
    );
    expect(recordResendSendMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces status and Retry-After when Resend rate limits", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { headers: { "Retry-After": "30" }, status: 429 }));
    vi.stubEnv("RESEND_API_KEY", "email-key");
    vi.stubGlobal("fetch", fetchMock);

    const error = await resendEmailProvider.send(message).catch((caught) => caught);

    expect(error).toBeInstanceOf(EmailSendError);
    expect(error).toMatchObject({ retryAfterSeconds: 30, status: 429 });
  });

  it("parses HTTP-date Retry-After values through the shared helper", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T07:00:00.000Z"));
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        headers: { "Retry-After": "Thu, 23 Jul 2026 07:02:00 GMT" },
        status: 429,
      }),
    );
    vi.stubEnv("RESEND_API_KEY", "email-key");
    vi.stubGlobal("fetch", fetchMock);

    const error = await resendEmailProvider.send(message).catch((caught) => caught);

    expect(error).toMatchObject({ retryAfterSeconds: 120, status: 429 });
  });

  it("surfaces a transient 5xx as a typed send error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubEnv("RESEND_API_KEY", "email-key");
    vi.stubGlobal("fetch", fetchMock);

    const error = await resendEmailProvider.send(message).catch((caught) => caught);

    expect(error).toBeInstanceOf(EmailSendError);
    expect(error).toMatchObject({ retryAfterSeconds: null, status: 503 });
    expect(error.message).toBe("Resend send failed with status 503.");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not retry non-retryable client errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
    vi.stubEnv("RESEND_API_KEY", "email-key");
    vi.stubGlobal("fetch", fetchMock);

    await expect(resendEmailProvider.send(message)).rejects.toThrow(
      "Resend send failed with status 400.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
