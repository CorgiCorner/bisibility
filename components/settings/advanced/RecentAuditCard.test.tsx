import {
  advancedSettingsFeatureTestMessages,
  renderWithAdvancedSettingsMessages as render,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import type { AuditEntry } from "@/lib/queries/audit";
import { act, screen } from "@testing-library/react";
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
  it("preloads then renders the actor image as a decorative 34px avatar", () => {
    render(
      <RecentAuditCard
        entries={[entry("https://example.com/member.png")]}
        projectId="prj_abcdefghijklmnopqrstuvwx"
      />,
    );

    const preload = document.querySelector("img");
    expect(preload).toHaveAttribute("src", "https://example.com/member.png");
    expect(screen.getByText("MU")).toHaveClass("h-8.5", "w-[34px]");

    act(() => preload?.dispatchEvent(new Event("load")));

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

  it("keeps system-category actions distinct with localized actor and time presentation", () => {
    const messages = structuredClone(advancedSettingsFeatureTestMessages);
    messages.projectSettingsAdvanced.audit.actor.system = "System usługi";
    messages.projectSettingsAdvanced.audit.event.providerConnected = "Połączono dostawcę";
    messages.projectSettingsAdvanced.audit.event.projectDefaultsUpdated =
      "Zaktualizowano ustawienia projektu";
    const providerEntry = {
      ...entry(null),
      action: "provider.connect",
      actor: { ...entry(null).actor, id: "system", name: "System" },
      eventName: "Provider connected",
      eventType: "system" as const,
      status: "failed" as const,
      statusReason: "connection offline",
    };
    const defaultsEntry = {
      ...entry(null),
      action: "project_defaults.update",
      id: "audit_defaults_abcdefghijklmnopqrstuv",
      actor: { ...entry(null).actor, id: "system", name: "System" },
      eventName: "Project defaults updated",
      eventType: "system" as const,
    };

    renderWithFeatureMessages(
      <RecentAuditCard
        entries={[providerEntry, defaultsEntry]}
        projectId="prj_abcdefghijklmnopqrstuvwx"
      />,
      {
        dateFormat: "day_first",
        locale: "pl",
        messages,
        timeZone: "Europe/Warsaw",
      },
    );

    expect(screen.getAllByText("System usługi")).toHaveLength(2);
    expect(screen.getByText("Połączono dostawcę - connection offline")).toHaveClass(
      "text-red-text",
    );
    expect(screen.getByText("Zaktualizowano ustawienia projektu")).toBeInTheDocument();
    expect(screen.getAllByText("30 sierpnia 2026, 02:00:00")).toHaveLength(2);
  });

  it("preserves skipped-occurrence schedule and planned instant with localized seconds", () => {
    const messages = structuredClone(advancedSettingsFeatureTestMessages);
    messages.projectSettingsAdvanced.audit.event.scheduledRankCheckSkippedOccurrence =
      "Pominięto wystąpienie {schedule} zaplanowane na {plannedFor}";
    const skippedEntry = {
      ...entry(null),
      action: "rank_check_run.skip",
      rankCheckRunSkip: {
        plannedFor: "2026-09-05T06:00:45.000Z",
        schedule: "Codziennie 08:00",
      },
      timestamp: "2026-09-05T06:01:07.000Z",
    };

    renderWithFeatureMessages(
      <RecentAuditCard entries={[skippedEntry]} projectId="prj_abcdefghijklmnopqrstuvwx" />,
      {
        dateFormat: "day_first",
        locale: "pl",
        messages,
        timeZone: "Europe/Warsaw",
      },
    );

    expect(
      screen.getByText(
        "Pominięto wystąpienie Codziennie 08:00 zaplanowane na 5 września 2026, 08:00:45",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("5 września 2026, 08:01:07")).toBeInTheDocument();
  });

  it("uses the stable action-code fallback instead of a generated English event name", () => {
    const messages = structuredClone(advancedSettingsFeatureTestMessages);
    messages.projectSettingsAdvanced.audit.event.unknown = "Zarejestrowane działanie: {action}";
    const futureEntry = {
      ...entry(null),
      action: "future.audit.action",
      eventName: "Future owned event",
    };

    renderWithFeatureMessages(
      <RecentAuditCard entries={[futureEntry]} projectId="prj_abcdefghijklmnopqrstuvwx" />,
      { locale: "pl", messages },
    );

    expect(screen.getByText("Zarejestrowane działanie: future.audit.action")).toBeInTheDocument();
    expect(screen.queryByText("Future owned event")).not.toBeInTheDocument();
  });
});
