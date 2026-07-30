import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebhookEndpointEditor } from "./WebhookEndpointEditor";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

describe("WebhookEndpointEditor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the active guard and renders handled validation failures", async () => {
    const action = vi.fn().mockResolvedValue({
      error: "Enter a valid HTTP or HTTPS webhook URL.",
      ok: false,
    });
    render(
      <WebhookEndpointEditor
        action={action}
        allowPrivateNetwork={false}
        endpoints={[]}
        projectId="prj_1"
      />,
    );

    expect(screen.getByText(/private and loopback destinations are blocked/i)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Endpoint URL" }), {
      target: { value: "not-a-url" },
    });
    fireEvent.change(screen.getByLabelText("HMAC secret"), {
      target: { value: "1234567890123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save enabled endpoint" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a valid HTTP or HTTPS webhook URL.",
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("explains events, fan-out, and write-only encryption before saving", async () => {
    const action = vi.fn().mockResolvedValue({ id: "endpoint_2", ok: true });
    render(
      <WebhookEndpointEditor
        action={action}
        allowPrivateNetwork
        endpoints={[
          {
            description: null,
            enabled: true,
            id: "endpoint_1",
            url: "https://example.com/existing",
          },
        ]}
        projectId="prj_1"
      />,
    );

    expect(
      screen.getByText(/alert\.fired, alert\.digest, and alert\.daily_cap_reached/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/every enabled endpoint in this project receives/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/encrypted at rest, write-only, and cannot be read back/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/allows private and loopback destinations/i)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Endpoint URL" }), {
      target: { value: "https://example.com/new" },
    });
    fireEvent.change(screen.getByLabelText("HMAC secret"), {
      target: { value: "1234567890123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save enabled endpoint" }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(action).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        projectId: "prj_1",
        url: "https://example.com/new",
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Saved enabled endpoint https://example.com/new.",
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("shows HTTP status and latency for a successful test", async () => {
    const testAction = vi.fn().mockResolvedValue({ latencyMs: 14, ok: true, status: 204 });
    render(
      <WebhookEndpointEditor
        action={vi.fn()}
        allowPrivateNetwork
        endpoints={[
          {
            description: null,
            enabled: true,
            id: "endpoint_1",
            url: "https://example.com/success",
          },
        ]}
        projectId="prj_1"
        testAction={testAction}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Send test event" }));

    expect(await screen.findByRole("status")).toHaveTextContent("HTTP 204 in 14 ms.");
    expect(testAction).toHaveBeenCalledWith({ endpointId: "endpoint_1", projectId: "prj_1" });
  });

  it("shows HTTP status, latency, and reason for a failed test", async () => {
    const testAction = vi.fn().mockResolvedValue({
      error: "Webhook endpoint_1 failed with status 500.",
      latencyMs: 21,
      ok: false,
      status: 500,
    });
    render(
      <WebhookEndpointEditor
        action={vi.fn()}
        allowPrivateNetwork
        endpoints={[
          {
            description: null,
            enabled: true,
            id: "endpoint_1",
            url: "https://example.com/fail",
          },
        ]}
        projectId="prj_1"
        testAction={testAction}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Send test event" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "HTTP 500 in 21 ms: Webhook endpoint_1 failed with status 500.",
    );
  });
});
