import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const exampleId = "mcp-quickstart";
const expectedTools = ["list_projects", "list_keywords", "run_rank_check"];

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function serverLaunch() {
  const bin = process.env.BISIBILITY_MCP_BIN?.trim();
  if (bin) {
    return { args: [bin], command: process.execPath };
  }
  return { args: ["-y", "@bisibility/mcp@0.10.0"], command: "npx" };
}

function textContent(result) {
  const item = result.content?.find((entry) => entry.type === "text");
  assert(item?.text, "Tool response did not include text content.");
  return item.text;
}

async function run() {
  // docs:start:client-usage
  const launch = serverLaunch();
  const transport = new StdioClientTransport({
    args: launch.args,
    command: launch.command,
    env: {
      ...process.env,
      BISIBILITY_API_KEY: requiredEnv("BISIBILITY_API_KEY"),
      BISIBILITY_BASE_URL: requiredEnv("BISIBILITY_BASE_URL"),
    },
  });
  const client = new Client({ name: "bisibility-mcp-example", version: "0.1.0" });

  try {
    await client.connect(transport);

    console.log("Listing MCP tools");
    const tools = await client.listTools();
    const names = new Set(tools.tools.map((tool) => tool.name));
    for (const toolName of expectedTools) {
      assert(names.has(toolName), `Missing MCP tool ${toolName}.`);
    }

    console.log("Calling list_projects");
    const result = await client.callTool({
      arguments: {},
      name: "list_projects",
    });
    // docs:end:client-usage
    const projects = JSON.parse(textContent(result));
    assert(projects.data?.length > 0, "No projects are available for this API key.");
  } finally {
    await client.close().catch(() => undefined);
  }

  console.log(`OK ${exampleId}`);
}

try {
  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
