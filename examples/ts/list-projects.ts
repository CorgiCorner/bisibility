import { BisibilityClient } from "@bisibility/sdk";

const apiKey = process.env.BISIBILITY_API_KEY;
const baseUrl = process.env.BISIBILITY_BASE_URL;

if (!apiKey || !baseUrl) {
  throw new Error("Set BISIBILITY_API_KEY and BISIBILITY_BASE_URL before running this example.");
}

const bisibility = new BisibilityClient({
  apiKey,
  baseUrl,
});

const projects = await bisibility.projects.list();

for (const project of projects.data) {
  console.log(project.id, project.name);
}

console.log("OK ts-list-projects");
