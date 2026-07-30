import { isDeepStrictEqual } from "node:util";
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
  return { args: ["-y", "@bisibility/mcp"], command: "npx" };
}

function textContent(result) {
  const item = result.content?.find((entry) => entry.type === "text");
  assert(item?.text, "Tool response did not include text content.");
  return item.text;
}

async function listHttpTools() {
  const apiBaseUrl = requiredEnv("BISIBILITY_BASE_URL");
  const response = await fetch(new URL("../mcp", `${apiBaseUrl}/`), {
    body: JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method: "tools/list",
      params: {},
    }),
    headers: {
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${requiredEnv("BISIBILITY_API_KEY")}`,
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2025-11-25",
    },
    method: "POST",
  });
  assert(response.ok, `Built-in MCP tools/list failed with HTTP ${response.status}.`);
  const payload = await response.json();
  assert(Array.isArray(payload.result?.tools), "Built-in MCP tools/list returned no tools.");
  return payload.result.tools;
}

function firstDifference(left, right, path) {
  if (isDeepStrictEqual(left, right)) return null;
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object" ||
    Array.isArray(left) !== Array.isArray(right)
  ) {
    return path;
  }

  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    const difference = firstDifference(left[key], right[key], `${path}.${key}`);
    if (difference) return difference;
  }
  return path;
}

function assertToolParity(stdioTools, httpTools) {
  const stdioByName = new Map(stdioTools.map((tool) => [tool.name, tool]));
  const httpByName = new Map(httpTools.map((tool) => [tool.name, tool]));
  const missingFromHttp = [...stdioByName.keys()].filter((name) => !httpByName.has(name));
  const missingFromStdio = [...httpByName.keys()].filter((name) => !stdioByName.has(name));
  assert(
    missingFromHttp.length === 0 && missingFromStdio.length === 0,
    `MCP tool set drift: missing from HTTP [${missingFromHttp.join(", ")}]; missing from stdio [${missingFromStdio.join(", ")}].`,
  );

  for (const [name, stdioTool] of stdioByName) {
    const difference = firstDifference(stdioTool, httpByName.get(name), name);
    assert(!difference, `MCP contract drift at ${difference}.`);
  }
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
    assertToolParity(tools.tools, await listHttpTools());

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
