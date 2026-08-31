import type { AuditEntry } from "@/lib/queries/audit";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RecentAuditCard } from "./RecentAuditCard";

function entry(avatarUrl: string | null): AuditEntry {
  return {
    actor: {
      avatarUrl,
      email: "member@example.com",
      id: "usr_abcdefghijklmnopqrstuvwx",
      initials: "MU",
      name: "Member User",
    },
    diff: [],
    eventName: "Project updated",
    eventType: "data",
    id: "audit_abcdefghijklmnopqrstuvwx",
    metadata: {
      app_version: "1.2.3",
      correlation_id: "corr_1",
      event_id: "audit_abcdefghijklmnopqrstuvwx",
      user_agent: "Vitest",
    },
    operation: "UPDATE",
    resource: { id: "prj_abcdefghijklmnopqrstuvwx", name: "Example", type: "project" },
    source: { channel: "ui", ip: "203.0.113.0" },
    status: "success",
    timestamp: "2026-08-30T00:00:00.000Z",
    timestampLabel: "2026-08-30 00:00:00 UTC",
  };
}

describe("RecentAuditCard", () => {
  it("renders the actor image as a decorative 34px avatar", () => {
    render(
      <RecentAuditCard
        entries={[entry("https://example.com/member.png")]}
        projectId="prj_abcdefghijklmnopqrstuvwx"
      />,
    );

    const image = document.querySelector("img");
    expect(image).toHaveAttribute("src", "https://example.com/member.png");
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveClass("h-8.5", "w-[34px]");
    expect(screen.queryByText("MU")).not.toBeInTheDocument();
  });

  it("shows initials when the actor image is absent or fails to load", () => {
    const { rerender } = render(
      <RecentAuditCard entries={[entry(null)]} projectId="prj_abcdefghijklmnopqrstuvwx" />,
    );

    expect(screen.getByText("MU")).toHaveClass("h-8.5", "w-[34px]");
    expect(screen.getByText("MU")).toHaveAttribute("aria-hidden", "true");
    expect(document.querySelector("img")).toBeNull();

    rerender(
      <RecentAuditCard
        entries={[entry("https://example.com/missing.png")]}
        projectId="prj_abcdefghijklmnopqrstuvwx"
      />,
    );
    const image = document.querySelector("img");
    expect(image).not.toBeNull();
    act(() => image?.dispatchEvent(new Event("error")));

    expect(screen.getByText("MU")).toHaveClass("h-8.5", "w-[34px]");
    expect(document.querySelector("img")).toBeNull();
  });
});
