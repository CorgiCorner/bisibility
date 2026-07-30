import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui", () => ({
  Button: ({ children, href }: { children: ReactNode; component: "a"; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { AdminRefresh } from "./AdminRefresh";

describe("AdminRefresh", () => {
  it("uses a full navigation that resets the page stylesheet cache", () => {
    render(<AdminRefresh />);

    expect(screen.getByRole("link", { name: "Refresh" })).toHaveAttribute("href", "/app/admin");
  });
});
