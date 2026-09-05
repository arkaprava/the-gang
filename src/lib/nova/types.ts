export type AgentRole = "PO" | "BA" | "DEV" | "QA" | "SKILL";
export type LlmId = "claude" | "mistral" | "qwen";
export type FieldType =
  | "string"
  | "email"
  | "number"
  | "boolean"
  | "text"
  | "select"
  | "date";

export type DataField = {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[];
};

export type UserStory = {
  id: string;
  title: string;
  asA: string;
  iWant: string;
  soThat: string;
  acceptance: string[];
};

export type PoOutput = {
  epic: string;
  summary: string;
  stories: UserStory[];
  risks: { title: string; severity: "low" | "medium" | "high"; mitigation: string }[];
  scope: string[];
  outOfScope: string[];
};

export type BaOutput = {
  stack: { name: string; reason: string }[];
  entities: { name: string; fields: DataField[] }[];
  apis: { method: string; path: string; purpose: string }[];
  approach: string[];
  dataModelNotes: string;
};

export type GeneratedFile = {
  path: string;
  language: string;
  content: string;
};

export type PreviewSpec = {
  title: string;
  entityName: string;
  entityPlural: string;
  slug: string;
  fields: DataField[];
  features: {
    search: boolean;
    exportCsv: boolean;
    create: boolean;
    delete: boolean;
    status: boolean;
  };
};

export type DevOutput = {
  files: GeneratedFile[];
  preview: PreviewSpec;
  notes: string[];
};

export type TestResult = {
  name: string;
  type: "unit" | "integration" | "regression" | "a11y";
  passed: boolean;
  detail: string;
};

export type QaOutput = {
  tests: TestResult[];
  coverage: number;
  summary: string;
  issues: string[];
};

export type SkillOutput = {
  id: string;
  name: string;
  findings: { title: string; detail: string; severity: "info" | "warn" | "pass" }[];
};

export type MemorySource = "agent" | "user" | "seed";

export type MemoryEntry = {
  id: string;
  role: AgentRole;
  runId: string;
  createdAt: string;
  text: string;
  tags: string[];
  vector: number[];
  source: MemorySource;
};

export type PipelineEvent = {
  at: string;
  role: AgentRole | "SYSTEM";
  message: string;
};

export type RunStatus = "running" | "awaiting_decision" | "complete" | "rejected";

export type Run = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  status: RunStatus;
  currentStage: "PO" | "BA" | "DEV" | "QA" | "SKILLS" | "DONE";
  models: Record<"PO" | "BA" | "DEV" | "QA", LlmId>;
  skills: string[];
  cost: { estimatedUsd: number; tokens: number; notes: string };
  events: PipelineEvent[];
  po?: PoOutput;
  ba?: BaOutput;
  dev?: DevOutput;
  qa?: QaOutput;
  skillResults?: SkillOutput[];
  retrievedMemory: { id: string; text: string; score: number; role: AgentRole }[];
  decision?: { stage: "PO" | "DEV"; prompt: string };
};

export type StoreShape = {
  runs: Run[];
  memory: MemoryEntry[];
};

export type Intent = {
  title: string;
  entityName: string;
  entityPlural: string;
  slug: string;
  actor: string;
  fields: DataField[];
  capabilities: {
    search: boolean;
    exportCsv: boolean;
    auth: boolean;
    dashboard: boolean;
    status: boolean;
    realtime: boolean;
  };
  keywords: string[];
};
