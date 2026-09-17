import { DeploymentModeProvider } from "@/components/shell/DeploymentModeProvider";
import {
  advancedSettingsFeatureTestMessages,
  renderWithAdvancedSettingsMessages as render,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocalizedMigrationReachabilityHint } from "./MigrationReachabilityHint";

vi.mock("@/components/ui/toast-context", () => ({ useToast: () => ({ showToast: vi.fn() }) }));

function renderHint(
  targetOrigin: string,
  options: { deploymentMode?: "cloud" | "self-host"; unreachable?: boolean } = {},
) {
  return render(
    <DeploymentModeProvider deploymentMode={options.deploymentMode ?? "self-host"}>
      <LocalizedMigrationReachabilityHint
        targetOrigin={targetOrigin}
        unreachable={options.unreachable}
      />
    </DeploymentModeProvider>,
  );
}

describe("MigrationReachabilityHint", () => {
  it("shows the Quick Tunnel command for a self-hosted loopback destination", () => {
    renderHint("http://127.0.0.1:3000");

    expect(screen.getByText("Running locally?")).toBeInTheDocument();
    expect(screen.getByText("cloudflared tunnel --url http://127.0.0.1:3000")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Learn more/i })).toHaveAttribute(
      "href",
      "https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/",
    );
  });

  it("tells the destination to hand the tunnel URL to the source", () => {
    render(
      <DeploymentModeProvider deploymentMode="self-host">
        <LocalizedMigrationReachabilityHint
          surface="destination"
          targetOrigin="http://localhost:3000"
        />
      </DeploymentModeProvider>,
    );

    expect(
      screen.getByText(/Use the generated HTTPS URL as the Destination URL on the source/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Paste the generated HTTPS URL here/)).not.toBeInTheDocument();
  });

  it("hides the tunnel hint on Cloud even for localhost", () => {
    renderHint("http://localhost:3000", { deploymentMode: "cloud" });

    expect(screen.queryByText("Running locally?")).not.toBeInTheDocument();
    expect(screen.queryByText(/Cloudflare Tunnel/)).not.toBeInTheDocument();
  });

  it("hides the tunnel hint for a public destination URL", () => {
    renderHint("https://rank.example.com");

    expect(screen.queryByText("Running locally?")).not.toBeInTheDocument();
  });

  it("does not suggest a tunnel for LAN until the connection check fails", () => {
    const { rerender } = renderHint("http://192.168.1.10:3000");

    expect(screen.queryByText("Running locally?")).not.toBeInTheDocument();
    expect(screen.queryByText(/not reachable from this instance/)).not.toBeInTheDocument();

    rerender(
      <DeploymentModeProvider deploymentMode="self-host">
        <LocalizedMigrationReachabilityHint targetOrigin="http://192.168.1.10:3000" unreachable />
      </DeploymentModeProvider>,
    );

    expect(screen.queryByText("Running locally?")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /If the destination is not reachable from this instance, use a temporary Cloudflare Tunnel or import a ZIP package/,
      ),
    ).toBeInTheDocument();
  });

  it("uses the migration route locale for the source hint", () => {
    const messages = structuredClone(advancedSettingsFeatureTestMessages);
    messages.projectSettingsMigration.reachability = {
      copy: "Kopiuj polecenie",
      destinationFollowUp: "Przekaz wygenerowany adres HTTPS do zrodla.",
      intro: "Ten adres jest dostepny tylko na tym komputerze.",
      runningLocal: "Uruchomione lokalnie?",
      sourceFollowUp: "Wklej tutaj wygenerowany adres HTTPS.",
      unreachable: "Cel nie jest dostepny z tej instancji.",
    };

    renderWithFeatureMessages(
      <DeploymentModeProvider deploymentMode="self-host">
        <LocalizedMigrationReachabilityHint targetOrigin="http://localhost:3000" />
      </DeploymentModeProvider>,
      { locale: "pl", messages },
    );

    expect(screen.getByText("Uruchomione lokalnie?")).toBeInTheDocument();
    expect(screen.getByText("Wklej tutaj wygenerowany adres HTTPS.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kopiuj polecenie" })).toBeInTheDocument();
  });
});
