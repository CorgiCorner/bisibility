"use client";
import { addKeywordsMatrix as addKeywordsMatrixAction } from "@/lib/actions/keyword";
import { capacityActionClient } from "./action";
export const addKeywordsMatrix = capacityActionClient(addKeywordsMatrixAction);

import { createAlertRule as createAlertRuleAction } from "@/lib/actions/alerts";
export const createAlertRule = capacityActionClient(createAlertRuleAction);

import { upsertWebhookEndpoint as upsertWebhookEndpointAction } from "@/lib/actions/alerts";
export const upsertWebhookEndpoint = capacityActionClient(upsertWebhookEndpointAction);

import { addKeywords as addKeywordsAction } from "@/lib/actions/keyword";
export const addKeywords = capacityActionClient(addKeywordsAction);

import { bulkSetFrequency as bulkSetFrequencyAction } from "@/lib/actions/keyword-bulk";
export const bulkSetFrequency = capacityActionClient(bulkSetFrequencyAction);

import { addManualCompetitor as addManualCompetitorAction } from "@/lib/actions/competitor-set";
export const addManualCompetitor = capacityActionClient(addManualCompetitorAction);

import { confirmSuggestedCompetitor as confirmSuggestedCompetitorAction } from "@/lib/actions/competitor-set";
export const confirmSuggestedCompetitor = capacityActionClient(confirmSuggestedCompetitorAction);

import { updateDefaultRankCheckSettings as updateDefaultRankCheckSettingsAction } from "@/lib/actions/settings";
export const updateDefaultRankCheckSettings = capacityActionClient(
  updateDefaultRankCheckSettingsAction,
);

import { updateRankCheckFrequency as updateRankCheckFrequencyAction } from "@/lib/actions/settings";
export const updateRankCheckFrequency = capacityActionClient(updateRankCheckFrequencyAction);

import { trackPromptResearchAction as trackPromptResearchActionAction } from "@/lib/actions/prompt-research";
export const trackPromptResearchAction = capacityActionClient(trackPromptResearchActionAction);

import { setAlertRuleEnabled as setAlertRuleEnabledAction } from "@/lib/actions/alerts";
export const setAlertRuleEnabled = capacityActionClient(setAlertRuleEnabledAction);

import { createKeywordAlertRule as createKeywordAlertRuleAction } from "@/lib/actions/alerts";
export const createKeywordAlertRule = capacityActionClient(createKeywordAlertRuleAction);

import { createCloudImportWorkspace as createCloudImportWorkspaceAction } from "@/lib/actions/cloud";
export const createCloudImportWorkspace = capacityActionClient(createCloudImportWorkspaceAction);

import { addProjectMarketDeviceTargets as addProjectMarketDeviceTargetsAction } from "@/lib/actions/project-market-devices";
export const addProjectMarketDeviceTargets = capacityActionClient(
  addProjectMarketDeviceTargetsAction,
);

import { updateAlertRule as updateAlertRuleAction } from "@/lib/actions/alerts";
export const updateAlertRule = capacityActionClient(updateAlertRuleAction);

import { createProjectMarket as createProjectMarketAction } from "@/lib/actions/project-market-create";
export const createProjectMarket = capacityActionClient(createProjectMarketAction);
