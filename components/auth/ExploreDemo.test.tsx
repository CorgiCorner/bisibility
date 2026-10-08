import { EditableDemoLogin } from "@/components/auth/EditableDemoLogin";
import { ExploreDemo } from "@/components/auth/ExploreDemo";
import {
  authFeatureTestMessages,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), assign: vi.fn() }));
vi.mock("@/lib/auth/client", () => ({ authClient: { $fetch: mocks.fetch } }));

const nextPath = "/app/prj_example/keyword-research?seed=ai%20tools%20directory";
const serverUrl = "/app/prj_example/dashboard";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("location", { assign: mocks.assign, origin: "https://demo.example.com" });
  mocks.fetch.mockResolvedValue({ data: { url: serverUrl }, error: null });
});
afterEach(() => vi.unstubAllGlobals());

describe.each([
  { name: "ExploreDemo", Component: ExploreDemo },
  { name: "EditableDemoLogin", Component: EditableDemoLogin },
])("$name redirects", ({ Component }) => {
  async function explore(path?: string | null) {
    renderWithFeatureMessages(<Component nextPath={path} />, {
      messages: authFeatureTestMessages,
    });
    await userEvent.setup().click(screen.getByRole("button", { name: "Explore demo" }));
  }

  it("uses a validated next path after successful demo sign-in", async () => {
    await explore(nextPath);
    await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith(nextPath));
    expect(mocks.fetch).toHaveBeenCalledWith("/demo/sign-in", {
      method: "POST",
      body: { code: "000000" },
    });
  });

  it.each([undefined, null, "//evil.example.com"])(
    "keeps the server landing for next %j",
    async (path) => {
      await explore(path);
      await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith(serverUrl));
    },
  );

  it("keeps an OAuth redirect even with a valid next path", async () => {
    const oauthUrl = "https://auth.example.org/authorize";
    mocks.fetch.mockResolvedValue({ data: { url: oauthUrl, redirect: true }, error: null });
    await explore(nextPath);
    await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith(oauthUrl));
  });

  it("shows an error without navigating for a non-app server URL", async () => {
    mocks.fetch.mockResolvedValue({ data: { url: "/login" }, error: null });
    await explore(nextPath);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      authFeatureTestMessages.auth.demo.error,
    );
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Explore demo" })).toBeEnabled();
  });

  it("keeps response errors from navigating", async () => {
    mocks.fetch.mockResolvedValue({ data: { url: serverUrl }, error: { message: "failed" } });
    await explore(nextPath);
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(mocks.assign).not.toHaveBeenCalled();
  });
});
