import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);

export function snapshotRef(snapshot, role, name) {
  const matches = Object.entries(snapshot.refs ?? {}).filter(
    ([, element]) => element.role === role && name.test(element.name ?? ""),
  );
  if (matches.length !== 1) throw new Error(`Expected one ${role} matching ${name}.`);
  return `@${matches[0][0]}`;
}

export async function captureDashboard(origin, projectRef, outputPath) {
  const session = `bisibility-screenshot-${process.pid}`;
  async function browser(...args) {
    const { stdout } = await execute("agent-browser", ["--session", session, "--json", ...args], {
      timeout: 60_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const response = JSON.parse(stdout);
    if (!response.success) throw new Error(response.error ?? "Browser command failed.");
    return response.data;
  }
  const snapshot = () => browser("snapshot", "-i");
  const dashboardPath = `/app/${projectRef}/dashboard`;
  try {
    await browser("set", "viewport", "1680", "1100", "2");
    await browser("set", "media", "light", "reduced-motion");
    await browser("open", `${origin}/login?next=${encodeURIComponent(dashboardPath)}`);
    let state = await snapshot();
    await browser("fill", snapshotRef(state, "textbox", /email/i), "demo@acme.dev");
    await browser("click", snapshotRef(state, "button", /^Send login code$/));
    await browser("wait", "--text", "Verify and continue");
    state = await snapshot();
    await browser("type", snapshotRef(state, "textbox", /^Code$/), "000000");
    state = await snapshot();
    await browser("click", snapshotRef(state, "button", /^Verify and continue$/));
    await browser("wait", "--url", `${origin}${dashboardPath}`);
    await snapshot();
    await browser(
      "wait", "--fn",
      'document.querySelectorAll(".recharts-surface").length >= 2 && document.fonts.status === "loaded" && document.body.innerText.includes("weekly ranking report")',
    );
    const frame = await browser("eval",
      `Math.ceil(document.querySelector('[data-testid="overview-secondary-cards"]').getBoundingClientRect().bottom + 9)`,
    );
    const height = frame.result;
    if (!Number.isFinite(height) || height < 600 || height > 1800) {
      throw new Error("Dashboard capture height is outside the expected range.");
    }
    await browser("set", "viewport", "1680", String(height), "2");
    await browser("wait", "--fn", 'document.fonts.status === "loaded"');
    await browser("screenshot", outputPath);
  } finally {
    await browser("close");
  }
}
