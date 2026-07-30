import { BisibilityApiError, BisibilityClient } from "@bisibility/sdk";

const exampleId = "ts-error-handling";

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

function problemCode(error: BisibilityApiError) {
  return error.problem?.type.split("/").at(-1);
}

async function expectApiError(
  label: string,
  expected: { code: string; status: number; title: string },
  operation: () => Promise<unknown>,
) {
  try {
    await operation();
  } catch (error) {
    assert(error instanceof BisibilityApiError, `${label} did not throw BisibilityApiError.`);
    assert(error.status === expected.status, `${label} returned status ${error.status}.`);
    assert(error.problem, `${label} did not include problem details.`);
    assert(
      error.problem.status === expected.status,
      `${label} problem status was ${error.problem.status}.`,
    );
    assert(
      error.problem.type === `https://bisibility.com/problems/${expected.code}`,
      `${label} problem type was ${error.problem.type}.`,
    );
    assert(
      problemCode(error) === expected.code,
      `${label} problem code was ${problemCode(error)}.`,
    );
    assert(
      error.problem.title === expected.title,
      `${label} problem title was ${error.problem.title}.`,
    );
    console.log(`${label}: ${error.problem.title} (${problemCode(error)})`);
    return;
  }

  throw new Error(`${label} did not fail.`);
}

async function run() {
  const baseUrl = requiredEnv("BISIBILITY_BASE_URL");
  const client = new BisibilityClient({
    apiKey: requiredEnv("BISIBILITY_API_KEY"),
    baseUrl,
  });

  const invalidClient = new BisibilityClient({
    apiKey: "bsb_key_test_invalid_error_handling_0001",
    baseUrl,
  });

  await expectApiError(
    "Invalid API key",
    { code: "unauthorized", status: 401, title: "Unauthorized" },
    () => invalidClient.listProjects(),
  );

  await expectApiError(
    "Missing keyword",
    { code: "not_found", status: 404, title: "Not found" },
    () => client.getKeyword("kw_z00000000000000000000000"),
  );

  const projects = await client.listProjects();
  const project = projects.data[0];
  assert(project, "No projects are available for this API key.");

  await expectApiError(
    "Invalid keyword payload",
    { code: "validation_failed", status: 400, title: "Validation failed" },
    () => client.addKeywords(project.id, { keyword: "" }),
  );

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
