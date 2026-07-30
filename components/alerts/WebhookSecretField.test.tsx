import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { generateWebhookSecret, WebhookSecretField } from "./WebhookSecretField";

describe("WebhookSecretField", () => {
  it("uses 32 bytes of browser CSPRNG entropy", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.forEach((_value, index) => {
        bytes[index] = index;
      });
      return bytes;
    });

    const secret = generateWebhookSecret({ getRandomValues });

    expect(getRandomValues).toHaveBeenCalledWith(expect.any(Uint8Array));
    expect(getRandomValues.mock.calls[0]?.[0]).toHaveLength(32);
    expect(secret).toHaveLength(43);
    expect(secret).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("preserves manual entry", () => {
    const onChange = vi.fn();
    render(<WebhookSecretField fieldClassName="" labelClassName="" onChange={onChange} value="" />);

    fireEvent.change(screen.getByLabelText("HMAC secret"), {
      target: { value: "manual-secret-123456" },
    });

    expect(onChange).toHaveBeenCalledWith("manual-secret-123456");
    expect(screen.queryByRole("button", { name: "Copy secret" })).not.toBeInTheDocument();
  });

  it("reveals a generated secret once and reports copy state", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    let value = "";
    const onChange = vi.fn((next: string) => {
      value = next;
      rerender(
        <WebhookSecretField
          fieldClassName=""
          labelClassName=""
          onChange={onChange}
          value={value}
        />,
      );
    });
    const { rerender } = render(
      <WebhookSecretField fieldClassName="" labelClassName="" onChange={onChange} value={value} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    expect(screen.getByLabelText("HMAC secret")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("HMAC secret")).toHaveValue(value);
    fireEvent.click(screen.getByRole("button", { name: "Copy secret" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(value));
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();

    value = "";
    rerender(
      <WebhookSecretField fieldClassName="" labelClassName="" onChange={onChange} value={value} />,
    );
    expect(screen.queryByRole("button", { name: "Copied" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("HMAC secret")).not.toHaveAttribute("readonly");
  });
});
