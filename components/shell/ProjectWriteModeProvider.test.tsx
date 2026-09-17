import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import {
  ProjectReadOnlyTooltip,
  ProjectWriteModeBanner,
} from "@/components/shell/ProjectWriteModeNotices";
import {
  ProjectWriteModeProvider,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import {
  accountFeatureTestMessages,
  renderWithShellMessages as render,
  renderWithFeatureMessages,
  shellFeatureTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

function Probe() {
  const { readOnly, writeMode } = useProjectWriteMode();
  return (
    <output aria-label="write mode">
      {writeMode}:{readOnly ? "readonly" : "writable"}
    </output>
  );
}

const writeModeReasons = {
  migrated: shellFeatureTestMessages.shell.writeMode.reasons.migrated,
  migration_hold: shellFeatureTestMessages.shell.writeMode.reasons.migrationHold,
};

const preparedPolishShellMessages = {
  ...shellFeatureTestMessages,
  shell: {
    ...shellFeatureTestMessages.shell,
    writeMode: {
      ...shellFeatureTestMessages.shell.writeMode,
      migrated: {
        detail: "Ten projekt został przeniesiony.",
        title: "Projekt przeniesiony.",
      },
      migrationHold: {
        detail: "Odczyt nadal działa.",
        title: "Projekt jest tylko do odczytu.",
      },
      migrationSettings: "Ustawienia migracji",
      reasons: {
        migrated: "Projekt przeniesiony i wyłączony",
        migrationHold: "Tylko odczyt podczas migracji",
      },
    },
  },
};

const preparedPolishReasons = {
  migrated: preparedPolishShellMessages.shell.writeMode.reasons.migrated,
  migration_hold: preparedPolishShellMessages.shell.writeMode.reasons.migrationHold,
};

describe("ProjectWriteModeProvider", () => {
  it("defaults to writable when no shell seed is present", () => {
    render(<Probe />);

    expect(screen.getByLabelText("write mode")).toHaveTextContent("active:writable");
  });

  it("seeds read-only state from migration hold", () => {
    render(
      <ProjectWriteModeProvider
        projectRef="prj_1"
        reasons={writeModeReasons}
        writeMode="migration_hold"
      >
        <Probe />
      </ProjectWriteModeProvider>,
    );

    expect(screen.getByLabelText("write mode")).toHaveTextContent("migration_hold:readonly");
  });
});

describe("ProjectReadOnlyTooltip", () => {
  it("keeps the layout wrapper in both writable and read-only states", () => {
    const { container, rerender } = render(
      <ProjectWriteModeProvider projectRef="prj_1" writeMode="active">
        <ProjectReadOnlyTooltip className="inline-flex flex-wrap gap-2">
          <button type="button">Daily</button>
        </ProjectReadOnlyTooltip>
      </ProjectWriteModeProvider>,
    );

    const writableWrapper = container.querySelector("span.inline-flex.flex-wrap.gap-2");
    expect(writableWrapper).not.toBeNull();
    expect(writableWrapper).not.toHaveAttribute("aria-label");

    rerender(
      <ProjectWriteModeProvider
        projectRef="prj_1"
        reasons={writeModeReasons}
        writeMode="migration_hold"
      >
        <ProjectReadOnlyTooltip className="inline-flex flex-wrap gap-2">
          <button type="button">Daily</button>
        </ProjectReadOnlyTooltip>
      </ProjectWriteModeProvider>,
    );

    expect(screen.getByLabelText("Read-only during migration hold")).toHaveClass(
      "inline-flex",
      "flex-wrap",
      "gap-2",
    );
  });
});

describe("ProjectWriteModeBanner", () => {
  it("renders the persistent migration-hold banner only while read-only", () => {
    const { rerender } = render(
      <ProjectWriteModeProvider projectRef="prj_1" writeMode="active">
        <ProjectWriteModeBanner />
      </ProjectWriteModeProvider>,
    );

    expect(screen.queryByText(/project is read-only/i)).not.toBeInTheDocument();

    rerender(
      <ProjectWriteModeProvider projectRef="prj_1" writeMode="migration_hold">
        <ProjectWriteModeBanner />
      </ProjectWriteModeProvider>,
    );

    expect(screen.getByText("Project is read-only - migration in progress.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /migration settings/i })).toHaveAttribute(
      "href",
      "/app/prj_1/settings#migration",
    );
    expect(screen.getByText(/Advanced shows when the hold becomes eligible/)).toHaveTextContent(
      "the hourly worker releases it shortly afterward",
    );
    expect(screen.queryByText(/after 24 hours/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /dismiss/i })).not.toBeInTheDocument();
  });

  it("renders the migrated banner for migrated projects", () => {
    render(
      <ProjectWriteModeProvider projectRef="prj_1" writeMode="migrated">
        <ProjectWriteModeBanner />
      </ProjectWriteModeProvider>,
    );

    expect(screen.getByText("Project migrated - disabled on this instance.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /migration settings/i })).toHaveAttribute(
      "href",
      "/app/prj_1/settings#migration",
    );
  });

  it.each([
    {
      reason: "Projekt przeniesiony i wyłączony",
      title: "Projekt przeniesiony.",
      writeMode: "migrated" as const,
    },
    {
      reason: "Tylko odczyt podczas migracji",
      title: "Projekt jest tylko do odczytu.",
      writeMode: "migration_hold" as const,
    },
  ])(
    "keeps the $writeMode reason through the nested account payload",
    ({ reason, title, writeMode }) => {
      renderWithFeatureMessages(
        <ProjectWriteModeProvider
          projectRef="prj_1"
          reasons={preparedPolishReasons}
          writeMode={writeMode}
        >
          <ProjectWriteModeBanner />
          <FeatureMessagesProvider locale="pl" messages={accountFeatureTestMessages} timeZone="UTC">
            <ProjectReadOnlyTooltip>
              <button type="button">Codziennie</button>
            </ProjectReadOnlyTooltip>
          </FeatureMessagesProvider>
        </ProjectWriteModeProvider>,
        { locale: "pl", messages: preparedPolishShellMessages },
      );

      expect(screen.getByText(title)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Ustawienia migracji" })).toHaveAttribute(
        "href",
        "/app/prj_1/settings#migration",
      );
      expect(screen.getByLabelText(reason)).toBeInTheDocument();
    },
  );
});
