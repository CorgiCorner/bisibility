import { BisibilityApiError, BisibilityClient } from "@bisibility/sdk";

const exampleId = "ts-quickstart";
const maxHistoryAttempts = 5;

// docs:start:method-contract
const docsMethodContract = {
  "List projects": BisibilityClient.prototype.listProjects,
  "Create a project": BisibilityClient.prototype.createProject,
  "Add keywords": BisibilityClient.prototype.addKeywords,
  "Run a rank check": BisibilityClient.prototype.runRankCheck,
  "Read a rank-check result": BisibilityClient.prototype.getRankCheckResult,
} as const;
void docsMethodContract;
// docs:end:method-contract

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRankHistory(
  client: BisibilityClient,
  keywordId: string,
  expectedCheckId: string,
) {
  for (let attempt = 1; attempt <= maxHistoryAttempts; attempt += 1) {
    const history = await client.listRankChecks(keywordId, { limit: 10, status: "completed" });
    const matchingCheck = history.data.find((check) => check.id === expectedCheckId);
    if (matchingCheck) {
      return matchingCheck;
    }
    await sleep(500);
  }

  throw new Error(`Rank history did not include check ${expectedCheckId}.`);
}

async function run() {
  // docs:start:client-usage
  const client = new BisibilityClient({
    apiKey: requiredEnv("BISIBILITY_API_KEY"),
    baseUrl: requiredEnv("BISIBILITY_BASE_URL"),
  });
  let keywordId: string | undefined;

  try {
    console.log("Listing projects");
    const projects = await client.listProjects();
    // docs:end:client-usage
    const project = projects.data[0];
    if (!project) {
      throw new Error("No projects are available for this API key.");
    }

    const suffix = `${Date.now()}-${process.pid}`;
    const keyword = `sdk quickstart ${suffix}`;
    console.log(`Using project ${project.id}`);
    console.log(`Creating keyword ${keyword}`);

    const created = await client.addKeywords(
      project.id,
      {
        keywords: [
          {
            keyword,
            tags: ["sdk-example"],
            target_url: `https://${project.domain}/quickstart`,
          },
        ],
      },
      { idempotencyKey: `${exampleId}-${suffix}` },
    );

    keywordId = created.results[0]?.keyword.id;
    if (!keywordId) {
      throw new Error("Keyword creation did not return a keyword id.");
    }
    console.log(`Created keyword ${keywordId}`);

    console.log("Running rank check");
    const check = await client.runRankCheck(keywordId);
    console.log(`Rank check ${check.id} completed with position ${check.position ?? "none"}`);

    console.log("Reading rank history");
    const historyCheck = await waitForRankHistory(client, keywordId, check.id);
    console.log(`History includes ${historyCheck.id} from ${historyCheck.checked_at}`);
  } finally {
    if (keywordId) {
      console.log(`Deleting keyword ${keywordId}`);
      await client.deleteKeyword(keywordId);
    }
  }

  console.log(`OK ${exampleId}`);
}

try {
  await run();
} catch (error: unknown) {
  if (error instanceof BisibilityApiError) {
    console.error(`API error ${error.status}: ${error.message}`);
  } else if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error("Unknown error");
  }
  process.exitCode = 1;
}
