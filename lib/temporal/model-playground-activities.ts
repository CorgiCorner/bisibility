import "server-only";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { executeModelPlaygroundRun } from "../model-playground/worker";
import { modelPlaygroundWorkerRuntime } from "../model-playground/worker-runtime";

const inputSchema = z.object({ projectId: z.string().min(1).max(256), runId: z.uuid() }).strict();

export async function executeModelPlaygroundActivity(value: { projectId: string; runId: string }) {
  const input = inputSchema.parse(value);
  return executeModelPlaygroundRun(modelPlaygroundWorkerRuntime(prisma, input), input);
}
