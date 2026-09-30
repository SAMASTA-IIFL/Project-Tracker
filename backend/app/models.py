import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field

from app.firestore_db import Collection


def new_id() -> str:
    return str(uuid.uuid4())


def now() -> datetime:
    return datetime.utcnow()


# --- Enums (mirrors PRD section 7) ---

class GlobalRole(str, Enum):
    ADMIN = "ADMIN"
    MEMBER = "MEMBER"


class ProductRole(str, Enum):
    PM = "PM"
    STAKEHOLDER = "STAKEHOLDER"
    DELIVERY = "DELIVERY"


class LifecycleStage(str, Enum):
    INTAKE = "INTAKE"
    BRD_REVIEW = "BRD_REVIEW"
    PLANNING = "PLANNING"
    DEVELOPMENT = "DEVELOPMENT"
    INFOSEC = "INFOSEC"
    UAT = "UAT"
    BUG_FIX = "BUG_FIX"
    RELEASE = "RELEASE"
    POST_PRODUCTION = "POST_PRODUCTION"


# Canonical loop order (PRD §5) — the single source of truth for "what's next".
# Kept separate from the Enum's declaration order so intent is explicit rather
# than implied by member ordering.
LIFECYCLE_ORDER: list[LifecycleStage] = [
    LifecycleStage.INTAKE,
    LifecycleStage.BRD_REVIEW,
    LifecycleStage.PLANNING,
    LifecycleStage.DEVELOPMENT,
    LifecycleStage.INFOSEC,
    LifecycleStage.UAT,
    LifecycleStage.BUG_FIX,
    LifecycleStage.RELEASE,
    LifecycleStage.POST_PRODUCTION,
]


class BRDStatus(str, Enum):
    DRAFT = "DRAFT"
    IN_REVIEW = "IN_REVIEW"
    CHANGES_REQUESTED = "CHANGES_REQUESTED"
    APPROVED = "APPROVED"


class TaskStatus(str, Enum):
    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    BLOCKED = "BLOCKED"
    READY_FOR_TEST = "READY_FOR_TEST"
    DONE = "DONE"


class Priority(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class UATCycleStatus(str, Enum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"


class UATResult(str, Enum):
    PENDING = "PENDING"
    PASS_ = "PASS"
    FAIL = "FAIL"
    COMMENT = "COMMENT"


class BugSeverity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class BugStatus(str, Enum):
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    FIXED = "FIXED"
    VERIFIED = "VERIFIED"
    CLOSED = "CLOSED"
    REOPENED = "REOPENED"


class BugSource(str, Enum):
    UAT = "UAT"
    INTERNAL = "INTERNAL"
    POST_PRODUCTION = "POST_PRODUCTION"


class FeedbackType(str, Enum):
    BUG = "BUG"
    FEATURE_REQUEST = "FEATURE_REQUEST"
    GENERAL = "GENERAL"


# Infosec checklist (separate from Task — see PRD Infosec-page addendum). A
# 4-state workflow rather than a plain checkbox, so a Stage 2 item can carry
# "fixed but not yet re-verified" across VAPT retest rounds.
class InfosecItemStatus(str, Enum):
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"
    VERIFIED = "VERIFIED"


class InfosecItemSource(str, Enum):
    TEMPLATE = "TEMPLATE"
    VAPT_REPORT = "VAPT_REPORT"
    MANUAL = "MANUAL"


# --- Planning workspace: tech profile + budget + architecture board ---

class TechStackCategory(str, Enum):
    FRONTEND = "FRONTEND"
    BACKEND = "BACKEND"
    DATABASE = "DATABASE"
    AI_MODEL = "AI_MODEL"
    INFRA_DEVOPS = "INFRA_DEVOPS"
    DEPENDENCY = "DEPENDENCY"
    OTHER = "OTHER"


class RepoProvider(str, Enum):
    GITHUB = "GITHUB"
    GITLAB = "GITLAB"
    BITBUCKET = "BITBUCKET"
    OTHER = "OTHER"


class HostingProvider(str, Enum):
    AWS = "AWS"
    AZURE = "AZURE"
    GCP = "GCP"
    VERCEL = "VERCEL"
    ON_PREM = "ON_PREM"
    OTHER = "OTHER"


class BudgetCategory(str, Enum):
    LABOR = "LABOR"
    INFRASTRUCTURE = "INFRASTRUCTURE"
    LICENSING_TOOLS = "LICENSING_TOOLS"
    AI_API_USAGE = "AI_API_USAGE"
    THIRD_PARTY_SERVICES = "THIRD_PARTY_SERVICES"
    CONTINGENCY = "CONTINGENCY"
    OTHER = "OTHER"


class BudgetPeriod(str, Enum):
    ONE_TIME = "ONE_TIME"
    MONTHLY = "MONTHLY"


# --- Core models ---
#
# Every class below is a Firestore document shape (plain Pydantic, no ORM).
# `id` is always the Firestore document id — Collection.set() writes every
# other field and Collection._from_doc() re-attaches `id` from doc.id on
# read (see app/firestore_db.py). What used to be `Field(foreign_key=...)`
# is now just a plain str field: Firestore has no foreign keys, referential
# integrity here is enforced the same way it always effectively was at the
# API layer (each router 404s if the referenced id doesn't resolve).

class User(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str | None = None
    email: str
    global_role: GlobalRole = GlobalRole.MEMBER
    created_at: datetime = Field(default_factory=now)

    # Firebase Auth's uid — kept as a separate lookup field rather than as
    # `id` itself so that `id` (referenced everywhere else: ProductMember.
    # user_id, TaskAssignee.user_id, ...) stays stable even for a user who
    # was pre-provisioned by email (app/routers/products.py::add_member)
    # before they ever signed in. None until they actually sign in once;
    # see app/security.py::_upsert_user for how a placeholder gets "claimed".
    firebase_uid: str | None = None

    # Secrets Vault (see app/routers/vault.py) — an RSA-OAEP-2048 keypair set
    # once at vault setup. The private key never exists in plaintext outside
    # the browser: vault_wrapped_private_key is a JSON blob {salt, iv,
    # ciphertext, iterations} produced by wrapping the PKCS8 private key with
    # a PBKDF2-derived key from the user's *vault* password (independent of
    # how they sign in — see Vault.tsx). Both fields are nullable -- most
    # users may never set up a vault.
    vault_public_key: str | None = None
    vault_wrapped_private_key: str | None = None


users_db = Collection("users", User)


class Product(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    description: str | None = None
    status: str = "ACTIVE"
    current_stage: LifecycleStage = LifecycleStage.INTAKE
    budget_cap: float | None = None
    owner_id: str
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


products_db = Collection("products", Product)


class ProductMember(BaseModel):
    id: str = Field(default_factory=new_id)
    product_id: str
    user_id: str
    role: ProductRole
    created_at: datetime = Field(default_factory=now)


product_members_db = Collection("product_members", ProductMember)


class BRD(BaseModel):
    id: str = Field(default_factory=new_id)
    product_id: str
    title: str
    version: int = 1
    status: BRDStatus = BRDStatus.DRAFT
    content: str | None = None
    file_url: str | None = None
    created_by_id: str
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


brds_db = Collection("brds", BRD)


class BRDComment(BaseModel):
    id: str = Field(default_factory=new_id)
    brd_id: str
    author_id: str
    section_anchor: str | None = None
    text: str
    resolved: bool = False
    created_at: datetime = Field(default_factory=now)


brd_comments_db = Collection("brd_comments", BRDComment)


class Task(BaseModel):
    id: str = Field(default_factory=new_id)
    product_id: str
    brd_id: str | None = None
    title: str
    description: str | None = None
    status: TaskStatus = TaskStatus.TODO
    priority: Priority = Priority.MEDIUM
    due_date: datetime | None = None
    # Which lifecycle stage this task belongs to (Development, Infosec, UAT, ...).
    # Drives the reopen/auto-advance rules in app/lifecycle.py.
    stage: LifecycleStage = LifecycleStage.DEVELOPMENT
    # Which BRD section this task traces back to (same free-text anchor values
    # BRDComment.section_anchor uses: objective/scope/requirements/acceptance_criteria).
    brd_section: str | None = None
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


tasks_db = Collection("tasks", Task)


# Many-to-many — a task can have several assignees.
class TaskAssignee(BaseModel):
    id: str = Field(default_factory=new_id)
    task_id: str
    user_id: str
    created_at: datetime = Field(default_factory=now)


task_assignees_db = Collection("task_assignees", TaskAssignee)


class ProgressUpdate(BaseModel):
    id: str = Field(default_factory=new_id)
    task_id: str
    author_id: str
    note: str
    percent_complete: int | None = None
    created_at: datetime = Field(default_factory=now)


progress_updates_db = Collection("progress_updates", ProgressUpdate)


class ArchitectureDiagram(BaseModel):
    id: str = Field(default_factory=new_id)
    product_id: str
    title: str
    version: int = 1
    file_url: str
    description: str | None = None
    uploaded_by_id: str
    created_at: datetime = Field(default_factory=now)


architecture_diagrams_db = Collection("architecture_diagrams", ArchitectureDiagram)


class DiagramComment(BaseModel):
    id: str = Field(default_factory=new_id)
    diagram_id: str
    author_id: str
    text: str
    created_at: datetime = Field(default_factory=now)


diagram_comments_db = Collection("diagram_comments", DiagramComment)


class UATCycleModel(BaseModel):
    id: str = Field(default_factory=new_id)
    product_id: str
    version: str
    status: UATCycleStatus = UATCycleStatus.OPEN
    started_at: datetime = Field(default_factory=now)
    closed_at: datetime | None = None


uat_cycles_db = Collection("uat_cycles", UATCycleModel)


class UATFeedback(BaseModel):
    id: str = Field(default_factory=new_id)
    uat_cycle_id: str
    task_id: str | None = None
    author_id: str
    criterion: str
    # A mutable per-criterion item (checklist-style, like InfosecChecklistItem)
    # rather than an append-only event log — PENDING is the untested starting
    # state, and result/notes/file_url/author_id are updated in place as the
    # criterion is tested.
    result: UATResult = UATResult.PENDING
    notes: str | None = None
    file_url: str | None = None
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


uat_feedback_db = Collection("uat_feedback", UATFeedback)


class BugReport(BaseModel):
    id: str = Field(default_factory=new_id)
    product_id: str
    title: str
    description: str
    severity: BugSeverity = BugSeverity.MEDIUM
    status: BugStatus = BugStatus.OPEN
    source: BugSource = BugSource.INTERNAL
    reported_by_id: str
    assignee_id: str | None = None
    linked_task_id: str | None = None
    # Set when this bug was filed via UAT's one-click Fail -> Bug conversion —
    # lets the UAT page show "already converted" and link back to the bug.
    uat_feedback_id: str | None = None
    file_url: str | None = None
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


bug_reports_db = Collection("bug_reports", BugReport)


class BugComment(BaseModel):
    id: str = Field(default_factory=new_id)
    bug_id: str
    author_id: str
    text: str
    created_at: datetime = Field(default_factory=now)


bug_comments_db = Collection("bug_comments", BugComment)


class PostProductionFeedback(BaseModel):
    id: str = Field(default_factory=new_id)
    product_id: str
    author_id: str
    type: FeedbackType = FeedbackType.GENERAL
    content: str
    ai_category: str | None = None
    created_at: datetime = Field(default_factory=now)


post_production_feedback_db = Collection("post_production_feedback", PostProductionFeedback)


class ActivityEvent(BaseModel):
    id: str = Field(default_factory=new_id)
    product_id: str
    actor_id: str
    event_type: str
    ref_type: str
    ref_id: str
    metadata_: dict | None = None
    created_at: datetime = Field(default_factory=now)


activity_events_db = Collection("activity_events", ActivityEvent)


class Notification(BaseModel):
    id: str = Field(default_factory=new_id)
    user_id: str
    event_id: str
    read: bool = False
    created_at: datetime = Field(default_factory=now)


notifications_db = Collection("notifications", Notification)


class Attachment(BaseModel):
    id: str = Field(default_factory=new_id)
    owner_type: str
    owner_id: str
    file_url: str
    file_type: str | None = None
    uploaded_by_id: str
    created_at: datetime = Field(default_factory=now)


attachments_db = Collection("attachments", Attachment)


# --- Infosec checklist bank + per-product checklist/VAPT tracking ---

class InfosecChecklistTemplate(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    description: str | None = None
    created_by_id: str
    created_at: datetime = Field(default_factory=now)


infosec_checklist_templates_db = Collection("infosec_checklist_templates", InfosecChecklistTemplate)


class InfosecChecklistTemplateItem(BaseModel):
    id: str = Field(default_factory=new_id)
    template_id: str
    title: str
    description: str | None = None
    category: str | None = None
    order: int = 0
    created_at: datetime = Field(default_factory=now)


infosec_checklist_template_items_db = Collection("infosec_checklist_template_items", InfosecChecklistTemplateItem)


class InfosecVAPTReport(BaseModel):
    id: str = Field(default_factory=new_id)
    product_id: str
    round: int = 1
    file_url: str
    notes: str | None = None
    uploaded_by_id: str
    uploaded_at: datetime = Field(default_factory=now)


infosec_vapt_reports_db = Collection("infosec_vapt_reports", InfosecVAPTReport)


class InfosecChecklistItem(BaseModel):
    id: str = Field(default_factory=new_id)
    product_id: str
    # Stage 1 = internal check (from a template and/or ad-hoc); Stage 2 = VAPT
    # findings. `round` only matters within stage 2 — each VAPT retest is its
    # own round so history isn't lost when items are re-added as "still open".
    stage: int = 1
    round: int = 1
    source: InfosecItemSource = InfosecItemSource.MANUAL
    template_item_id: str | None = None
    vapt_report_id: str | None = None
    title: str
    description: str | None = None
    category: str | None = None
    status: InfosecItemStatus = InfosecItemStatus.OPEN
    assignee_id: str | None = None
    created_by_id: str
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


infosec_checklist_items_db = Collection("infosec_checklist_items", InfosecChecklistItem)


class InfosecChecklistComment(BaseModel):
    id: str = Field(default_factory=new_id)
    item_id: str
    author_id: str
    text: str
    created_at: datetime = Field(default_factory=now)


infosec_checklist_comments_db = Collection("infosec_checklist_comments", InfosecChecklistComment)


# --- Planning workspace: repos, tech stack, hosting, budget, architecture board ---

class ProjectRepository(BaseModel):
    id: str = Field(default_factory=new_id)
    product_id: str
    label: str
    provider: RepoProvider = RepoProvider.GITHUB
    url: str
    default_branch: str | None = None
    notes: str | None = None
    order: int = 0
    created_by_id: str
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


project_repositories_db = Collection("project_repositories", ProjectRepository)


class TechStackItem(BaseModel):
    id: str = Field(default_factory=new_id)
    product_id: str
    category: TechStackCategory
    name: str
    version: str | None = None
    url: str | None = None
    notes: str | None = None
    order: int = 0
    created_by_id: str
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


tech_stack_items_db = Collection("tech_stack_items", TechStackItem)


class HostingEnvironment(BaseModel):
    id: str = Field(default_factory=new_id)
    product_id: str
    name: str
    provider: HostingProvider = HostingProvider.OTHER
    url: str | None = None
    region: str | None = None
    notes: str | None = None
    order: int = 0
    created_by_id: str
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


hosting_environments_db = Collection("hosting_environments", HostingEnvironment)


class BudgetLineItem(BaseModel):
    id: str = Field(default_factory=new_id)
    product_id: str
    category: BudgetCategory
    name: str
    planned_amount: float
    actual_amount: float = 0
    currency: str = "USD"
    period: BudgetPeriod = BudgetPeriod.ONE_TIME
    notes: str | None = None
    created_by_id: str
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


budget_line_items_db = Collection("budget_line_items", BudgetLineItem)


# One current, editable board per product (autosaved via PATCH). Explicit
# "Save version" snapshots into ArchitectureBoardVersion.
class ArchitectureBoard(BaseModel):
    id: str = Field(default_factory=new_id)
    product_id: str
    graph_json: dict = Field(default_factory=lambda: {"nodes": [], "edges": []})
    updated_by_id: str
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


architecture_boards_db = Collection("architecture_boards", ArchitectureBoard)


class ArchitectureBoardVersion(BaseModel):
    id: str = Field(default_factory=new_id)
    product_id: str
    version: int
    graph_json: dict
    label: str | None = None
    saved_by_id: str
    created_at: datetime = Field(default_factory=now)


architecture_board_versions_db = Collection("architecture_board_versions", ArchitectureBoardVersion)


# --- Secrets Vault: end-to-end encrypted secret sharing ---
#
# Unlike every other collection in this file, these are the first *personal*
# (non-product-scoped) resources -- product_id on VaultSecret is optional
# organizational metadata only, it grants no access. Access is exclusively
# per-individual via SecretGrant rows, checked by app/vault_access.py rather
# than app/permissions.py (which assumes a product_id).
#
# The backend never sees a secret's plaintext value or any key capable of
# decrypting it, with exactly one deliberate exception: the platform
# recovery keypair below, used only by the admin breakglass-reveal endpoint.
# Every other field here (ciphertext, iv, wrapped_key, public/private key
# blobs) is an opaque string the backend stores and returns verbatim.

class VaultSecret(BaseModel):
    id: str = Field(default_factory=new_id)
    owner_id: str
    # Organizational label only -- see module docstring above. Not an access grant.
    product_id: str | None = None
    name: str
    description: str | None = None
    ciphertext: str  # base64 AES-256-GCM ciphertext of the secret value
    iv: str  # base64, 12 bytes -- the GCM IV used for `ciphertext`
    # The secret's DEK, wrapped (RSA-OAEP) for the platform recovery public
    # key (VaultRecoveryKey below) -- always present, used only by breakglass.
    recovery_wrapped_key: str
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


vault_secrets_db = Collection("vault_secrets", VaultSecret)


class SecretGrant(BaseModel):
    id: str = Field(default_factory=new_id)
    secret_id: str
    # The grantee -- includes a self-grant row for the owner, so the owner
    # can decrypt from any device without needing owner_id special-cased.
    # Uniqueness of (secret_id, user_id) is enforced at the router layer
    # (grant_access does an upsert-if-exists check) rather than by a DB
    # constraint, same as everywhere else Firestore replaces Postgres here.
    user_id: str
    wrapped_key: str  # base64 RSA-OAEP ciphertext of the DEK, wrapped for user_id
    granted_by_id: str
    created_at: datetime = Field(default_factory=now)


secret_grants_db = Collection("secret_grants", SecretGrant)


class VaultAuditLog(BaseModel):
    id: str = Field(default_factory=new_id)
    # Deliberately not a foreign key -- audit history should outlive a
    # deleted secret rather than being cascade-deleted or blocking deletion.
    secret_id: str
    actor_id: str
    action: str  # CREATED | GRANTED | REVOKED | VIEWED | ADMIN_BREAKGLASS_VIEWED
    metadata_: dict | None = None
    created_at: datetime = Field(default_factory=now)


vault_audit_log_db = Collection("vault_audit_log", VaultAuditLog)


class VaultRecoveryKey(BaseModel):
    # Singleton doc (fixed id) -- one platform-wide recovery keypair, used
    # only by the admin breakglass-reveal endpoint. This is the one
    # deliberate, confirmed exception to this feature's end-to-end
    # encryption guarantee -- see app/vault_recovery.py. Generated once at
    # startup by ensure_vault_recovery_key() if
    # settings.vault_recovery_master_key is configured.
    id: str = "singleton"
    public_key: str  # SPKI DER, base64 -- safe to be public
    # PKCS8 DER private key, AES-256-GCM-encrypted with settings.vault_recovery_master_key.
    # Stored as base64(iv) + ":" + base64(ciphertext).
    encrypted_private_key: str
    created_at: datetime = Field(default_factory=now)


vault_recovery_key_db = Collection("vault_recovery_key", VaultRecoveryKey)
