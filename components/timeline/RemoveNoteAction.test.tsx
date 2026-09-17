import { renderWithTimelineMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoveNoteAction } from "./RemoveNoteAction";

const mocks = vi.hoisted(() => ({
  removeSignalNote: vi.fn(),
}));

vi.mock("@/lib/actions/signals", () => ({ removeSignalNote: mocks.removeSignalNote }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("RemoveNoteAction", () => {
  it("localizes the confirmation while preserving the server action input", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.removeSignalNote.mockResolvedValue({ removed: true });
    render(<RemoveNoteAction projectId="prj_1" signalId="sig_1" />);

    await user.click(screen.getByRole("button", { name: "Delete timeline note" }));

    expect(confirm).toHaveBeenCalledWith("Delete this timeline note?");
    await waitFor(() =>
      expect(mocks.removeSignalNote).toHaveBeenCalledWith({
        projectId: "prj_1",
        signalId: "sig_1",
      }),
    );
  });
});
