import { DangerousActionAccessProvider } from "@/components/admin/DangerousActionGate";
import { renderWithInstanceAdminMessages as renderMessages } from "@/i18n/test-support/render-with-feature-messages";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/lib/actions/instance-announcements", () => ({
  mutateInstanceAnnouncement: mocks.mutate,
}));

import { AdminAnnouncements } from "./AdminAnnouncements";

const first = {
  id: "168337b6-c5e8-4787-a422-07ca4f693f32",
  revision: "868ff1da-17ec-4f41-9e80-09dfb19e2bc5",
  title: "Maintenance",
  message: "Temporary issue",
  href: "https://status.example.com",
  linkLabel: "Status",
  enabled: false,
};
const second = {
  ...first,
  id: "868ff1da-17ec-4f41-9e80-09dfb19e2bc5",
  title: "Upcoming change",
  href: "",
  enabled: true,
};

describe("announcement management", () => {
  beforeEach(() => vi.resetAllMocks());
  it("rejects unsafe links in the editor without submitting or rendering a clickable preview", async () => {
    const user = userEvent.setup();
    render(<AdminAnnouncements initialAnnouncements={[]} />);
    await user.click(screen.getByRole("button", { name: "New announcement" }));
    await user.type(screen.getByLabelText("Title"), "Issue");
    await user.type(screen.getByLabelText("Message"), "Investigating");
    await user.type(screen.getByLabelText("Link URL (optional)"), "javascript:alert(1)");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Link URL (optional)")).toHaveAttribute("aria-invalid", "true");
  });
  it("shows several saved messages with independent visibility and optional links", () => {
    render(<AdminAnnouncements initialAnnouncements={[first, second]} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Show announcement: Maintenance" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("switch", { name: "Show announcement: Upcoming change" }),
    ).toBeChecked();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Status" })).toHaveAttribute("href", first.href);
  });
  it("publishes one message using its current revision", async () => {
    const user = userEvent.setup();
    mocks.mutate.mockResolvedValue({ status: "saved", announcement: { ...first, enabled: true } });
    render(<AdminAnnouncements initialAnnouncements={[first, second]} />);
    await user.click(screen.getByRole("switch", { name: "Show announcement: Maintenance" }));
    expect(mocks.mutate).toHaveBeenCalledWith({
      kind: "toggle",
      identity: { id: first.id, revision: first.revision },
      enabled: true,
    });
    expect(
      await screen.findByRole("switch", { name: "Show announcement: Maintenance" }),
    ).toBeChecked();
  });
  it("creates a prepared message and leaves it off", async () => {
    const user = userEvent.setup();
    mocks.mutate.mockResolvedValue({ status: "saved", announcement: first });
    render(<AdminAnnouncements initialAnnouncements={[]} />);
    await user.click(screen.getByRole("button", { name: "New announcement" }));
    await user.type(screen.getByLabelText("Title"), first.title);
    await user.type(screen.getByLabelText("Message"), first.message);
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.mutate).toHaveBeenCalledWith({
      kind: "create",
      content: { title: first.title, message: first.message, href: "", linkLabel: "" },
    });
    expect(await screen.findByRole("switch")).not.toBeChecked();
  });
  it("keeps edited content on a conflict and requires confirmation before deleting", async () => {
    const user = userEvent.setup();
    mocks.mutate.mockResolvedValue({ status: "conflict" });
    render(<AdminAnnouncements initialAnnouncements={[first]} />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.type(screen.getByLabelText("Message"), " updated");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Another administrator");
    expect(screen.getByLabelText("Message")).toHaveValue(`${first.message} updated`);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    mocks.mutate.mockResolvedValue({ status: "deleted", id: first.id });
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("No announcements yet.")).toBeInTheDocument();
  });
});

function render(ui: Parameters<typeof renderMessages>[0]) {
  return renderMessages(
    <DangerousActionAccessProvider allowed>{ui}</DangerousActionAccessProvider>,
  );
}
