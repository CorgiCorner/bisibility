import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloudBetaBanner } from "./CloudBetaBanner";
import {
  CLOUD_BETA_DISMISSAL_COOKIE,
  CLOUD_BETA_DISMISSAL_MAX_AGE_SECONDS,
  CLOUD_BETA_DISMISSAL_VALUE,
  isCloudBetaDismissed,
} from "./cloud-beta";

const mocks = vi.hoisted(() => ({
  downloadPackage: vi.fn(),
  exportPackage: vi.fn(),
  loadCounts: vi.fn(),
}));

vi.mock("@/components/settings/migration/MigrateToCloudExportPackage", () => ({
  downloadPackage: mocks.downloadPackage,
  exportActiveCloudImportPackage: mocks.exportPackage,
}));
vi.mock("@/lib/actions/cloud", () => ({
  loadCloudBackupCounts: mocks.loadCounts,
}));

const defaultProps = {
  isCloud: true,
  lastExport: null,
  now: "2026-07-25T12:00:00.000Z",
  projectId: "project_1",
  projectRef: "prj_1",
  projectName: "acme.dev",
} as const;

function clearDismissalCookie() {
  // biome-ignore lint/suspicious/noDocumentCookie: Reset the browser state between tests.
  document.cookie = `${CLOUD_BETA_DISMISSAL_COOKIE}=; path=/; max-age=0`;
}

function dismissalCookieValue() {
  const prefix = `${CLOUD_BETA_DISMISSAL_COOKIE}=`;
  return document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(prefix))
    ?.slice(prefix.length);
}

afterEach(() => {
  clearDismissalCookie();
  vi.restoreAllMocks();
});

describe("CloudBetaBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadCounts.mockResolvedValue({
      alertRules: 2,
      competitors: 3,
      keywords: 248,
      notificationPreferences: 1,
      rankChecks: 412_000,
      savedViews: 4,
    });
  });

  it("stays hidden while the project has nothing to export", () => {
    render(<CloudBetaBanner {...defaultProps} hasExportableData={false} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders the professional warning only for Cloud deployments", () => {
    const { rerender } = render(<CloudBetaBanner {...defaultProps} isCloud={false} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(mocks.loadCounts).not.toHaveBeenCalled();

    rerender(<CloudBetaBanner {...defaultProps} />);

    expect(screen.getByRole("status")).toHaveTextContent("You're on the hosted beta");
    expect(screen.getByRole("status")).toHaveTextContent("Restores aren't guaranteed yet");
    expect(screen.getByRole("status")).toHaveTextContent("keep an export");
    // The banner states one risk. A reassurance about parity with self-hosting belongs in the
    // coverage modal, not in the strip a reader sees on every page.
    expect(screen.getByRole("status")).not.toHaveTextContent("match self-hosted");
  });

  it("keeps the latest export status out of the Cloud beta banner", () => {
    render(
      <CloudBetaBanner {...defaultProps} lastExport={{ exportedAt: "2026-07-19T12:00:00.000Z" }} />,
    );

    expect(screen.queryByText(/Last export/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Never exported")).not.toBeInTheDocument();
  });

  it("keeps the banner content and quiet actions on one wrapping row", () => {
    render(<CloudBetaBanner {...defaultProps} />);

    const banner = screen.getByRole("status");
    expect(banner.parentElement).toHaveClass("@container");
    expect(banner).toHaveClass("flex", "flex-wrap", "items-center");
    const warningIcon = screen.getByTestId("cloud-beta-warning-icon");
    expect(screen.getByTestId("cloud-beta-warning-line")).toHaveClass(
      "flex",
      "h-lh",
      "items-center",
    );
    // getAttribute reads the class the same way for HTML and SVG. The `className` property is an
    // SVGAnimatedString on SVG elements, which the HTMLElement type returned by getByTestId does
    // not describe.
    expect(warningIcon.getAttribute("class") ?? "").not.toMatch(
      /(?:^|\s)(?:mt-|top-|translate-y-)[^\s]*/,
    );
    expect(screen.getByTestId("cloud-beta-content")).toHaveTextContent("You're on the hosted beta");

    const actions = within(screen.getByTestId("cloud-beta-actions"));
    expect(actions.getByRole("button", { name: "What beta covers" })).toBeInTheDocument();
    expect(actions.getByRole("button", { name: "Export data" })).toBeInTheDocument();
    expect(screen.getByTestId("cloud-beta-actions")).toHaveClass(
      "flex",
      "shrink-0",
      "items-center",
    );
  });

  it("aligns the glyph with the first line and leaves the actions unadorned", () => {
    render(<CloudBetaBanner {...defaultProps} />);

    // Glyph and message are one row item: the banner centres the pair against the taller
    // actions, while inside the pair they align to the top. Centring the glyph against the
    // message instead would drop it beside line two as soon as the sentence wraps.
    const message = screen.getByTestId("cloud-beta-content");
    const pair = message.parentElement;
    expect(pair).toHaveClass("flex", "items-start");
    expect(pair).toContainElement(screen.getByTestId("cloud-beta-warning-line"));

    // The 1px lift belongs to the wrapper and is not decoration: box-centring puts a 17px glyph
    // 1px below the cap band of 12px/1.45 text, because the font's ascent and descent are
    // asymmetric. Removing it makes the glyph sit visibly low. The glyph element itself stays
    // free of layout offsets so the correction has exactly one home.
    expect(screen.getByTestId("cloud-beta-warning-line")).toHaveClass("-translate-y-px");

    // Two quiet text actions. An icon would give one of them the weight of a primary control.
    const actions = within(screen.getByTestId("cloud-beta-actions"));
    expect(actions.getByRole("button", { name: "Export data" }).querySelector("svg")).toBeNull();
    expect(
      actions.getByRole("button", { name: "What beta covers" }).querySelector("svg"),
    ).toBeNull();
  });

  it("gives the actions their own row on a narrow banner", () => {
    render(<CloudBetaBanner {...defaultProps} />);

    // Narrow: the message owns row one and the actions take a full row beneath it, indented to
    // the message's text edge. One row again once the container reaches xl.
    const actions = screen.getByTestId("cloud-beta-actions");
    expect(actions).toHaveClass("basis-full", "@xl:basis-auto", "pl-[25px]", "@xl:pl-0");

    // Dismiss precedes the actions in the markup so it stays on row one while they wrap, and
    // only moves past them when everything fits on a single row.
    const dismiss = screen.getByRole("button", { name: "Dismiss hosted beta banner" });
    expect(dismiss).toHaveClass("@xl:order-3");
    expect(actions).toHaveClass("@xl:order-2");
    expect(
      dismiss.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("loads fresh project counts whenever the backup modal opens", async () => {
    render(<CloudBetaBanner {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "What beta covers" }));
    expect(
      screen.getByRole("dialog", { name: /What the hosted beta covers/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Export data" }));
    expect(await screen.findByRole("dialog", { name: /Export project data/i })).toBeInTheDocument();
    expect(mocks.loadCounts).toHaveBeenCalledWith({ projectId: "project_1" });
    expect(screen.getByText("Competitors").parentElement?.parentElement).toHaveTextContent("3");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /Export project data/i }),
      ).not.toBeInTheDocument(),
    );
    mocks.loadCounts.mockResolvedValueOnce({
      alertRules: 2,
      competitors: 4,
      keywords: 248,
      notificationPreferences: 1,
      rankChecks: 412_000,
      savedViews: 4,
    });
    fireEvent.click(screen.getByRole("button", { name: "Export data" }));

    await waitFor(() =>
      expect(screen.getByText("Competitors").parentElement?.parentElement).toHaveTextContent("4"),
    );
    expect(mocks.loadCounts).toHaveBeenCalledTimes(2);
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("never invokes the backup count loader on self-host", () => {
    render(<CloudBetaBanner {...defaultProps} isCloud={false} />);

    expect(screen.queryByRole("button", { name: "Export data" })).not.toBeInTheDocument();
    expect(mocks.loadCounts).not.toHaveBeenCalled();
  });

  it("dismisses for seven days and stays absent on the next render", () => {
    const cookieSetter = vi.spyOn(document, "cookie", "set");
    const { unmount } = render(<CloudBetaBanner {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss hosted beta banner" }));

    expect(cookieSetter).toHaveBeenCalledWith(
      expect.stringContaining(`${CLOUD_BETA_DISMISSAL_COOKIE}=${CLOUD_BETA_DISMISSAL_VALUE}`),
    );
    expect(cookieSetter).toHaveBeenCalledWith(
      expect.stringContaining(`max-age=${CLOUD_BETA_DISMISSAL_MAX_AGE_SECONDS}`),
    );
    expect(dismissalCookieValue()).toBe(CLOUD_BETA_DISMISSAL_VALUE);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    unmount();
    render(
      <CloudBetaBanner
        {...defaultProps}
        dismissed={isCloudBetaDismissed(dismissalCookieValue())}
      />,
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
