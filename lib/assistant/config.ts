import "server-only";
import { assistantEnabled, assistantProject } from "./access";
import { assistantFundingState, fundingForModel } from "./funding-preference";
import { assistantMaxSteps } from "./limits";
import { parseAssistantModels } from "./model-config";
import { type AssistantConfigView, MAX_USER_TEXT_CHARS } from "./wire";

const starters = [
  {
    id: "rankings",
    label: "Explain recent ranking changes",
    prompt: "Explain recent ranking changes for this project.",
  },
  {
    id: "visibility",
    label: "Summarize visibility",
    prompt: "Summarize this project's visibility.",
  },
  {
    id: "competitors",
    label: "Investigate competitors",
    prompt: "Investigate my main competitors.",
  },
  { id: "keywords", label: "Propose keywords", prompt: "Propose keywords worth investigating." },
  {
    id: "tracking",
    label: "Prepare tracking",
    prompt: "Help me prepare a keyword tracking action.",
  },
];
export async function assistantConfig(
  projectPublicId: string,
  userId: string,
): Promise<AssistantConfigView> {
  const project = await assistantProject(projectPublicId, userId);
  const configured = parseAssistantModels(process.env.ASSISTANT_MODELS_JSON);
  const models = configured ?? [];
  const enabled = assistantEnabled() && configured !== null;
  const state = await assistantFundingState(userId, project, models, enabled);
  const first = state.funding.find((item) => item.available);
  const defaultModel = models.find((item) => item.provider === first?.provider);
  const resolved = defaultModel ? fundingForModel(state, defaultModel.provider).choice : null;
  return {
    enabled,
    reason: enabled ? null : "not_configured",
    project: {
      publicId: project.publicId,
      name: project.name,
      role: project.role,
      readOnly: project.readOnly,
    },
    models: models.map((model) => ({
      id: model.id,
      provider: model.provider,
      label: model.label,
      toolUse: model.toolUse,
      efforts: model.efforts ?? [],
      defaultEffort: model.defaultEffort ?? null,
      maxOutputTokens: model.maxOutputTokens,
    })),
    funding: state.funding,
    fundingPreference: state.stored,
    creditsEnabled: state.creditsEnabled,
    defaults: {
      modelId: defaultModel?.id ?? null,
      funding: resolved,
    },
    starters: enabled ? starters : [],
    limits: { maxUserTextChars: MAX_USER_TEXT_CHARS, maxSteps: assistantMaxSteps() },
  };
}
