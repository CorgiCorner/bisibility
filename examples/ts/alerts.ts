import type { AlertRule, CreateAlertRuleInput } from "@bisibility/sdk";
import { BisibilityApiError, BisibilityClient } from "@bisibility/sdk";

const exampleId = "ts-alerts";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function hasRule(rules: readonly AlertRule[], ruleId: string) {
  return rules.some((rule) => rule.id === ruleId);
}

async function run() {
  const client = new BisibilityClient({
    apiKey: requiredEnv("BISIBILITY_API_KEY"),
    baseUrl: requiredEnv("BISIBILITY_BASE_URL"),
  });
  let ruleId: string | undefined;
  let deleted = false;

  try {
    const projects = await client.listProjects();
    const project = projects.data[0];
    assert(project, "No projects are available for this API key.");

    const suffix = `${Date.now()}-${process.pid}`;
    const input = {
      channels: ["email"],
      condition_type: "threshold",
      enabled: true,
      name: `SDK example alert ${suffix}`,
      target_type: "all",
      threshold_position: 10,
    } satisfies CreateAlertRuleInput;

    console.log(`Creating alert rule on ${project.id}`);
    const created = await client.createAlertRule(project.id, input, {
      idempotencyKey: `${exampleId}-${suffix}`,
    });
    ruleId = created.id;
    assert(created.name === input.name, "Created alert rule returned an unexpected name.");
    assert(created.condition_type === "threshold", "Created alert rule used the wrong condition.");

    console.log("Listing alert rules");
    const listed = await client.listAlertRules(project.id, { limit: 50 });
    assert(hasRule(listed.data, ruleId), `Alert rule ${ruleId} was not listed.`);

    console.log(`Deleting alert rule ${ruleId}`);
    const deletion = await client.deleteAlertRule(ruleId);
    assert(deletion.deleted, "Alert rule deletion was not confirmed.");
    deleted = true;

    const afterDelete = await client.listAlertRules(project.id, { limit: 50 });
    assert(!hasRule(afterDelete.data, ruleId), `Alert rule ${ruleId} was still listed.`);
  } finally {
    if (ruleId && !deleted) {
      await client.deleteAlertRule(ruleId).catch(() => undefined);
    }
  }

  console.log(`OK ${exampleId}`);
}

try {
  await run();
} catch (error: unknown) {
  if (error instanceof BisibilityApiError) {
    console.error(`API error ${error.status}: ${error.problem?.detail ?? error.message}`);
  } else if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error("Unknown error");
  }
  process.exitCode = 1;
}
