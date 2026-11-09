import { renderWithGeneralSettingsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import {
  checkProjectDomainVerification,
  startProjectDomainVerification,
} from "@/lib/actions/domain-verification";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { DomainVerificationCard } from "./DomainVerificationCard";

vi.mock("@/lib/actions/domain-verification", () => ({
  startProjectDomainVerification: vi.fn(),
  checkProjectDomainVerification: vi.fn(),
}));
const pending = {
  domain: "example.com",
  method: "dns_txt",
  dns_host: "_bisibility.example.com",
  dns_value: "bisibility-site-verification=CHALLENGE",
  verified_at: null,
  last_checked_at: null,
  last_check_result: null,
  failures: 0,
  revoked_at: null,
};
it("starts a DNS challenge and checks it", async () => {
  vi.mocked(startProjectDomainVerification).mockResolvedValue(pending);
  vi.mocked(checkProjectDomainVerification).mockResolvedValue({
    ...pending,
    verified_at: "2026-11-06T00:00:00.000Z",
  });
  const user = userEvent.setup();
  render(<DomainVerificationCard projectId="prj_example" canEdit initial={null} />);
  await user.click(screen.getByRole("button", { name: "Use DNS TXT" }));
  expect(await screen.findByText("_bisibility.example.com")).toBeVisible();
  expect(screen.getByText("bisibility-site-verification=CHALLENGE")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Check now" }));
  expect(await screen.findByText("Verified by DNS")).toBeVisible();
  expect(checkProjectDomainVerification).toHaveBeenCalledWith({ projectId: "prj_example" });
}, 30_000);
it("does not allow changes when the project is read-only", () => {
  render(<DomainVerificationCard projectId="prj_example" canEdit={false} initial={pending} />);
  expect(screen.getByRole("button", { name: "Use DNS TXT" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Check now" })).toBeDisabled();
});
it("copies the TXT value", async () => {
  const user = userEvent.setup();
  const copy = vi.spyOn(navigator.clipboard, "writeText");
  render(<DomainVerificationCard projectId="prj_example" canEdit initial={pending} />);
  await user.click(screen.getByRole("button", { name: "Copy value" }));
  expect(copy).toHaveBeenCalledWith("bisibility-site-verification=CHALLENGE");
  expect(await screen.findByText("Copied.")).toBeVisible();
});
