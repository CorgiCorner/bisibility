import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import tracking from "@/messages/core/en/project-ai-tracking.json";
import shared from "@/messages/core/en/shared.json";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BrandNamesDrawer } from "./BrandNamesDrawer";

const messages = { ...shared, ...tracking };

function renderDrawer(
  props: Partial<Parameters<typeof BrandNamesDrawer>[0]> = {},
  preview = vi
    .fn()
    .mockResolvedValue({ answers: 2, named: 1, names: [{ count: 1, name: "Widget" }] }),
) {
  const save = vi.fn().mockResolvedValue(undefined);
  render(
    <FeatureMessagesProvider locale="en" messages={messages} timeZone="UTC">
      <BrandNamesDrawer
        canWrite
        domain="acme.example.com"
        domainSuggestion="acme.example"
        entityId="prj_abcdefghijklmnopqrstuvwx"
        entityKind="project"
        initialAliases={[]}
        initialCounts={{ answers: 2, named: 0, names: [] }}
        initialExcludedNames={["acme.example.org"]}
        keywordSuggestions={["best acme tools"]}
        label="Acme"
        onClose={vi.fn()}
        open
        preview={preview}
        previewDelayMs={0}
        save={save}
        {...props}
      />
    </FeatureMessagesProvider>,
  );
  return { preview, save };
}

it("edits names, previews the draft, and saves without offering to remove the label", async () => {
  const { preview, save } = renderDrawer();
  expect(screen.getByRole("dialog", { name: "Names for Acme" })).toBeTruthy();
  expect(screen.getByText("An answer names you when it contains any of these.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Remove Acme" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Remove acme.example.com" })).toBeNull();
  expect(screen.getByText("Named in 0 of 2 answers with these names")).toBeTruthy();
  expect(preview).not.toHaveBeenCalled();

  // The suggestion sits inside a tooltip trigger. Pointer-hover setup never settles in jsdom.
  fireEvent.click(screen.getByRole("button", { name: "best acme tools" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
    target: { value: "Widget" },
  });
  fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);
  await waitFor(() =>
    expect(screen.getByText("Named in 1 of 2 answers with these names")).toBeTruthy(),
  );
  expect(preview).toHaveBeenCalledWith(
    expect.objectContaining({ aliases: ["best acme tools", "Widget"] }),
  );

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({
      aliases: ["best acme tools", "Widget"],
      excludedNames: ["acme.example.org"],
    }),
  );
});

it("hides keyword suggestions for a competitor and shows an empty answer line", async () => {
  renderDrawer({
    domainSuggestion: null,
    entityKind: "competitor",
    initialCounts: { answers: 0, named: 0, names: [] },
    keywordSuggestions: ["best acme tools"],
    label: "Other",
  });
  expect(
    screen.getByText("An answer names this brand when it contains any of these."),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "best acme tools" })).toBeNull();
  expect(screen.getByText("No answers yet")).toBeTruthy();
  expect(screen.getByText("Re-counts past answers, no new runs")).toBeTruthy();
});

it("disables save when the project cannot be edited", () => {
  renderDrawer({ canWrite: false });
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "best acme tools" })).toBeDisabled();
});
