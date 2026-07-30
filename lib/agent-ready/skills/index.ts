import { skill as alertTriage } from "./alert-triage";
import { skill as bisibility } from "./bisibility";
import { skill as domainOnboarding } from "./domain-onboarding";
import { skill as keywordImport } from "./keyword-import";
import { skill as providerSetup } from "./provider-setup";
import { skill as selfHostHealth } from "./self-host-health";
import { skill as teamApiGovernance } from "./team-api-governance";
import type { TaskSkill } from "./types";
import { skill as weeklyReport } from "./weekly-report";

export const taskSkills: TaskSkill[] = [
  bisibility,
  providerSetup,
  domainOnboarding,
  keywordImport,
  alertTriage,
  weeklyReport,
  selfHostHealth,
  teamApiGovernance,
];
