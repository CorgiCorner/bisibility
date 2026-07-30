import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CloudOnboarding } from "./CloudOnboarding";

vi.mock("@/lib/actions/cloud", () => ({
  createCloudImportWorkspace: vi.fn(),
  createCloudWorkspace: vi.fn(),
}));

describe("CloudOnboarding", () => {
  it("offers a new import destination before the account has any workspace", () => {
    render(<CloudOnboarding />);

    expect(screen.getByRole("button", { name: /Create a new workspace/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Import from a self-hosted instance/ }),
    ).toBeInTheDocument();
  });
});
