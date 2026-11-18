import type { ToolCallView } from "@/lib/assistant/wire";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToolCard } from "./ToolCard";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/ui/useLiveNow", () => ({ useLiveNow: () => "2026-01-01T00:00:00Z" }));
const proposal: ToolCallView = {
  id: "t",
  toolName: "test",
  title: "Check",
  category: "paid",
  status: "proposed",
  summary: "Check this",
  target: null,
  argsPreview: [],
  maxCostCents: 10,
  estimatedCostCents: 5,
  toolFunding: "SEO credits",
  expiresAt: "2026-01-02T00:00:00Z",
  argsHash: "a".repeat(64),
  result: null,
  error: null,
};

describe("ToolCard", () => {
  it("sends one decision when clicked twice before the request completes", () => {
    const decide = vi.fn(() => new Promise<void>(() => {}));
    render(<ToolCard call={proposal} decide={decide} />);
    const approve = screen.getByRole("button", { name: "approve" });
    fireEvent.click(approve);
    fireEvent.click(approve);
    expect(decide).toHaveBeenCalledOnce();
    expect(decide).toHaveBeenCalledWith(proposal, "approve");
    expect(screen.getByText(/statuses\.proposed/)).toBeTruthy();
  }, 30000);
});
