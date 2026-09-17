import { AGENTS, SKILLS } from "@/components/install/install-catalog";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ isCloud: true }));

vi.mock("@/lib/deployment/deployment", () => ({
  get isCloud() {
    return mocks.isCloud;
  },
}));

async function renderLoading() {
  vi.resetModules();
  const { default: InstallLoading } = await import("./loading");

  return render(<InstallLoading />);
}

afterEach(() => {
  mocks.isCloud = true;
});

describe("InstallLoading", () => {
  it("draws one placeholder row per catalogue entry", async () => {
    const { container } = await renderLoading();

    expect(container.querySelectorAll("[data-agent-row]")).toHaveLength(AGENTS.length);
    expect(container.querySelectorAll("[data-skill-row]")).toHaveLength(SKILLS.length);
  });

  it("draws the self-hosting hint bar only in cloud mode, like the settled page", async () => {
    const cloud = await renderLoading();
    expect(cloud.container.querySelector("[data-self-host-hint]")).not.toBeNull();
    cloud.unmount();

    mocks.isCloud = false;
    const selfHost = await renderLoading();
    expect(selfHost.container.querySelector("[data-self-host-hint]")).toBeNull();
  });
});
