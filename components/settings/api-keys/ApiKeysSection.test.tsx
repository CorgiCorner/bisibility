import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiKeysSection } from "./ApiKeysSection";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const apiKeys = [
  {
    createdLabel: "created today",
    expiresLabel: "expires Oct 24, 2026",
    id: "key_1",
    isExpired: false,
    lastUsedLabel: "never used",
    maskedValue: "bsb_key_live_abc123******",
    name: "Production",
  },
];

describe("ApiKeysSection", () => {
  it("exposes the settings deep-link anchor", () => {
    const { container } = render(<ApiKeysSection apiKeys={apiKeys} projectId="prj_1" />);

    expect(container.querySelector("section#api-keys")).toBeInTheDocument();
  });

  it("does not expose stored prefixes through copy controls", () => {
    render(<ApiKeysSection apiKeys={apiKeys} projectId="prj_1" />);

    expect(screen.queryByText("Revealed once")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /copy production key prefix/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /copy/i })).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /create key/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /roll production key/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /revoke production key/i }),
    ).not.toBeInTheDocument();
  });

  it("copies the full plaintext key from the one-time creation reveal", async () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    const issueKey = vi.fn(async () => ({
      expiresInDays: 90 as const,
      maskedValue: "bsb_key_live_fullsecret******9abc",
      name: "Automation",
      raw: "bsb_key_live_fullsecret_9abc",
      scope: "write" as const,
    }));

    render(<ApiKeysSection apiKeys={apiKeys} issueKey={issueKey} projectId="prj_1" />);

    fireEvent.click(screen.getByRole("button", { name: /create key/i }));
    fireEvent.change(await screen.findByLabelText("Key name"), {
      target: { value: "Automation" },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^create key$/i })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: /^create key$/i }));

    await waitFor(() =>
      expect(issueKey).toHaveBeenCalledWith({
        expiresInDays: 90,
        name: "Automation",
        projectId: "prj_1",
        scope: "write",
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Copy Automation key" }));

    expect(screen.getByText("Revealed once")).toBeInTheDocument();
    expect(screen.getByText(/Access: Read and write/)).toBeInTheDocument();
    expect(screen.getByText(/Expires: 90 days/)).toBeInTheDocument();
    expect(screen.getByText(/secret manager/i)).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith("bsb_key_live_fullsecret_9abc");

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: /create key/i }));
    expect(screen.queryByText("bsb_key_live_fullsecret_9abc")).not.toBeInTheDocument();
  });

  it("opens focused, gated, and with the required policy defaults and warnings", async () => {
    render(<ApiKeysSection apiKeys={apiKeys} issueKey={vi.fn()} projectId="prj_1" />);

    fireEvent.click(screen.getByRole("button", { name: /create key/i }));
    const name = await screen.findByLabelText("Key name");

    await waitFor(() => expect(name).toHaveFocus());
    expect(name).toHaveValue("");
    expect(screen.getByRole("button", { name: /^create key$/i })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Read and write/i })).toBeChecked();
    expect(screen.getByRole("button", { name: "90 days" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("radio", { name: /Full access/i }));
    expect(screen.getByText(/perform admin operations/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Read only/i }));
    expect(screen.queryByText(/perform admin operations/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "No expiry" }));
    expect(screen.getByText(/never expires/i)).toBeInTheDocument();
    fireEvent.change(name, { target: { value: "Automation" } });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^create key$/i })).toBeEnabled(),
    );
  });

  it("marks expired keys while retaining lifecycle actions", () => {
    render(
      <ApiKeysSection
        apiKeys={[
          {
            ...apiKeys[0],
            expiresLabel: "expired Jul 25, 2026",
            isExpired: true,
          },
        ]}
        projectId="prj_1"
        regenerateKey={vi.fn()}
        revokeKey={vi.fn()}
      />,
    );

    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.getByText(/expired Jul 25, 2026/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Roll Production key/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Revoke Production key/i })).toBeEnabled();
  });

  it("rolls a key through a two-step in-app modal", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const regenerateKey = vi.fn(async () => ({
      expiresInDays: 90 as const,
      maskedValue: "bsb_key_live_replaced******7890",
      name: "Production",
      raw: "bsb_key_live_replaced_secret_7890",
      scope: "write" as const,
    }));
    render(<ApiKeysSection apiKeys={apiKeys} projectId="prj_1" regenerateKey={regenerateKey} />);

    fireEvent.click(screen.getByRole("button", { name: /Roll Production key/i }));

    expect(confirm).not.toHaveBeenCalled();
    const rollModal = within(screen.getByRole("dialog"));
    expect(rollModal.getByRole("heading", { name: "Roll API key" })).toBeInTheDocument();
    expect(rollModal.getByText("bsb_key_live_abc123******")).toBeInTheDocument();
    expect(rollModal.getByText("created today")).toBeInTheDocument();
    expect(rollModal.getByText("never used")).toBeInTheDocument();
    expect(rollModal.getByText(/stops working immediately/i)).toBeInTheDocument();
    expect(rollModal.getByText(/returns 401/i)).toBeInTheDocument();
    expect(rollModal.getByText(/integrations.*fail until/i)).toBeInTheDocument();
    expect(rollModal.queryByText(/grace period/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Roll key" }));

    await waitFor(() =>
      expect(regenerateKey).toHaveBeenCalledWith({
        apiKeyId: "key_1",
        projectId: "prj_1",
      }),
    );
    expect(await screen.findByText(/old key was revoked and now returns 401/i)).toBeInTheDocument();
    expect(screen.getByText("bsb_key_live_replaced_secret_7890")).toBeInTheDocument();
  });
});
