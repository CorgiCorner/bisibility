export type SkillReference = { path: string; content: string };

export type TaskSkill = {
  slug: string;
  title: string;
  description: string;
  compatibility: string;
  kind: "task-skill" | "task-router";
  version: string;
  body: string;
  references?: SkillReference[];
};
