import type { NewRuleForm } from "@/lib/alerts/new-rule-data";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { DeliveryChannelsField } from "./DeliveryChannelsField";

function FormHarness({
  channels,
  onSubmit,
}: Readonly<{
  channels: NewRuleForm["channels"];
  onSubmit: (values: NewRuleForm) => void;
}>) {
  const form = useForm<NewRuleForm>({ defaultValues: { channels } });
  const currentChannels = form.watch("channels") ?? [];

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <DeliveryChannelsField register={form.register} setValue={form.setValue} watch={form.watch} />
      <output aria-label="Channels value">{currentChannels.join(",")}</output>
      <button type="submit">Save</button>
    </form>
  );
}

describe("DeliveryChannelsField", () => {
  it("marks Slack disabled with the API-only preview tooltip", () => {
    render(<FormHarness channels={[]} onSubmit={vi.fn()} />);

    expect(screen.getByRole("checkbox", { name: "Slack" })).toBeDisabled();
    expect(
      screen.getByLabelText("Slack API-only preview - dashboard setup not available"),
    ).toBeInTheDocument();
  });

  it("does not change channels when the Slack checkbox is clicked", () => {
    render(<FormHarness channels={["email"]} onSubmit={vi.fn()} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Slack" }));

    expect(screen.getByLabelText("Channels value")).toHaveTextContent("email");
  });

  it("preserves pre-checked Slack through an edit submission", async () => {
    const onSubmit = vi.fn();
    render(<FormHarness channels={["slack"]} onSubmit={onSubmit} />);

    expect(screen.getByRole("checkbox", { name: "Slack" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ channels: ["slack"] }));
  });
});
