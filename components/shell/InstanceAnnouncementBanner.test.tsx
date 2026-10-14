import { renderWithSharedMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { InstanceAnnouncementBanner } from "./InstanceAnnouncementBanner";

describe("instance announcement banner", () => {
  it("lets keyboard users focus the message region before its controls", async () => {
    const user = userEvent.setup();
    render(
      <InstanceAnnouncementBanner
        announcement={{ title: "Issue", message: "Investigating", href: "", linkLabel: "" }}
        defaultLinkLabel="Details"
      />,
    );
    await user.tab();
    expect(screen.getByRole("region", { name: "Issue" })).toHaveFocus();
  });
  it("pauses and resumes scrolling through an accessible button", async () => {
    const user = userEvent.setup();
    render(
      <InstanceAnnouncementBanner
        announcement={{ title: "Issue", message: "Investigating", href: "", linkLabel: "" }}
        defaultLinkLabel="Details"
      />,
    );
    const pause = screen.getByRole("button", { name: "Pause scrolling" });
    expect(pause).toHaveAttribute("aria-pressed", "false");
    await user.click(pause);
    expect(screen.getByRole("button", { name: "Resume scrolling" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("status")).toHaveAttribute("data-paused", "true");
    await user.click(screen.getByRole("button", { name: "Resume scrolling" }));
    expect(screen.getByRole("button", { name: "Pause scrolling" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("status")).not.toHaveAttribute("data-paused");
  });
  it("renders administrator text as escaped content and supplies a localized link fallback", () => {
    const { container } = render(
      <InstanceAnnouncementBanner
        announcement={{
          title: "<script>test</script>",
          message: "<img onerror=alert(1)>",
          href: "https://status.example.com",
          linkLabel: "",
        }}
        defaultLinkLabel="Details"
      />,
    );
    expect(container.querySelector("script, img")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("<img onerror=alert(1)>");
    expect(screen.getByRole("link", { name: "Details" })).toHaveAttribute(
      "href",
      "https://status.example.com",
    );
  });
  it("supports a banner without a link", () => {
    render(
      <InstanceAnnouncementBanner
        announcement={{ title: "Issue", message: "Investigating", href: "", linkLabel: "" }}
        defaultLinkLabel="Details"
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps the mobile marquee copy decorative and the link outside the moving text", () => {
    const { container } = render(
      <InstanceAnnouncementBanner
        announcement={{
          title: "Issue",
          message: "Investigating delays",
          href: "https://status.example.com",
          linkLabel: "Status",
        }}
        defaultLinkLabel="Details"
      />,
    );
    const track = container.querySelector(".bv-marquee-track");
    expect(track?.children).toHaveLength(2);
    expect(track?.lastElementChild).toHaveAttribute("aria-hidden", "true");
    expect(track).not.toContainElement(screen.getByRole("link", { name: "Status" }));
  });
});
