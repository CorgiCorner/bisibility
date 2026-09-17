import { useTeamActionError } from "@/components/settings/team/useTeamActionError";
import {
  renderWithFeatureMessages,
  teamSettingsFeatureTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const nonEnglishTeamErrorMessages = {
  ...teamSettingsFeatureTestMessages,
  projectSettingsTeam: {
    ...teamSettingsFeatureTestMessages.projectSettingsTeam,
    errors: {
      ...teamSettingsFeatureTestMessages.projectSettingsTeam.errors,
      action: "Nie udało się wykonać działania zespołu.",
      inviteRateLimitedMinutes:
        "Limit zaproszeń został wykorzystany. Spróbuj ponownie za {count, plural, one {# minutę} few {# minuty} many {# minut} other {# minuty}}.",
      inviteRateLimitedSeconds:
        "Limit zaproszeń został wykorzystany. Spróbuj ponownie za {count, plural, one {# sekundę} few {# sekundy} many {# sekund} other {# sekundy}}.",
      inviteRecentlySentMinutes:
        "To zaproszenie wysłano niedawno. Spróbuj ponownie za {count, plural, one {# minutę} few {# minuty} many {# minut} other {# minuty}}.",
      inviteRecentlySentSeconds:
        "To zaproszenie wysłano niedawno. Spróbuj ponownie za {count, plural, one {# sekundę} few {# sekundy} many {# sekund} other {# sekundy}}.",
      inviteTemporarilyUnavailable: "Zaproszenia są chwilowo niedostępne.",
    },
  },
  shared: {
    ...teamSettingsFeatureTestMessages.shared,
    errors: {
      ...teamSettingsFeatureTestMessages.shared.errors,
      serverComponentDigest: "Sprawdzenie nie powiodło się (nr {digest}).",
      staleDeployment: "Aplikacja została zaktualizowana. Odśwież stronę.",
    },
  },
};

function TeamErrorProbe({ error }: Readonly<{ error: unknown }>) {
  const presentActionError = useTeamActionError();
  return <output>{presentActionError(error, "Nie udało się wykonać działania zespołu.")}</output>;
}

describe("useTeamActionError", () => {
  it.each([
    [
      "Too many invitations have been sent. Try again in 1 seconds.",
      "Limit zaproszeń został wykorzystany. Spróbuj ponownie za 1 sekundę.",
    ],
    [
      "Too many invitations have been sent. Try again in 60 seconds.",
      "Limit zaproszeń został wykorzystany. Spróbuj ponownie za 60 sekund.",
    ],
    [
      "Too many invitations have been sent. Try again in 5 seconds.",
      "Limit zaproszeń został wykorzystany. Spróbuj ponownie za 5 sekund.",
    ],
    [
      "This invitation was sent recently. Try again in 2 minutes.",
      "To zaproszenie wysłano niedawno. Spróbuj ponownie za 2 minuty.",
    ],
    [
      "This invitation was sent recently. Try again in 15 minutes.",
      "To zaproszenie wysłano niedawno. Spróbuj ponownie za 15 minut.",
    ],
  ])("keeps the retry delay from the closed owned contract: %s", (message, expected) => {
    renderWithFeatureMessages(<TeamErrorProbe error={message} />, {
      locale: "pl",
      messages: nonEnglishTeamErrorMessages,
    });

    expect(screen.getByRole("status")).toHaveTextContent(expected);
  });

  it("keeps unavailable, stale, digest, and unknown messages in their separate safe paths", () => {
    const { rerender } = renderWithFeatureMessages(
      <TeamErrorProbe error="Invitations are temporarily unavailable. Try again shortly." />,
      { messages: nonEnglishTeamErrorMessages },
    );
    expect(screen.getByRole("status")).toHaveTextContent("Zaproszenia są chwilowo niedostępne.");

    rerender(<TeamErrorProbe error={new Error("Failed to find Server Action.")} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Aplikacja została zaktualizowana. Odśwież stronę.",
    );

    rerender(
      <TeamErrorProbe
        error={Object.assign(new Error("Server Components render failed."), {
          digest: "digest-team-1",
        })}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Sprawdzenie nie powiodło się (nr digest-team-1).",
    );

    rerender(<TeamErrorProbe error={new Error("Unexpected upstream detail")} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Nie udało się wykonać działania zespołu.",
    );
  });
});
