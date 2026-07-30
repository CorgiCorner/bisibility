import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeployHookRevealContent } from "./DeployHookReveal";

const issuedHook = {
  id: "hook_1",
  label: "Production deploys",
  maskedValue: "bih_live_example******1234",
  raw: "bih_live_example_token_value_1234",
};

describe("DeployHookRevealContent", () => {
  it("shows a copyable curl example for the current instance", () => {
    render(
      <DeployHookRevealContent
        endpointUrl="https://example.test/api/ingest/deploy"
        issuedHook={issuedHook}
      />,
    );

    expect(
      screen.getByText(/curl -X POST 'https:\/\/example\.test\/api\/ingest\/deploy'/),
    ).toBeVisible();
    expect(screen.getByText(/Authorization: Bearer <ingest-hook-token>/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Copy Production deploys curl example" }),
    ).toBeVisible();
  });

  it("warns beside the query-token URL that intermediaries can log it", () => {
    render(
      <DeployHookRevealContent
        endpointUrl="https://example.test/api/ingest/deploy"
        issuedHook={issuedHook}
      />,
    );

    expect(screen.getByText(/query strings can end up in proxy and access logs/i)).toBeVisible();
  });
});
