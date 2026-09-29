from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr

from app.models import (
    BRDStatus,
    BudgetCategory,
    BudgetPeriod,
    BugSeverity,
    BugSource,
    BugStatus,
    GlobalRole,
    HostingProvider,
    InfosecItemSource,
    InfosecItemStatus,
    LifecycleStage,
    Priority,
    ProductRole,
    RepoProvider,
    TaskStatus,
    TechStackCategory,
    UATCycleStatus,
    UATResult,
)


class DevLoginRequest(BaseModel):
    email: EmailStr
    password: str
    name: str | None = None


class UserRead(BaseModel):
    id: str
    name: str | None
    email: str


# Only for "who am I" responses (/api/auth/me, dev-login) — global_role is
# meaningful for gating the signed-in user's own UI, not for describing other
# users (comment authors, assignees, ...), so it stays off the shared UserRead.
class MeRead(BaseModel):
    id: str
    name: str | None
    email: str
    global_role: GlobalRole


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: MeRead


class ProductCreate(BaseModel):
    name: str
    description: str | None = None


class ProductMemberRead(BaseModel):
    id: str
    role: ProductRole
    user: UserRead


class ProductMemberCreate(BaseModel):
    email: EmailStr
    name: str | None = None
    role: ProductRole


class ProductRead(BaseModel):
    id: str
    name: str
    description: str | None
    status: str
    current_stage: LifecycleStage
    budget_cap: float | None
    owner_id: str
    created_at: datetime
    updated_at: datetime


class ProductDetailRead(ProductRead):
    members: list[ProductMemberRead]


class ActivityEventRead(BaseModel):
    id: str
    event_type: str
    ref_type: str
    ref_id: str
    created_at: datetime
    actor: UserRead


# --- BRD ---

class BRDSections(BaseModel):
    objective: str = ""
    scope: str = ""
    requirements: str = ""
    acceptance_criteria: str = ""


class BRDCreate(BaseModel):
    title: str
    sections: BRDSections = BRDSections()


class BRDGenerateRequest(BaseModel):
    prompt: str


class BRDGenerateResponse(BaseModel):
    title: str
    sections: BRDSections


class BRDUpdate(BaseModel):
    title: str | None = None
    sections: BRDSections | None = None


class BRDRead(BaseModel):
    id: str
    product_id: str
    title: str
    version: int
    status: BRDStatus
    sections: BRDSections
    created_by: UserRead
    created_at: datetime
    updated_at: datetime


class RequestChangesBody(BaseModel):
    note: str | None = None


class BRDCommentCreate(BaseModel):
    section_anchor: str | None = None
    text: str


class BRDCommentRead(BaseModel):
    id: str
    brd_id: str
    section_anchor: str | None
    text: str
    resolved: bool
    author: UserRead
    created_at: datetime


# --- Tasks ---

class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    brd_id: str | None = None
    # Which BRD section this task traces back to (objective/scope/requirements/
    # acceptance_criteria) — same anchor values as BRDComment.section_anchor.
    brd_section: str | None = None
    assignee_ids: list[str] = []
    priority: Priority = Priority.MEDIUM
    due_date: datetime | None = None
    # Which lifecycle stage this task belongs to. Left unset, it defaults to
    # the product's current stage server-side (see routers/tasks.py).
    stage: LifecycleStage | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    brd_section: str | None = None
    # None = leave assignees untouched; [] = clear all; a list = replace the set.
    assignee_ids: list[str] | None = None
    status: TaskStatus | None = None
    priority: Priority | None = None
    due_date: datetime | None = None
    stage: LifecycleStage | None = None


class TaskRead(BaseModel):
    id: str
    product_id: str
    brd_id: str | None
    brd_section: str | None
    title: str
    description: str | None
    assignees: list[UserRead]
    status: TaskStatus
    priority: Priority
    due_date: datetime | None
    stage: LifecycleStage
    created_at: datetime
    updated_at: datetime


# --- AI-assisted task breakdown (Planning page) ---

class TaskSuggestion(BaseModel):
    title: str
    description: str | None = None
    brd_section: str | None = None
    priority: Priority = Priority.MEDIUM


class ProgressUpdateCreate(BaseModel):
    note: str
    percent_complete: int | None = None


class ProgressUpdateRead(BaseModel):
    id: str
    task_id: str
    author: UserRead
    note: str
    percent_complete: int | None
    created_at: datetime


# --- Architecture diagrams ---

class DiagramRead(BaseModel):
    id: str
    product_id: str
    title: str
    version: int
    file_url: str
    description: str | None
    uploaded_by: UserRead
    created_at: datetime


class DiagramCommentCreate(BaseModel):
    text: str


class DiagramCommentRead(BaseModel):
    id: str
    diagram_id: str
    text: str
    author: UserRead
    created_at: datetime


# --- Infosec checklist bank + per-product checklist/VAPT ---

class InfosecChecklistTemplateCreate(BaseModel):
    name: str
    description: str | None = None


class InfosecChecklistTemplateRead(BaseModel):
    id: str
    name: str
    description: str | None
    item_count: int
    created_by: UserRead
    created_at: datetime


class InfosecChecklistTemplateItemCreate(BaseModel):
    title: str
    description: str | None = None
    category: str | None = None


class InfosecChecklistTemplateItemRead(BaseModel):
    id: str
    template_id: str
    title: str
    description: str | None
    category: str | None


class InfosecChecklistItemCreate(BaseModel):
    title: str
    description: str | None = None
    category: str | None = None
    stage: int = 1
    round: int = 1
    vapt_report_id: str | None = None
    assignee_id: str | None = None


class InfosecChecklistItemUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    category: str | None = None
    status: InfosecItemStatus | None = None
    assignee_id: str | None = None


class InfosecChecklistItemRead(BaseModel):
    id: str
    product_id: str
    stage: int
    round: int
    source: InfosecItemSource
    template_item_id: str | None
    vapt_report_id: str | None
    title: str
    description: str | None
    category: str | None
    status: InfosecItemStatus
    assignee: UserRead | None
    created_at: datetime
    updated_at: datetime


class ApplyTemplateBody(BaseModel):
    template_id: str


class InfosecVAPTReportRead(BaseModel):
    id: str
    product_id: str
    round: int
    file_url: str
    notes: str | None
    uploaded_by: UserRead
    uploaded_at: datetime


class InfosecChecklistCommentCreate(BaseModel):
    text: str


class InfosecChecklistCommentRead(BaseModel):
    id: str
    item_id: str
    text: str
    author: UserRead
    created_at: datetime


class InfosecItemActivityRead(BaseModel):
    id: str
    event_type: str
    status: str | None
    actor: UserRead
    created_at: datetime


# --- UAT ---

class BugReportRead(BaseModel):
    id: str
    product_id: str
    title: str
    description: str
    severity: BugSeverity
    status: BugStatus
    source: BugSource
    reported_by: UserRead
    assignee: UserRead | None
    linked_task_id: str | None
    uat_feedback_id: str | None
    file_url: str | None
    created_at: datetime
    updated_at: datetime


class BugReportUpdate(BaseModel):
    severity: BugSeverity | None = None
    status: BugStatus | None = None
    assignee_id: str | None = None
    linked_task_id: str | None = None


class BugCommentCreate(BaseModel):
    text: str


class BugCommentRead(BaseModel):
    id: str
    bug_id: str
    text: str
    author: UserRead
    created_at: datetime


class BugActivityRead(BaseModel):
    id: str
    event_type: str
    status: BugStatus | None
    actor: UserRead
    created_at: datetime


class UATCycleCreate(BaseModel):
    version: str


class UATCycleRead(BaseModel):
    id: str
    product_id: str
    version: str
    status: UATCycleStatus
    started_at: datetime
    closed_at: datetime | None
    pass_count: int
    fail_count: int
    pending_count: int
    total_count: int


class UATFeedbackCreate(BaseModel):
    criterion: str
    task_id: str | None = None


class UATFeedbackRead(BaseModel):
    id: str
    uat_cycle_id: str
    criterion: str
    task_id: str | None
    result: UATResult
    notes: str | None
    file_url: str | None
    author: UserRead
    created_at: datetime
    updated_at: datetime
    linked_bug: BugReportRead | None


class UATFeedbackActivityRead(BaseModel):
    id: str
    event_type: str
    result: str | None
    actor: UserRead
    created_at: datetime


# --- Planning workspace: repos, tech stack, hosting, budget, architecture board ---

class ProjectRepositoryCreate(BaseModel):
    label: str
    provider: RepoProvider = RepoProvider.GITHUB
    url: str
    default_branch: str | None = None
    notes: str | None = None


class ProjectRepositoryUpdate(BaseModel):
    label: str | None = None
    provider: RepoProvider | None = None
    url: str | None = None
    default_branch: str | None = None
    notes: str | None = None


class ProjectRepositoryRead(BaseModel):
    id: str
    product_id: str
    label: str
    provider: RepoProvider
    url: str
    default_branch: str | None
    notes: str | None
    order: int
    created_by: UserRead
    created_at: datetime
    updated_at: datetime


class TechStackItemCreate(BaseModel):
    category: TechStackCategory
    name: str
    version: str | None = None
    url: str | None = None
    notes: str | None = None


class TechStackItemUpdate(BaseModel):
    category: TechStackCategory | None = None
    name: str | None = None
    version: str | None = None
    url: str | None = None
    notes: str | None = None


class TechStackItemRead(BaseModel):
    id: str
    product_id: str
    category: TechStackCategory
    name: str
    version: str | None
    url: str | None
    notes: str | None
    order: int
    created_by: UserRead
    created_at: datetime
    updated_at: datetime


class HostingEnvironmentCreate(BaseModel):
    name: str
    provider: HostingProvider = HostingProvider.OTHER
    url: str | None = None
    region: str | None = None
    notes: str | None = None


class HostingEnvironmentUpdate(BaseModel):
    name: str | None = None
    provider: HostingProvider | None = None
    url: str | None = None
    region: str | None = None
    notes: str | None = None


class HostingEnvironmentRead(BaseModel):
    id: str
    product_id: str
    name: str
    provider: HostingProvider
    url: str | None
    region: str | None
    notes: str | None
    order: int
    created_by: UserRead
    created_at: datetime
    updated_at: datetime


class BudgetLineItemCreate(BaseModel):
    category: BudgetCategory
    name: str
    planned_amount: float
    actual_amount: float = 0
    currency: str = "USD"
    period: BudgetPeriod = BudgetPeriod.ONE_TIME
    notes: str | None = None


class BudgetLineItemUpdate(BaseModel):
    category: BudgetCategory | None = None
    name: str | None = None
    planned_amount: float | None = None
    actual_amount: float | None = None
    currency: str | None = None
    period: BudgetPeriod | None = None
    notes: str | None = None


class BudgetLineItemRead(BaseModel):
    id: str
    product_id: str
    category: BudgetCategory
    name: str
    planned_amount: float
    actual_amount: float
    currency: str
    period: BudgetPeriod
    notes: str | None
    created_by: UserRead
    created_at: datetime
    updated_at: datetime


class BudgetCategoryTotal(BaseModel):
    category: BudgetCategory
    planned: float
    actual: float


class BudgetSummaryRead(BaseModel):
    total_planned: float
    total_actual: float
    budget_cap: float | None
    by_category: list[BudgetCategoryTotal]


class BudgetCapUpdate(BaseModel):
    budget_cap: float | None = None


class ArchitectureBoardRead(BaseModel):
    id: str
    product_id: str
    graph_json: dict
    updated_by: UserRead
    created_at: datetime
    updated_at: datetime


class ArchitectureBoardUpdate(BaseModel):
    graph_json: dict


class ArchitectureBoardVersionCreate(BaseModel):
    label: str | None = None


class ArchitectureBoardVersionRead(BaseModel):
    id: str
    product_id: str
    version: int
    graph_json: dict
    label: str | None
    saved_by: UserRead
    created_at: datetime


# --- AI-assisted architecture generation ---
#
# The AI only proposes graph *structure* (nodes + which nodes connect to
# which) — it is not asked for pixel positions, which LLMs are unreliable at.
# `key` is a throwaway identifier used solely to wire edges to nodes within
# one response; the router assigns real node ids and computes an auto-layout
# before returning a graph the frontend can drop straight onto the canvas.
ARCH_NODE_CATEGORIES = (
    "CLIENT", "API_GATEWAY", "SERVICE", "DATABASE", "CACHE", "QUEUE",
    "EXTERNAL_API", "AI_MODEL", "STORAGE", "CDN", "LOAD_BALANCER", "AUTH", "CUSTOM",
)
ArchNodeCategoryLiteral = Literal[
    "CLIENT", "API_GATEWAY", "SERVICE", "DATABASE", "CACHE", "QUEUE",
    "EXTERNAL_API", "AI_MODEL", "STORAGE", "CDN", "LOAD_BALANCER", "AUTH", "CUSTOM",
]
ArchEdgeKindLiteral = Literal["SYNC", "ASYNC", "DATA"]


class ArchNodeSuggestion(BaseModel):
    key: str
    label: str
    category: ArchNodeCategoryLiteral
    description: str | None = None


class ArchEdgeSuggestion(BaseModel):
    source: str
    target: str
    kind: ArchEdgeKindLiteral = "DATA"
    label: str | None = None


class ArchitectureSuggestion(BaseModel):
    nodes: list[ArchNodeSuggestion]
    edges: list[ArchEdgeSuggestion]


class BoardGenerateRequest(BaseModel):
    prompt: str
    use_brd: bool = False


class BoardGenerateResponse(BaseModel):
    graph_json: dict


# --- Secrets Vault ---

class UserSearchRead(BaseModel):
    id: str
    name: str | None
    email: str
    # None => this user hasn't set up their vault yet; the frontend must
    # disable selecting them as a grantee until they have.
    vault_public_key: str | None


class VaultKeypairSet(BaseModel):
    public_key: str
    # Opaque JSON-serialized-as-string blob: {salt, iv, ciphertext, iterations}.
    # The backend never parses or decrypts this.
    wrapped_private_key: str


class VaultKeypairRead(BaseModel):
    public_key: str
    wrapped_private_key: str


class VaultGrantCreate(BaseModel):
    user_id: str
    wrapped_key: str


class VaultSecretCreate(BaseModel):
    name: str
    description: str | None = None
    product_id: str | None = None
    ciphertext: str
    iv: str
    recovery_wrapped_key: str
    owner_wrapped_key: str
    initial_grants: list[VaultGrantCreate] = []


class VaultSecretRead(BaseModel):
    id: str
    owner: UserRead
    product_id: str | None
    name: str
    description: str | None
    my_access: str  # "OWNER" | "GRANTED"
    created_at: datetime
    updated_at: datetime


class VaultSecretRevealRead(BaseModel):
    ciphertext: str
    iv: str
    wrapped_key: str


class VaultGrantRead(BaseModel):
    id: str
    user: UserRead
    granted_by: UserRead
    created_at: datetime


class VaultAuditEntryRead(BaseModel):
    id: str
    action: str
    actor: UserRead
    created_at: datetime
    metadata: dict | None = None


class VaultBreakglassRevealRead(BaseModel):
    value: str
