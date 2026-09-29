import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import UniqueConstraint
from sqlmodel import JSON, Column, Field, Relationship, SQLModel, Text


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

class User(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    name: str | None = None
    email: str = Field(unique=True, index=True)
    global_role: GlobalRole = Field(default=GlobalRole.MEMBER)
    created_at: datetime = Field(default_factory=now)

    # Secrets Vault (see app/routers/vault.py) — an RSA-OAEP-2048 keypair set
    # once at vault setup. The private key never exists in plaintext outside
    # the browser: vault_wrapped_private_key is a JSON blob {salt, iv,
    # ciphertext, iterations} produced by wrapping the PKCS8 private key with
    # a PBKDF2-derived key from the user's login password. Both columns are
    # nullable -- most users may never set up a vault.
    vault_public_key: str | None = Field(default=None, sa_column=Column(Text))
    vault_wrapped_private_key: str | None = Field(default=None, sa_column=Column(Text))

    memberships: list["ProductMember"] = Relationship(back_populates="user")


class Product(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    name: str
    description: str | None = Field(default=None, sa_column=Column(Text))
    status: str = Field(default="ACTIVE")
    current_stage: LifecycleStage = Field(default=LifecycleStage.INTAKE)
    # Optional overall budget ceiling for the Planning workspace's Budget tab
    # progress bar. Added to an existing table -> needs the ADD COLUMN
    # IF NOT EXISTS migration in database.py (see _sync_product_budget_cap_column).
    budget_cap: float | None = None
    owner_id: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)

    members: list["ProductMember"] = Relationship(back_populates="product")


class ProductMember(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    role: ProductRole
    created_at: datetime = Field(default_factory=now)

    product: Product = Relationship(back_populates="members")
    user: User = Relationship(back_populates="memberships")


class BRD(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    title: str
    version: int = Field(default=1)
    status: BRDStatus = Field(default=BRDStatus.DRAFT)
    content: str | None = Field(default=None, sa_column=Column(Text))
    file_url: str | None = None
    created_by_id: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class BRDComment(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    brd_id: str = Field(foreign_key="brd.id", index=True)
    author_id: str = Field(foreign_key="user.id")
    section_anchor: str | None = None
    text: str = Field(sa_column=Column(Text))
    resolved: bool = Field(default=False)
    created_at: datetime = Field(default_factory=now)


class Task(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    brd_id: str | None = Field(default=None, foreign_key="brd.id")
    title: str
    description: str | None = Field(default=None, sa_column=Column(Text))
    status: TaskStatus = Field(default=TaskStatus.TODO)
    priority: Priority = Field(default=Priority.MEDIUM)
    due_date: datetime | None = None
    # Which lifecycle stage this task belongs to (Development, Infosec, UAT, ...).
    # Drives the reopen/auto-advance rules in app/lifecycle.py.
    stage: LifecycleStage = Field(default=LifecycleStage.DEVELOPMENT)
    # Which BRD section this task traces back to (same free-text anchor values
    # BRDComment.section_anchor uses: objective/scope/requirements/acceptance_criteria).
    brd_section: str | None = Field(default=None, sa_column=Column("brd_section", Text))
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


# Many-to-many — a task can have several assignees. The Postgres `task.assignee_id`
# column from before this still physically exists (create_all() never drops
# columns) but is no longer read/written by the ORM; database.py's
# _sync_task_assignees_backfill() carries its data forward into this table once.
class TaskAssignee(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    task_id: str = Field(foreign_key="task.id", index=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=now)


class ProgressUpdate(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    task_id: str = Field(foreign_key="task.id", index=True)
    author_id: str = Field(foreign_key="user.id")
    note: str = Field(sa_column=Column(Text))
    percent_complete: int | None = None
    created_at: datetime = Field(default_factory=now)


class ArchitectureDiagram(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    title: str
    version: int = Field(default=1)
    file_url: str
    description: str | None = Field(default=None, sa_column=Column(Text))
    uploaded_by_id: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=now)


class DiagramComment(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    diagram_id: str = Field(foreign_key="architecturediagram.id", index=True)
    author_id: str = Field(foreign_key="user.id")
    text: str = Field(sa_column=Column(Text))
    created_at: datetime = Field(default_factory=now)


class UATCycleModel(SQLModel, table=True):
    __tablename__ = "uatcycle"
    id: str = Field(default_factory=new_id, primary_key=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    version: str
    status: UATCycleStatus = Field(default=UATCycleStatus.OPEN)
    started_at: datetime = Field(default_factory=now)
    closed_at: datetime | None = None


class UATFeedback(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    uat_cycle_id: str = Field(foreign_key="uatcycle.id", index=True)
    task_id: str | None = Field(default=None, foreign_key="task.id")
    author_id: str = Field(foreign_key="user.id")
    criterion: str
    # A mutable per-criterion item (checklist-style, like InfosecChecklistItem)
    # rather than an append-only event log — PENDING is the untested starting
    # state, and result/notes/file_url/author_id are updated in place as the
    # criterion is tested. See the UAT plan's "interpretation calls" section.
    result: UATResult = Field(default=UATResult.PENDING)
    notes: str | None = Field(default=None, sa_column=Column(Text))
    file_url: str | None = None
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class BugReport(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    title: str
    description: str = Field(sa_column=Column(Text))
    severity: BugSeverity = Field(default=BugSeverity.MEDIUM)
    status: BugStatus = Field(default=BugStatus.OPEN)
    source: BugSource = Field(default=BugSource.INTERNAL)
    reported_by_id: str = Field(foreign_key="user.id")
    assignee_id: str | None = Field(default=None, foreign_key="user.id")
    linked_task_id: str | None = Field(default=None, foreign_key="task.id")
    # Set when this bug was filed via UAT's one-click Fail -> Bug conversion —
    # lets the UAT page show "already converted" and link back to the bug.
    uat_feedback_id: str | None = Field(default=None, foreign_key="uatfeedback.id")
    file_url: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class BugComment(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    bug_id: str = Field(foreign_key="bugreport.id", index=True)
    author_id: str = Field(foreign_key="user.id")
    text: str = Field(sa_column=Column(Text))
    created_at: datetime = Field(default_factory=now)


class PostProductionFeedback(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    author_id: str = Field(foreign_key="user.id")
    type: FeedbackType = Field(default=FeedbackType.GENERAL)
    content: str = Field(sa_column=Column(Text))
    ai_category: str | None = None
    created_at: datetime = Field(default_factory=now)


class ActivityEvent(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    actor_id: str = Field(foreign_key="user.id")
    event_type: str
    ref_type: str
    ref_id: str
    metadata_: dict | None = Field(default=None, sa_column=Column("metadata", JSON))
    created_at: datetime = Field(default_factory=now, index=True)


class Notification(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    event_id: str = Field(foreign_key="activityevent.id")
    read: bool = Field(default=False)
    created_at: datetime = Field(default_factory=now)


class Attachment(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    owner_type: str = Field(index=True)
    owner_id: str = Field(index=True)
    file_url: str
    file_type: str | None = None
    uploaded_by_id: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=now)


# --- Infosec checklist bank + per-product checklist/VAPT tracking ---

class InfosecChecklistTemplate(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    name: str
    description: str | None = Field(default=None, sa_column=Column(Text))
    created_by_id: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=now)


class InfosecChecklistTemplateItem(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    template_id: str = Field(foreign_key="infosecchecklisttemplate.id", index=True)
    title: str
    description: str | None = Field(default=None, sa_column=Column(Text))
    category: str | None = None
    order: int = Field(default=0)
    created_at: datetime = Field(default_factory=now)


class InfosecVAPTReport(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    round: int = Field(default=1)
    file_url: str
    notes: str | None = Field(default=None, sa_column=Column(Text))
    uploaded_by_id: str = Field(foreign_key="user.id")
    uploaded_at: datetime = Field(default_factory=now)


class InfosecChecklistItem(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    # Stage 1 = internal check (from a template and/or ad-hoc); Stage 2 = VAPT
    # findings. `round` only matters within stage 2 — each VAPT retest is its
    # own round so history isn't lost when items are re-added as "still open".
    stage: int = Field(default=1)
    round: int = Field(default=1)
    source: InfosecItemSource = Field(default=InfosecItemSource.MANUAL)
    template_item_id: str | None = Field(default=None, foreign_key="infosecchecklisttemplateitem.id")
    vapt_report_id: str | None = Field(default=None, foreign_key="infosecvaptreport.id")
    title: str
    description: str | None = Field(default=None, sa_column=Column(Text))
    category: str | None = None
    status: InfosecItemStatus = Field(default=InfosecItemStatus.OPEN)
    assignee_id: str | None = Field(default=None, foreign_key="user.id")
    created_by_id: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class InfosecChecklistComment(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    item_id: str = Field(foreign_key="infosecchecklistitem.id", index=True)
    author_id: str = Field(foreign_key="user.id")
    text: str = Field(sa_column=Column(Text))
    created_at: datetime = Field(default_factory=now)


# --- Planning workspace: repos, tech stack, hosting, budget, architecture board ---
#
# Unlike most of this app's entities (Task/BRD/Diagram, append-only by
# convention), these are plain reference-data records with no review/audit
# lifecycle attached -- they support real edit + delete via the API so a
# decommissioned hosting env or a mis-entered budget line doesn't sit
# stuck forever. Architecture board *version snapshots* stay append-only,
# same as ArchitectureDiagram's version history.

class ProjectRepository(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    label: str
    provider: RepoProvider = Field(default=RepoProvider.GITHUB)
    url: str
    default_branch: str | None = None
    notes: str | None = Field(default=None, sa_column=Column(Text))
    order: int = Field(default=0)
    created_by_id: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class TechStackItem(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    category: TechStackCategory
    name: str
    version: str | None = None
    url: str | None = None
    notes: str | None = Field(default=None, sa_column=Column(Text))
    order: int = Field(default=0)
    created_by_id: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class HostingEnvironment(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    name: str
    provider: HostingProvider = Field(default=HostingProvider.OTHER)
    url: str | None = None
    region: str | None = None
    notes: str | None = Field(default=None, sa_column=Column(Text))
    order: int = Field(default=0)
    created_by_id: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class BudgetLineItem(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    category: BudgetCategory
    name: str
    planned_amount: float
    actual_amount: float = Field(default=0)
    currency: str = Field(default="USD")
    period: BudgetPeriod = Field(default=BudgetPeriod.ONE_TIME)
    notes: str | None = Field(default=None, sa_column=Column(Text))
    created_by_id: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


# One current, editable board per product (autosaved via PATCH). Explicit
# "Save version" snapshots into ArchitectureBoardVersion.
class ArchitectureBoard(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    product_id: str = Field(foreign_key="product.id", unique=True, index=True)
    graph_json: dict = Field(default_factory=lambda: {"nodes": [], "edges": []}, sa_column=Column(JSON))
    updated_by_id: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class ArchitectureBoardVersion(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    product_id: str = Field(foreign_key="product.id", index=True)
    version: int
    graph_json: dict = Field(sa_column=Column(JSON))
    label: str | None = None
    saved_by_id: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=now)


# --- Secrets Vault: end-to-end encrypted secret sharing ---
#
# Unlike every other table in this file, these are the first *personal*
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

class VaultSecret(SQLModel, table=True):
    __tablename__ = "vaultsecret"
    id: str = Field(default_factory=new_id, primary_key=True)
    owner_id: str = Field(foreign_key="user.id", index=True)
    # Organizational label only -- see module docstring above. Not an access grant.
    product_id: str | None = Field(default=None, foreign_key="product.id", index=True)
    name: str
    description: str | None = Field(default=None, sa_column=Column(Text))
    ciphertext: str = Field(sa_column=Column(Text))  # base64 AES-256-GCM ciphertext of the secret value
    iv: str  # base64, 12 bytes -- the GCM IV used for `ciphertext`
    # The secret's DEK, wrapped (RSA-OAEP) for the platform recovery public
    # key (VaultRecoveryKey below) -- always present, used only by breakglass.
    recovery_wrapped_key: str = Field(sa_column=Column(Text))
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class SecretGrant(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("secret_id", "user_id", name="uq_secretgrant_secret_user"),)
    id: str = Field(default_factory=new_id, primary_key=True)
    secret_id: str = Field(foreign_key="vaultsecret.id", index=True)
    # The grantee -- includes a self-grant row for the owner, so the owner
    # can decrypt from any device without needing owner_id special-cased.
    user_id: str = Field(foreign_key="user.id", index=True)
    wrapped_key: str = Field(sa_column=Column(Text))  # base64 RSA-OAEP ciphertext of the DEK, wrapped for user_id
    granted_by_id: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=now)


class VaultAuditLog(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    # Deliberately not a DB foreign key -- audit history should outlive a
    # deleted secret rather than being cascade-deleted or blocking deletion.
    secret_id: str = Field(index=True)
    actor_id: str = Field(foreign_key="user.id")
    action: str  # CREATED | GRANTED | REVOKED | VIEWED | ADMIN_BREAKGLASS_VIEWED
    metadata_: dict | None = Field(default=None, sa_column=Column("metadata", JSON))
    created_at: datetime = Field(default_factory=now, index=True)


class VaultRecoveryKey(SQLModel, table=True):
    # Singleton row (fixed id) -- one platform-wide recovery keypair, used
    # only by the admin breakglass-reveal endpoint. This is the one
    # deliberate, confirmed exception to this feature's end-to-end
    # encryption guarantee -- see app/vault_recovery.py and PRD/plan Known
    # Limitation #4. Generated once at startup by ensure_vault_recovery_key()
    # if settings.vault_recovery_master_key is configured.
    id: str = Field(default="singleton", primary_key=True)
    public_key: str = Field(sa_column=Column(Text))  # SPKI DER, base64 -- safe to be public
    # PKCS8 DER private key, AES-256-GCM-encrypted with settings.vault_recovery_master_key.
    # Stored as base64(iv) + ":" + base64(ciphertext).
    encrypted_private_key: str = Field(sa_column=Column(Text))
    created_at: datetime = Field(default_factory=now)
