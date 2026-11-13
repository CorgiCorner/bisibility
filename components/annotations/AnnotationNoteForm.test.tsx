import { renderWithTimelineMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AnnotationNoteForm } from "./AnnotationNoteForm";

const addSignalNote = vi.fn(async (_input: Record<string, unknown>) => ({ id: "sig_note" }));
const searchAnnotationPages = vi.fn(async (_input: Record<string, unknown>) => ({
  pages: [{ path: "/pricing", url: "https://example.com/pricing" }],
}));

vi.mock("@/lib/actions/signals", () => ({
  addSignalNote: (input: Record<string, unknown>) => addSignalNote(input),
  searchAnnotationPages: (input: Record<string, unknown>) => searchAnnotationPages(input),
}));

const now = "2026-11-10T12:00:00.000Z";

function form() {
  return <AnnotationNoteForm canCreate now={now} projectId="prj_example" timeZone="UTC" />;
}

describe("AnnotationNoteForm", () => {
  it("keeps add disabled until there is a note, then stores a past day and a page", async () => {
    const user = userEvent.setup();
    const { container } = render(form());
    const actions = container.querySelector("[data-annotation-actions]");
    expect(actions?.querySelectorAll("button[data-size='input']")).toHaveLength(3);
    const add = screen.getByRole("button", { name: "Add note" });
    expect(add).toBeDisabled();

    await user.type(screen.getByPlaceholderText(/What did you change/), "Added the FAQ");
    expect(add).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Note date" }));
    const past = screen
      .getAllByRole("button")
      .find(
        (button) =>
          button.getAttribute("aria-pressed") !== null &&
          button.getAttribute("aria-current") !== "date" &&
          !button.hasAttribute("disabled"),
      );
    expect(past).toBeDefined();
    await user.click(past as HTMLElement);

    await user.click(screen.getByRole("button", { name: "Where the note applies" }));
    await user.click(await screen.findByRole("button", { name: "/pricing" }));
    expect(screen.getByRole("button", { name: "Where the note applies" })).toHaveTextContent(
      "/pricing",
    );
    await user.click(screen.getByRole("button", { name: "Where the note applies" }));
    await user.click(screen.getByRole("button", { name: "Whole project" }));
    expect(screen.getByRole("button", { name: "Where the note applies" })).toHaveTextContent(
      "Whole project",
    );
    await user.click(screen.getByRole("button", { name: "Where the note applies" }));
    await user.click(await screen.findByRole("button", { name: "/pricing" }));

    await user.click(add);
    expect(addSignalNote).toHaveBeenCalledWith(
      expect.objectContaining({
        happenedOn: expect.stringMatching(/^2026-/),
        note: "Added the FAQ",
        url: "https://example.com/pricing",
      }),
    );
    const happenedOn = String(addSignalNote.mock.calls[0]?.[0]?.happenedOn ?? "");
    expect(happenedOn < "2026-11-10" || happenedOn === "2026-11-09").toBe(true);
    expect(happenedOn <= "2026-11-10").toBe(true);
  });
});
