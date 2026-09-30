export type User = {
  id: string;
  name: string | null;
  email: string;
  // Only populated on the signed-in user's own record (/api/auth/me) —
  // undefined when this User appears as e.g. a comment author or task
  // assignee.
  global_role?: "ADMIN" | "MEMBER";
};

export type LifecycleStage =
  | "INTAKE"
  | "BRD_REVIEW"
  | "PLANNING"
  | "DEVELOPMENT"
  | "INFOSEC"
  | "UAT"
  | "BUG_FIX"
  | "RELEASE"
  | "POST_PRODUCTION";

export type ProductRole = "PM" | "STAKEHOLDER" | "DELIVERY";

export type Product = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  current_stage: LifecycleStage;
  budget_cap: number | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
};

export type ProductMember = {
  id: string;
  role: ProductRole;
  user: User;
};

export type ProductDetail = Product & {
  members: ProductMember[];
};

export type ActivityEvent = {
  id: string;
  event_type: string;
  ref_type: string;
  ref_id: string;
  created_at: string;
  actor: User;
};

export const STAGES: { key: LifecycleStage; label: string }[] = [
  { key: "INTAKE", label: "Intake" },
  { key: "BRD_REVIEW", label: "BRD review" },
  { key: "PLANNING", label: "Planning" },
  { key: "DEVELOPMENT", label: "Development" },
  { key: "INFOSEC", label: "Infosec" },
  { key: "UAT", label: "UAT" },
  { key: "BUG_FIX", label: "Bug fix" },
  { key: "RELEASE", label: "Release" },
  { key: "POST_PRODUCTION", label: "Post-production" },
];

// --- BRD ---

export type BRDStatus = "DRAFT" | "IN_REVIEW" | "CHANGES_REQUESTED" | "APPROVED";

export type BRDSections = {
  objective: string;
  scope: string;
  requirements: string;
  acceptance_criteria: string;
};

export const BRD_SECTION_FIELDS: { key: keyof BRDSections; label: string }[] = [
  { key: "objective", label: "Objective" },
  { key: "scope", label: "Scope" },
  { key: "requirements", label: "Requirements" },
  { key: "acceptance_criteria", label: "Acceptance criteria" },
];

export type BRD = {
  id: string;
  product_id: string;
  title: string;
  version: number;
  status: BRDStatus;
  sections: BRDSections;
  created_by: User;
  created_at: string;
  updated_at: string;
};

export type BRDComment = {
  id: string;
  brd_id: string;
  section_anchor: string | null;
  text: string;
  resolved: boolean;
  author: User;
  created_at: string;
};

// --- Tasks ---

export type TaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "READY_FOR_TEST" | "DONE";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export const TASK_STATUSES: { key: TaskStatus; label: string }[] = [
  { key: "TODO", label: "To do" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "BLOCKED", label: "On Hold" },
  { key: "READY_FOR_TEST", label: "Ready for test" },
  { key: "DONE", label: "Done" },
];

export type Task = {
  id: string;
  product_id: string;
  brd_id: string | null;
  brd_section: string | null;
  title: string;
  description: string | null;
  assignees: User[];
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;
  stage: LifecycleStage;
  created_at: string;
  updated_at: string;
};

export type TaskSuggestion = {
  title: string;
  description: string | null;
  brd_section: string | null;
  priority: Priority;
};

export type StageTaskStatus = "none" | "pending" | "complete";

export type ProgressUpdate = {
  id: string;
  task_id: string;
  author: User;
  note: string;
  percent_complete: number | null;
  created_at: string;
};

// --- Architecture diagrams ---

export type ArchitectureDiagram = {
  id: string;
  product_id: string;
  title: string;
  version: number;
  file_url: string;
  description: string | null;
  uploaded_by: User;
  created_at: string;
};

export type DiagramComment = {
  id: string;
  diagram_id: string;
  text: string;
  author: User;
  created_at: string;
};

// --- Infosec checklist bank + per-product checklist/VAPT ---

export type InfosecItemStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "VERIFIED";
export type InfosecItemSource = "TEMPLATE" | "VAPT_REPORT" | "MANUAL";

export const INFOSEC_ITEM_STATUSES: { key: InfosecItemStatus; label: string }[] = [
  { key: "OPEN", label: "Open" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "VERIFIED", label: "Verified" },
];

export type InfosecChecklistTemplate = {
  id: string;
  name: string;
  description: string | null;
  item_count: number;
  created_by: User;
  created_at: string;
};

export type InfosecChecklistItem = {
  id: string;
  product_id: string;
  stage: number;
  round: number;
  source: InfosecItemSource;
  template_item_id: string | null;
  vapt_report_id: string | null;
  title: string;
  description: string | null;
  category: string | null;
  status: InfosecItemStatus;
  assignee: User | null;
  created_at: string;
  updated_at: string;
};

export type InfosecVAPTReport = {
  id: string;
  product_id: string;
  round: number;
  file_url: string;
  notes: string | null;
  uploaded_by: User;
  uploaded_at: string;
};

export type InfosecChecklistComment = {
  id: string;
  item_id: string;
  text: string;
  author: User;
  created_at: string;
};

export type InfosecItemActivity = {
  id: string;
  event_type: string;
  status: InfosecItemStatus | null;
  actor: User;
  created_at: string;
};

// --- UAT ---

export type UATCycleStatus = "OPEN" | "CLOSED";
export type UATResult = "PENDING" | "PASS" | "FAIL" | "COMMENT";

export const UAT_RESULTS: { key: UATResult; label: string }[] = [
  { key: "PENDING", label: "Pending" },
  { key: "PASS", label: "Pass" },
  { key: "FAIL", label: "Fail" },
  { key: "COMMENT", label: "Comment" },
];

export type BugSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type BugStatus = "OPEN" | "IN_PROGRESS" | "FIXED" | "VERIFIED" | "CLOSED" | "REOPENED";

// Minimal read shape for the bug a UAT feedback item was converted into —
// the full Bug Tracking module (board, triage, filters) is a later phase.
export type BugReportSummary = {
  id: string;
  title: string;
  severity: BugSeverity;
  status: BugStatus;
};

export type UATCycle = {
  id: string;
  product_id: string;
  version: string;
  status: UATCycleStatus;
  started_at: string;
  closed_at: string | null;
  pass_count: number;
  fail_count: number;
  pending_count: number;
  total_count: number;
};

export type UATFeedback = {
  id: string;
  uat_cycle_id: string;
  criterion: string;
  task_id: string | null;
  result: UATResult;
  notes: string | null;
  file_url: string | null;
  author: User;
  created_at: string;
  updated_at: string;
  linked_bug: BugReportSummary | null;
};

export type UATFeedbackActivity = {
  id: string;
  event_type: string;
  result: UATResult | null;
  actor: User;
  created_at: string;
};

export type BugSource = "UAT" | "INTERNAL" | "POST_PRODUCTION";

export const BUG_STATUSES: BugStatus[] = ["OPEN", "IN_PROGRESS", "FIXED", "VERIFIED", "CLOSED", "REOPENED"];
export const BUG_SEVERITIES: BugSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export const BUG_SOURCES: BugSource[] = ["UAT", "INTERNAL", "POST_PRODUCTION"];

export type BugReport = {
  id: string;
  product_id: string;
  title: string;
  description: string;
  severity: BugSeverity;
  status: BugStatus;
  source: BugSource;
  reported_by: User;
  assignee: User | null;
  linked_task_id: string | null;
  uat_feedback_id: string | null;
  file_url: string | null;
  created_at: string;
  updated_at: string;
};

export type BugComment = {
  id: string;
  bug_id: string;
  text: string;
  author: User;
  created_at: string;
};

export type BugActivity = {
  id: string;
  event_type: string;
  status: BugStatus | null;
  actor: User;
  created_at: string;
};

// --- Planning workspace: repos, tech stack, hosting, budget, architecture board ---

export type TechStackCategory = "FRONTEND" | "BACKEND" | "DATABASE" | "AI_MODEL" | "INFRA_DEVOPS" | "DEPENDENCY" | "OTHER";
export type RepoProvider = "GITHUB" | "GITLAB" | "BITBUCKET" | "OTHER";
export type HostingProvider = "AWS" | "AZURE" | "GCP" | "VERCEL" | "ON_PREM" | "OTHER";
export type BudgetCategory = "LABOR" | "INFRASTRUCTURE" | "LICENSING_TOOLS" | "AI_API_USAGE" | "THIRD_PARTY_SERVICES" | "CONTINGENCY" | "OTHER";
export type BudgetPeriod = "ONE_TIME" | "MONTHLY";

export const TECH_STACK_CATEGORIES: { key: TechStackCategory; label: string }[] = [
  { key: "FRONTEND", label: "Frontend" },
  { key: "BACKEND", label: "Backend" },
  { key: "DATABASE", label: "Database" },
  { key: "AI_MODEL", label: "AI Model" },
  { key: "INFRA_DEVOPS", label: "Infra / DevOps" },
  { key: "DEPENDENCY", label: "Dependency" },
  { key: "OTHER", label: "Other" },
];

export const REPO_PROVIDERS: { key: RepoProvider; label: string }[] = [
  { key: "GITHUB", label: "GitHub" },
  { key: "GITLAB", label: "GitLab" },
  { key: "BITBUCKET", label: "Bitbucket" },
  { key: "OTHER", label: "Other" },
];

export const HOSTING_PROVIDERS: { key: HostingProvider; label: string }[] = [
  { key: "AWS", label: "AWS" },
  { key: "AZURE", label: "Azure" },
  { key: "GCP", label: "GCP" },
  { key: "VERCEL", label: "Vercel" },
  { key: "ON_PREM", label: "On-prem" },
  { key: "OTHER", label: "Other" },
];

export const BUDGET_CATEGORIES: { key: BudgetCategory; label: string }[] = [
  { key: "LABOR", label: "Labor" },
  { key: "INFRASTRUCTURE", label: "Infrastructure" },
  { key: "LICENSING_TOOLS", label: "Licensing / Tools" },
  { key: "AI_API_USAGE", label: "AI / API usage" },
  { key: "THIRD_PARTY_SERVICES", label: "Third-party services" },
  { key: "CONTINGENCY", label: "Contingency" },
  { key: "OTHER", label: "Other" },
];

export type ProjectRepository = {
  id: string;
  product_id: string;
  label: string;
  provider: RepoProvider;
  url: string;
  default_branch: string | null;
  notes: string | null;
  order: number;
  created_by: User;
  created_at: string;
  updated_at: string;
};

export type TechStackItem = {
  id: string;
  product_id: string;
  category: TechStackCategory;
  name: string;
  version: string | null;
  url: string | null;
  notes: string | null;
  order: number;
  created_by: User;
  created_at: string;
  updated_at: string;
};

export type HostingEnvironment = {
  id: string;
  product_id: string;
  name: string;
  provider: HostingProvider;
  url: string | null;
  region: string | null;
  notes: string | null;
  order: number;
  created_by: User;
  created_at: string;
  updated_at: string;
};

export type BudgetLineItem = {
  id: string;
  product_id: string;
  category: BudgetCategory;
  name: string;
  planned_amount: number;
  actual_amount: number;
  currency: string;
  period: BudgetPeriod;
  notes: string | null;
  created_by: User;
  created_at: string;
  updated_at: string;
};

export type BudgetCategoryTotal = {
  category: BudgetCategory;
  planned: number;
  actual: number;
};

export type BudgetSummary = {
  total_planned: number;
  total_actual: number;
  budget_cap: number | null;
  by_category: BudgetCategoryTotal[];
};

// --- Architecture board (node-based canvas, backed by @xyflow/react) ---

export type ArchNodeCategory =
  | "CLIENT"
  | "API_GATEWAY"
  | "SERVICE"
  | "DATABASE"
  | "CACHE"
  | "QUEUE"
  | "EXTERNAL_API"
  | "AI_MODEL"
  | "STORAGE"
  | "CDN"
  | "LOAD_BALANCER"
  | "AUTH"
  | "CUSTOM";

export const ARCH_NODE_CATEGORIES: { key: ArchNodeCategory; label: string }[] = [
  { key: "CLIENT", label: "Client" },
  { key: "API_GATEWAY", label: "API Gateway" },
  { key: "SERVICE", label: "Service" },
  { key: "DATABASE", label: "Database" },
  { key: "CACHE", label: "Cache" },
  { key: "QUEUE", label: "Queue / Broker" },
  { key: "EXTERNAL_API", label: "External API" },
  { key: "AI_MODEL", label: "AI / ML Model" },
  { key: "STORAGE", label: "Storage" },
  { key: "CDN", label: "CDN" },
  { key: "LOAD_BALANCER", label: "Load Balancer" },
  { key: "AUTH", label: "Auth / Identity" },
  { key: "CUSTOM", label: "Custom" },
];

export type ArchNodeData = {
  label: string;
  category: ArchNodeCategory;
  description?: string;
  techItemId?: string | null;
  hostingEnvId?: string | null;
};

export type ArchEdgeKind = "SYNC" | "ASYNC" | "DATA";

export type ArchEdgeData = {
  kind: ArchEdgeKind;
};

export type ArchGraph = {
  nodes: { id: string; type: "archNode"; position: { x: number; y: number }; data: ArchNodeData }[];
  edges: { id: string; source: string; target: string; label?: string; data: ArchEdgeData }[];
};

export type ArchitectureBoard = {
  id: string;
  product_id: string;
  graph_json: ArchGraph;
  updated_by: User;
  created_at: string;
  updated_at: string;
};

export type ArchitectureBoardVersion = {
  id: string;
  product_id: string;
  version: number;
  graph_json: ArchGraph;
  label: string | null;
  saved_by: User;
  created_at: string;
};

export type BoardGenerateRequest = {
  prompt: string;
  use_brd: boolean;
};

export type BoardGenerateResponse = {
  graph_json: ArchGraph;
};

// --- Secrets Vault ---
//
// The backend only ever sees/returns opaque base64 strings for ciphertext,
// iv, and wrapped keys — all real decryption happens client-side via
// lib/vaultCrypto.ts. See backend/app/routers/vault.py.

export type VaultUserSearchResult = {
  id: string;
  name: string | null;
  email: string;
  // null => this user hasn't set up their vault yet; they can't be granted
  // access until they have (no public key to wrap a DEK for).
  vault_public_key: string | null;
};

export type VaultSecretAccess = "OWNER" | "GRANTED";

export type VaultSecret = {
  id: string;
  owner: User;
  product_id: string | null;
  name: string;
  description: string | null;
  my_access: VaultSecretAccess;
  created_at: string;
  updated_at: string;
};

export type VaultSecretReveal = {
  ciphertext: string;
  iv: string;
  wrapped_key: string;
};

export type VaultGrant = {
  id: string;
  user: User;
  granted_by: User;
  created_at: string;
};

export type VaultAuditAction = "CREATED" | "GRANTED" | "REVOKED" | "VIEWED" | "ADMIN_BREAKGLASS_VIEWED";

export type VaultAuditEntry = {
  id: string;
  action: VaultAuditAction;
  actor: User;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

export const VAULT_AUDIT_LABELS: Record<VaultAuditAction, string> = {
  CREATED: "Created",
  GRANTED: "Access granted",
  REVOKED: "Access revoked",
  VIEWED: "Viewed",
  ADMIN_BREAKGLASS_VIEWED: "Admin breakglass view",
};
