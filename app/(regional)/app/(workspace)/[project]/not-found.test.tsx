import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolveRegionalDocumentLocale: vi.fn() }));

vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.resolveRegionalDocumentLocale,
}));

import sharedMessages from "@/messages/core/en/shared.json";
import ProjectItemNotFound from "./not-found";

describe("ProjectItemNotFound", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveRegionalDocumentLocale.mockResolvedValue({
      locale: "en",
      messages: sharedMessages,
      timeZone: "UTC",
    });
  });

  // The project layout has already authorized the viewer by the time this boundary renders, so
  // the app-level "unknown project or not a member" copy would state two things that are false.
  it("does not blame project membership for a missing item inside a readable project", async () => {
    render(await ProjectItemNotFound());

    expect(screen.getByText(sharedMessages.shared.projectItemNotFound.pageTitle)).toBeVisible();
    expect(screen.getByText(sharedMessages.shared.projectItemNotFound.description)).toBeVisible();
    expect(screen.queryByText(sharedMessages.shared.appNotFound.description)).toBeNull();
    expect(
      screen.queryByRole("link", {
        name: sharedMessages.shared.appNotFound.signInDifferentAccount,
      }),
    ).toBeNull();
  });

  it("offers the project list as the only recovery link", async () => {
    render(await ProjectItemNotFound());

    expect(
      screen.getByRole("link", {
        name: sharedMessages.shared.projectItemNotFound.backToProjects,
      }),
    ).toHaveAttribute("href", "/app");
  });
});
