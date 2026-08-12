import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebhookEndpointRow } from "./WebhookEndpointRow";

const endpoint = {
  description: "Primary sink",
  enabled: true,
  id: "we_abcdefghijklmnopqrstuvwx",
  url: "https://example.com/original",
};

describe("WebhookEndpointRow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("edits URL, description, enabled state, and rotates the secret", async () => {
    const upsertAction = vi.fn().mockResolvedValue({ id: endpoint.id, ok: true });
    render(
      <WebhookEndpointRow
        endpoint={endpoint}
        projectId="prj_abcdefghijklmnopqrstuvwx"
        upsertAction={upsertAction}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "URL" }), {
      target: { value: "https://example.com/updated" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Description" }), {
      target: { value: "Updated sink" },
    });
    fireEvent.change(screen.getByLabelText("New HMAC secret (optional)"), {
      target: { value: "test-secret-test-secret" },
    });
    fireEvent.click(screen.getByRole("switch", { name: "Enabled" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(upsertAction).toHaveBeenCalledOnce());
    expect(upsertAction).toHaveBeenCalledWith({
      description: "Updated sink",
      enabled: false,
      endpointId: "we_abcdefghijklmnopqrstuvwx",
      hmacSecret: "test-secret-test-secret",
      projectId: "prj_abcdefghijklmnopqrstuvwx",
      url: "https://example.com/updated",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Endpoint updated.");
  });

  it("disables and re-enables through the scoped update action", async () => {
    const upsertAction = vi.fn().mockResolvedValue({ id: endpoint.id, ok: true });
    const { rerender } = render(
      <WebhookEndpointRow
        endpoint={endpoint}
        projectId="prj_abcdefghijklmnopqrstuvwx"
        upsertAction={upsertAction}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Disable" }));
    await waitFor(() =>
      expect(upsertAction).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
          endpointId: "we_abcdefghijklmnopqrstuvwx",
        }),
      ),
    );

    rerender(
      <WebhookEndpointRow
        endpoint={{ ...endpoint, enabled: false }}
        projectId="prj_abcdefghijklmnopqrstuvwx"
        upsertAction={upsertAction}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Enable" }));
    await waitFor(() =>
      expect(upsertAction).toHaveBeenLastCalledWith(
        expect.objectContaining({
          enabled: true,
          endpointId: "we_abcdefghijklmnopqrstuvwx",
        }),
      ),
    );
  });

  it("requires confirmation before deletion", async () => {
    const deleteAction = vi.fn().mockResolvedValue({ id: endpoint.id, ok: true });
    render(
      <WebhookEndpointRow
        deleteAction={deleteAction}
        endpoint={endpoint}
        projectId="prj_abcdefghijklmnopqrstuvwx"
        upsertAction={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(deleteAction).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Delete webhook endpoint" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete endpoint" }));
    await waitFor(() =>
      expect(deleteAction).toHaveBeenCalledWith({
        endpointId: "we_abcdefghijklmnopqrstuvwx",
        projectId: "prj_abcdefghijklmnopqrstuvwx",
      }),
    );
  });

  it("surfaces a deletion failure without an uncaught rejection", async () => {
    const deleteAction = vi.fn().mockRejectedValue(new Error("offline"));
    render(
      <WebhookEndpointRow
        deleteAction={deleteAction}
        endpoint={endpoint}
        projectId="prj_abcdefghijklmnopqrstuvwx"
        upsertAction={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete endpoint" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Webhook endpoint could not be deleted.",
    );
  });

  it("renders last delivery and recent endpoint attempts", () => {
    render(
      <WebhookEndpointRow
        endpoint={{
          ...endpoint,
          deliveryAttempts: [
            {
              attemptedAt: "2026-07-25T12:01:00.000Z",
              error: "Webhook failed with status 500.",
              event: "alert.fired",
              status: "failed",
            },
            {
              attemptedAt: "2026-07-25T12:00:00.000Z",
              error: null,
              event: "alert.fired",
              status: "sent",
            },
          ],
          lastDeliveryAt: "2026-07-25T12:00:00.000Z",
        }}
        projectId="prj_abcdefghijklmnopqrstuvwx"
        upsertAction={vi.fn()}
      />,
    );

    expect(screen.getByText(/last successful delivery/i)).toBeInTheDocument();
    expect(screen.getByText("alert.fired failed")).toBeInTheDocument();
    expect(screen.getByText("alert.fired sent")).toBeInTheDocument();
    expect(screen.getByText("Webhook failed with status 500.")).toBeInTheDocument();
  });

  it("renders the exact empty history state", () => {
    render(
      <WebhookEndpointRow
        endpoint={endpoint}
        projectId="prj_abcdefghijklmnopqrstuvwx"
        upsertAction={vi.fn()}
      />,
    );

    expect(screen.getByText("No deliveries yet")).toBeInTheDocument();
  });
});
