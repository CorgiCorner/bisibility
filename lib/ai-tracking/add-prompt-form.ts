import { parseBulkPrompts, singlePromptIssue } from "@/lib/ai-tracking/bulk-prompts";
import { z } from "zod";

export function addPromptFormSchema(existing: readonly string[]) {
  return z
    .object({
      mode: z.enum(["one", "bulk"]),
      text: z.string(),
      topicId: z.string(),
      topicName: z.string(),
    })
    .superRefine((value, context) => {
      if (value.mode === "one") {
        const issue = singlePromptIssue(value.text);
        if (issue) {
          context.addIssue({ code: "custom", message: issue, path: ["text"] });
        }
      } else if (parseBulkPrompts(value.text, existing).valid.length === 0) {
        context.addIssue({ code: "custom", message: "none", path: ["text"] });
      }
      if (value.topicId === "new" && value.topicName.trim().length === 0) {
        context.addIssue({ code: "custom", message: "required", path: ["topicName"] });
      }
    });
}

export type AddPromptFormValues = z.infer<ReturnType<typeof addPromptFormSchema>>;
