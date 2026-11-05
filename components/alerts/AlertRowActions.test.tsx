import { renderWithAlertMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AlertRowActions } from "./AlertRowActions";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), mute: vi.fn() }));
vi.mock("@/lib/actions/alert-feed", () => ({
  getAlertCtaTargets: mocks.resolve,
  muteTriggeredAlert: mocks.mute,
}));

it("surfaces a failed CTA resolution", async () => {
  mocks.resolve.mockRejectedValueOnce(new Error("failed"));
  const onError = vi.fn();
  render(
    <AlertRowActions
      alertId="alert_1"
      projectId="project_1"
      keyword="keyword"
      ctas={["open_keyword"]}
      onError={onError}
      onSnooze={() => () => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /open keyword/i }));
  await waitFor(() =>
    expect(onError).toHaveBeenCalledWith("Could not open alert details. Try again."),
  );
});

function preparedPopup() {
  const popupDocument = document.implementation.createHTMLDocument("");
  const clicks: HTMLAnchorElement[] = [];
  popupDocument.addEventListener("click", (event) => {
    event.preventDefault();
    clicks.push(event.target as HTMLAnchorElement);
  });
  const popup = { close: vi.fn(), document: popupDocument, location: { href: "" }, opener: window };
  return { clicks, popup };
}

function renderSerpCta(onError = vi.fn()) {
  render(
    <AlertRowActions
      alertId="alert_1"
      projectId="project_1"
      keyword="keyword"
      ctas={["view_serp"]}
      onError={onError}
      onSnooze={() => () => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /view serp/i }));
  return onError;
}

it("opens the SERP window synchronously and navigates it without a referrer", async () => {
  let resolve!: (value: { serpUrl: string; keywordHref: string; targetUrl: null }) => void;
  mocks.resolve.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { clicks, popup } = preparedPopup();
  const open = vi.spyOn(window, "open").mockReturnValueOnce(popup as unknown as Window);
  renderSerpCta();
  expect(open).toHaveBeenCalledOnce();
  expect(popup.opener).toBeNull();
  resolve({ serpUrl: "https://example.com/serp", keywordHref: "/keyword", targetUrl: null });
  await waitFor(() => expect(clicks).toHaveLength(1));
  const link = clicks[0];
  expect(link?.getAttribute("href")).toBe("https://example.com/serp");
  expect(link?.relList.contains("noreferrer")).toBe(true);
  expect(link?.relList.contains("noopener")).toBe(true);
  expect(popup.location.href).toBe("");
  open.mockRestore();
});

it.each(["javascript:alert(1)", "data:text/html,hello", "/relative/serp"])(
  "refuses to open the non-web SERP URL %s",
  async (serpUrl) => {
    mocks.resolve.mockResolvedValueOnce({ serpUrl, keywordHref: "/keyword", targetUrl: null });
    const { clicks, popup } = preparedPopup();
    const open = vi.spyOn(window, "open").mockReturnValueOnce(popup as unknown as Window);
    const onError = renderSerpCta();
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith("Could not open alert details. Try again."),
    );
    expect(popup.close).toHaveBeenCalledOnce();
    expect(clicks).toHaveLength(0);
    expect(popup.location.href).toBe("");
    open.mockRestore();
  },
);

it("reports blocked windows without resolving targets", () => {
  mocks.resolve.mockClear();
  const onError = vi.fn();
  const open = vi.spyOn(window, "open").mockReturnValueOnce(null);
  render(
    <AlertRowActions
      alertId="alert_1"
      projectId="project_1"
      keyword="keyword"
      ctas={["view_serp"]}
      onError={onError}
      onSnooze={() => () => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /view serp/i }));
  expect(onError).toHaveBeenCalledWith("Could not open alert details. Try again.");
  expect(mocks.resolve).not.toHaveBeenCalled();
  open.mockRestore();
});

it("closes a prepared window when resolution fails", async () => {
  mocks.resolve.mockRejectedValueOnce(new Error("failed"));
  const onError = vi.fn();
  const popup = { opener: window, close: vi.fn() };
  const open = vi.spyOn(window, "open").mockReturnValueOnce(popup as unknown as Window);
  render(
    <AlertRowActions
      alertId="alert_1"
      projectId="project_1"
      keyword="keyword"
      ctas={["view_serp"]}
      onError={onError}
      onSnooze={() => () => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /view serp/i }));
  await waitFor(() =>
    expect(onError).toHaveBeenCalledWith("Could not open alert details. Try again."),
  );
  expect(popup.close).toHaveBeenCalledOnce();
  open.mockRestore();
});
