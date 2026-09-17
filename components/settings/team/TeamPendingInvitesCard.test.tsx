import { TeamPendingInvitesCard } from "@/components/settings/team/TeamPendingInvitesCard";
import {
  renderWithTeamSettingsMessages as render,
  renderWithFeatureMessages,
  teamSettingsFeatureTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import type { PendingInviteData } from "@/lib/queries/team";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

const invite: PendingInviteData = {
  email: "teammate@example.com",
  expiresAt: "2026-09-16T10:00:00.000Z",
  expiresLabel: "expires in 3d",
  expired: false,
  id: "inv_example",
  invitedAt: "2026-09-12T10:00:00.000Z",
  invitedByLabel: "Owner Example (owner@example.com)",
  invitedLabel: "invited 1d ago",
  role: "Editor",
  roleValue: "member",
};

const nonEnglishPendingMessages = {
  ...teamSettingsFeatureTestMessages,
  projectSettingsTeam: {
    ...teamSettingsFeatureTestMessages.projectSettingsTeam,
    pending: {
      ...teamSettingsFeatureTestMessages.projectSettingsTeam.pending,
      resend: "Wyślij ponownie",
      title: "Oczekujące zaproszenia",
      expiresIn:
        "{unit, select, hour {wygasa za {count, plural, one {# godzinę} few {# godziny} many {# godzin} other {# godziny}}} day {wygasa za {count, plural, one {# dzień} few {# dni} many {# dni} other {# dni}}} other {wygasa wkrótce}}",
      expiredAgo:
        "{unit, select, hour {wygasło {count, plural, one {# godzinę} few {# godziny} many {# godzin} other {# godziny}} temu} day {wygasło {count, plural, one {# dzień} few {# dni} many {# dni} other {# dni}} temu} other {wygasło}}",
      invitedAgo:
        "{unit, select, hour {zaproszono {count, plural, one {# godzinę} few {# godziny} many {# godzin} other {# godziny}} temu} day {zaproszono {count, plural, one {# dzień} few {# dni} many {# dni} other {# dni}} temu} other {zaproszono}}",
    },
  },
};

function cardProps(overrides: Partial<ComponentProps<typeof TeamPendingInvitesCard>> = {}) {
  return {
    canManageTeam: true,
    invites: [invite],
    now: "2026-09-13T10:00:00.000Z",
    projectId: "prj_example",
    resendInvite: vi.fn().mockResolvedValue({}),
    revokeInvite: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

describe("TeamPendingInvitesCard", () => {
  it("resends the exact pending invite identity and reports success", async () => {
    const user = userEvent.setup();
    const props = cardProps();
    render(<TeamPendingInvitesCard {...props} />);

    await user.click(screen.getByRole("button", { name: "Resend" }));

    expect(props.resendInvite).toHaveBeenCalledWith({
      inviteId: "inv_example",
      projectId: "prj_example",
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "A new invitation was sent to teammate@example.com.",
    );
  });

  it("maps a known invite failure and does not leak the raw server message", async () => {
    const user = userEvent.setup();
    const props = cardProps({
      resendInvite: vi
        .fn()
        .mockRejectedValue(
          new Error("Too many invitations have been sent. Try again in 10 minutes."),
        ),
    });
    render(<TeamPendingInvitesCard {...props} />);

    await user.click(screen.getByRole("button", { name: "Resend" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many invitations have been sent. Try again in 10 minutes.",
    );
  });

  it("uses injected non-English copy while retaining the email and mutation guard", () => {
    renderWithFeatureMessages(
      <TeamPendingInvitesCard {...cardProps({ canManageTeam: false, readOnly: true })} />,
      { messages: nonEnglishPendingMessages },
    );

    expect(screen.getByRole("region", { name: "Oczekujące zaproszenia" })).toBeVisible();
    expect(screen.getByText("teammate@example.com")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Wyślij ponownie" })).not.toBeInTheDocument();
  });

  it("uses whole localized relative clauses with the real Polish plural categories", () => {
    const oneHourInvite: PendingInviteData = {
      ...invite,
      email: "one-hour@example.com",
      expiresAt: "2026-09-13T11:00:00.000Z",
      id: "inv_one_hour",
      invitedAt: "2026-09-13T09:00:00.000Z",
    };
    const pluralInvite: PendingInviteData = {
      ...invite,
      email: "plural@example.com",
      expiresAt: "2026-09-13T12:00:00.000Z",
      id: "inv_plural",
      invitedAt: "2026-09-11T10:00:00.000Z",
    };
    renderWithFeatureMessages(
      <TeamPendingInvitesCard
        {...cardProps({
          canManageTeam: false,
          invites: [oneHourInvite, pluralInvite],
          readOnly: true,
        })}
      />,
      { locale: "pl", messages: nonEnglishPendingMessages },
    );

    expect(screen.getByText(/wygasa za 1 godzinę/)).toBeVisible();
    expect(screen.getByText(/zaproszono 1 godzinę temu/)).toBeVisible();
    expect(screen.getByText(/wygasa za 2 godziny/)).toBeVisible();
    expect(screen.getByText(/zaproszono 2 dni temu/)).toBeVisible();
    expect(screen.getAllByText(/Owner Example \(owner@example\.com\)/)).toHaveLength(2);
  });
});
