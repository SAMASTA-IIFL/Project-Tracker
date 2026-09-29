# Product Pro — Product Requirements Document

**Status:** Draft v1
**Owner:** Bobby Beno
**Last updated:** 2026-07-23

---

## 1. Vision

Product Pro is a single internal workspace where a Product Manager runs the entire lifecycle of a product — from the first requirement to post-production feedback — without switching between a docs tool, a ticket tracker, a whiteboard app, and a spreadsheet.

The defining bet of this product is **presentation, not just tracking**: every stage of the lifecycle (BRD status, task progress, bug backlog, architecture, UAT results, release health) is shown as a visual, interactive, glanceable surface — timelines, progress rings, kanban boards, diagrams — rather than as another form-and-table CRUD app. It should feel informative the way a well-designed dashboard or a social feed does: you open it and immediately know what's moving, what's stuck, and what needs you.

## 2. Problem Statement

Today the product lifecycle (requirements → review → build → test → release → feedback) is scattered across email, Word docs, spreadsheets, Slack threads, and whatever bug tracker is on hand. Nothing connects a BRD line item to the task that implements it, the bug that broke it, or the feedback that followed release. The PM manually reassembles status for every stakeholder update. Product Pro exists to make that thread continuous and visible.

## 3. Scope

**In scope (v1):**
- Single organization, internal use (no multi-tenant/workspace-switching)
- Products as the top-level container; each product runs its own lifecycle instance
- BRD upload, versioning, and structured review/sign-off
- Task assignment and development progress tracking
- Architecture diagram upload, versioning, and viewing
- UAT cycles and structured UAT feedback
- Bug reporting and triage (sourced from UAT, internal QA, or post-production)
- Post-production feedback capture, feeding back into the next requirement cycle
- A visual, interactive dashboard/timeline per product (the "social-media-like" surface)
- Role-based access (Admin, Product Manager, Stakeholder, Delivery Team)
- Notifications on assignment, status change, and review requests

**Out of scope (v1, candidates for later):**
- Multi-tenant/org-switching, billing
- Native mobile app (responsive web only)
- In-app diagramming canvas (v1 is upload/version/annotate an existing diagram, not draw one)
- Git/CI integration (linking commits/PRs to tasks)
- Real social mechanics (likes, follows, DMs) — the brief calls for a visually engaging, interactive experience, not literal social networking features

## 4. Personas & Roles

| Role | Who | Primary needs |
|---|---|---|
| **Admin** | IT/PM lead | Manage users, roles, product creation rights |
| **Product Manager (PM)** | Owns the product | Create products, upload/manage BRDs, assign tasks, run UAT cycles, triage bugs, see full-lifecycle status at a glance |
| **Stakeholder** (Business/User team) | Requesters, reviewers, UAT testers, end users | Submit requirements, review/comment on BRDs, run UAT and log feedback, submit post-production feedback |
| **Delivery Team** (Developer, QA, Architect) | Builds the product | View assigned tasks, post progress updates, upload architecture diagrams, fix bugs, update bug status |

Permissions are additive per product membership — a user's role can differ across products (e.g., PM on Product A, Stakeholder on Product B). Fine-grained action-level permissions:

| Action | Admin | PM | Stakeholder | Delivery |
|---|---|---|---|---|
| Create product | ✅ | ✅ | ❌ | ❌ |
| Upload/edit BRD | ✅ | ✅ | ❌ (comment only) | ❌ |
| Review/comment BRD | ✅ | ✅ | ✅ | view only |
| Approve BRD | ✅ | ✅ | ✅ (as reviewer) | ❌ |
| Create/assign tasks | ✅ | ✅ | ❌ | ❌ |
| Post dev progress update | ✅ | ✅ | ❌ | ✅ (own tasks) |
| Upload architecture diagram | ✅ | ✅ | ❌ | ✅ |
| Start/manage UAT cycle | ✅ | ✅ | ❌ | ❌ |
| Submit UAT feedback | ✅ | ✅ | ✅ | ✅ |
| Log bug report | ✅ | ✅ | ✅ | ✅ |
| Triage/assign bug | ✅ | ✅ | ❌ | ❌ |
| Update bug status | ✅ | ✅ | ❌ | ✅ (assignee) |
| Submit post-prod feedback | ✅ | ✅ | ✅ | ✅ |

## 5. The Product Lifecycle (spine of the app)

Each **Product** runs a continuous loop. This loop is the primary mental model for the UI — the product dashboard should visualize where a product currently sits in this cycle.

```
Requirement Intake → BRD Review → Planning (Tasks) → Development → Infosec
        ↑                                                              ↓
Post-Production Feedback ← Release ← UAT Feedback ← Bug Triage/Fix ← ─ ┘
```

1. **Requirement Intake** — Stakeholder or PM captures a requirement; PM drafts/uploads a BRD against it.
2. **BRD Review** — Stakeholders review the BRD, leave inline comments, request changes or approve. Versioned until sign-off.
3. **Planning** — PM breaks the approved BRD into tasks, assigns owners, sets priority/due dates. Tasks can trace back to a BRD section.
4. **Development** — Delivery team posts progress updates (status, % complete, blockers) against tasks. Architecture diagrams are attached at this stage and versioned as design evolves.
5. **Infosec** — Security review of the feature-complete build before it goes to UAT. No dedicated review module in v1 (no findings/sign-off tracking yet — see PRD §9/§12); the PM advances the product out of this stage manually via the same "advance to next stage" action used for any stage without an automatic trigger.
6. **UAT** — Once tasks reach "ready for test," PM opens a UAT cycle. Stakeholders test against acceptance criteria and submit pass/fail feedback.
7. **Bug Triage & Fix** — UAT failures (or bugs from any source) become tracked bug reports with severity/status, assigned, fixed, and re-verified.
8. **Release** — PM marks the product/version as released.
9. **Post-Production Feedback** — Real usage feedback comes in, tagged as bug or new requirement, and loops back into Intake — closing the cycle.

## 6. Functional Requirements

### 6.1 Product Workspace
- PM/Admin creates a Product (name, description, target release, members with roles).
- Product home shows current lifecycle stage, health summary, and recent activity timeline.

### 6.2 BRD Management & Review
- Upload a BRD as a document (PDF/DOCX) or author it in a structured in-app editor (sectioned: objective, scope, requirements list, acceptance criteria).
- Versioning: every edit after initial stakeholder sign-off creates a new version; version history is browsable and diffable at the section level.
- Reviewers leave inline, section-anchored comments (threaded, resolvable) — not likes/reactions, functional review comments.
- BRD status: `Draft → In Review → Changes Requested → Approved`.
- Approval requires sign-off from designated reviewer(s); PM sees outstanding reviewers at a glance.

### 6.3 Task Assignment & Development Progress
- Tasks created from an approved BRD (optionally linked to a specific BRD section/requirement) or standalone.
- Fields: title, description, assignee, priority, status (`To Do / In Progress / Blocked / Ready for Test / Done`), due date, **lifecycle stage** (which stage of §5's loop the task belongs to — Development, Infosec, UAT, etc.; defaults to the product's current stage, editable by the PM after creation).
- Board view (kanban by status) and list view; each task card/row shows its stage as a colored badge (same palette as the lifecycle timeline).
- Progress updates: assignee posts short structured updates (% complete, note, blockers, attachments) against a task; these updates populate the product activity timeline — this is the primary "keep everyone informed without asking" mechanism.
- **Task stage drives the lifecycle pointer** (added post-Phase-1, per user request — see §9): a product's `current_stage` auto-advances one step once every task tagged with that stage is Done, and auto-*reopens* backward to a task's stage if that task is created (or reassigned) against a stage the product has already moved past — the reopened stage renders as "current" again in the timeline. A later stage whose own tasks are already all Done keeps its completed checkmark rather than reverting to gray, but gets a small flag/asterisk badge since the process backtracked behind it. See `backend/app/lifecycle.py` (`maybe_reopen_stage`, `maybe_advance_when_stage_cleared`) and `frontend/src/lib/stages.ts` (`computeStageTaskStatus`).

### 6.4 Architecture Diagrams
- Upload diagram files (image/PDF/common diagram export formats) per product, versioned.
- Each version has a description of what changed and why; comment thread per diagram for design discussion.
- Diagrams are viewable full-screen with pan/zoom; latest version is what's shown by default with version history accessible.

### 6.5 UAT Feedback Collection
- PM opens a UAT cycle for a version, scoped to a set of tasks/acceptance criteria.
- Stakeholders submit feedback per criterion: Pass / Fail / Comment, with optional screenshot/attachment.
- Failures can be converted directly into a Bug Report with one action, pre-filled from the UAT feedback.
- UAT cycle dashboard shows pass rate, open failures, and readiness-to-release at a glance (visual, not a raw table).

### 6.6 Bug Reporting & Tracking
- Any role can log a bug: title, description, severity (Low/Medium/High/Critical), source (UAT/Internal/Post-Production), attachments (screenshots, logs).
- PM/Admin triages: assigns severity/priority, assigns owner, links to the originating task/BRD requirement if applicable.
- Status flow: `Open → In Progress → Fixed → Verified → Closed` (with `Reopened` possible from Verify failing).
- Bug board mirrors the task board (kanban + list), filterable by severity/source/status.

### 6.7 Post-Production Feedback
- Lightweight feedback capture (type: Bug / Feature Request / General, free text + optional attachment).
- PM triages incoming feedback: convert to a new bug report or a new requirement (feeding the next lifecycle loop), or archive.
- Feedback volume/type over time is visualized on the product dashboard (this is where sentiment/categorization AI assistance adds the most value — see 6.9).

### 6.8 Visual Product Dashboard (the "social-media-like" surface)
This is the differentiating UX requirement, not a bolt-on report:
- A per-product **activity timeline** — a chronological, card-based feed of everything that happened (BRD approved, task moved to Done, bug filed, diagram updated, UAT cycle completed) with author, timestamp, and a preview of the change. This is the "scroll and immediately understand what's going on" surface.
- A **lifecycle progress visualization** — where the product currently sits on the loop in §5, shown graphically (e.g., a stage tracker/progress ring), not as a status text field.
- **Health at a glance**: task completion %, open bug count by severity, UAT pass rate, days since last update — rendered as compact visual tiles/charts, not tables.
- Every module (BRD, Tasks, Bugs, UAT, Diagrams) gets a card-based, image/diagram-forward layout rather than dense data-grids as the default view; table/list views remain available for power users who need them.

### 6.9 AI-Assisted Features (using the existing `AI_PROVIDER` abstraction)
The scaffold already supports swapping `AI_PROVIDER` between `mock`/`anthropic`/`openai`/`azure-openai`. Proposed uses, all optional/gracefully degrading when the provider is `mock`:
- Auto-summarize a BRD into a short digest for reviewers who don't want to read the full doc.
- Suggest an initial task breakdown from an approved BRD (PM reviews/edits before creating tasks).
- Auto-categorize/tag post-production feedback (bug vs. feature request vs. praise) to speed up PM triage.
- Draft release notes from the set of tasks/bugs closed in a cycle.

### 6.10 Notifications
- In-app notification center: assigned to you, mentioned in a comment, review requested, status changed on something you own/follow.
- Notification triggers are the same events that populate the activity timeline (§6.8), so this is largely a filtered view of the same event stream plus read/unread state.

## 7. Data Model (v1 sketch)

Core entities and how they relate — this maps directly onto the Prisma schema to be written:

- **User** — id, name, email, globalRole(Admin/Member), avatar
- **Product** — id, name, description, status, currentStage, createdBy
- **ProductMember** — productId, userId, role (PM/Stakeholder/Delivery)
- **BRD** — id, productId, title, version, status, content/fileUrl, createdBy
- **BRDComment** — brdId, sectionAnchor, authorId, text, resolved
- **Task** — id, productId, brdId?, title, description, assigneeId, status, priority, dueDate
- **ProgressUpdate** — taskId, authorId, note, percentComplete, attachments
- **ArchitectureDiagram** — id, productId, title, version, fileUrl, description, uploadedBy
- **DiagramComment** — diagramId, authorId, text
- **UATCycle** — id, productId, version, status, startedAt
- **UATFeedback** — uatCycleId, criterion, taskId?, authorId, result(Pass/Fail), notes, attachments
- **BugReport** — id, productId, title, description, severity, status, source, reportedBy, assigneeId, linkedTaskId?, attachments
- **PostProductionFeedback** — id, productId, authorId, type, content, aiCategory?, attachments
- **ActivityEvent** — id, productId, actorId, eventType, refType, refId, metadata, createdAt *(powers the timeline + notifications)*
- **Notification** — id, userId, eventId, read
- **Attachment** — id, ownerType, ownerId, fileUrl, fileType, uploadedBy *(backed by `STORAGE_PROVIDER`)*

## 8. Technical Architecture

The app is split into a Python API and a JS frontend — two deployables, not one full-stack framework. This was a deliberate simplification decision: a Next.js full-stack app (server actions, NextAuth, Prisma) was prototyped first, but the backend was rebuilt in Python because it's a lighter, less opinionated surface for the domain logic (lifecycle rules, activity events, future AI features) than the Next.js server-runtime conventions, and it decouples "how data is stored and validated" from "how the UI renders" — which matters once Phase 3's interactive layer gets built.

**Backend** (`backend/`):
- **Framework**: FastAPI, run via Uvicorn
- **ORM/models**: SQLModel (SQLAlchemy + Pydantic in one model definition) against Postgres, via `psycopg` 3
- **Migrations**: `SQLModel.metadata.create_all()` at startup for now — the troublefree option while the schema is still moving. Move to Alembic once the schema stabilizes and there's real data to migrate. **Gotcha**: every `(str, Enum)` field (lifecycle stage, statuses, priorities, ...) becomes a native Postgres `ENUM` type, and `create_all()` only creates *missing* types/tables — it never `ALTER`s an existing one. Adding a new member to any of these Python enums (e.g. `LifecycleStage.INFOSEC`) needs a matching `ALTER TYPE ... ADD VALUE IF NOT EXISTS` run at startup or the DB will reject the new value outright. `app/database.py`'s `_sync_lifecycle_stage_enum()` does this for `LifecycleStage`; the same pattern will be needed for any other enum that grows in Phase 2 (e.g. adding a bug status) until Alembic is in place.
- **Auth**: hand-rolled JWT issuance (`python-jose`), provider-swappable via `AUTH_PROVIDER` exactly as originally planned (`dev-credentials` today — email-only, no password, issues a JWT; `entra-id`/`google` are the same env-var switch later, just not wired yet)
- **AI**: `AI_PROVIDER` abstraction (`mock` default, swappable to `anthropic`/`openai`/`azure-openai`) — used for §6.9 features only, never load-bearing for core functionality
- **File storage**: `STORAGE_PROVIDER` abstraction (`local-disk` for dev, `s3` for production)

**Frontend** (`frontend/`):
- **Framework**: Vite + React 19 + TypeScript, client-side routing via `react-router-dom`
- **UI**: Tailwind 4, CVA for variants, lucide-react icons, sonner for toasts (same visual system as originally planned, just without the Radix/shadcn primitives library — plain elements styled directly, kept light since the frontend has no server runtime to lean on)
- **Data**: a thin `fetch` wrapper (`src/lib/api.ts`) attaches the JWT from `localStorage` to every request; no client-side state library yet, plain `useState`/`useEffect` per page until that stops being enough

**Local dev**: backend runs via `uvicorn app.main:app --reload`, frontend via `npm run dev` (Vite), both talk to a local Postgres. CORS on the backend allows the Vite dev origin.

**Production**: `docker-compose.yml` runs three services — `postgres`, `backend` (FastAPI on :8000), and `frontend` (an nginx container serving the built static assets and proxying `/api/*` to `backend`, so the browser only ever talks to one origin). `docker/Dockerfile` (the old single Next.js image) is gone — each app now has its own `Dockerfile` next to its code (`backend/Dockerfile`, `frontend/Dockerfile`).

## 9. Current Build State

**Phase 1 is functionally complete.** Every module in §11's Phase 1 list is built, wired end-to-end against real Postgres, and verified both via direct API calls and a driven headless-browser session (Playwright) with zero console errors — including the full loop of drafting a BRD, submitting it for review, approving it, creating and progressing a task, and uploading a versioned architecture diagram, with the lifecycle-stage tracker advancing automatically at each step (Intake → BRD review → Planning → Development).

**Working today:**
- FastAPI backend with the full v1 data model (all entities from §7) defined in `backend/app/models.py`, tables created automatically on startup
- Dev-credentials auth: `POST /api/auth/dev-login` issues a JWT, `GET /api/auth/me` validates it
- Product endpoints: create, list (scoped to the caller's memberships), detail (with member list), and **add member** (`POST /api/products/{id}/members` — PM/Admin only, find-or-creates the invited user by email so a PM can add a Stakeholder/Delivery teammate before they've ever signed in)
- **BRD module** (`app/routers/brd.py`): structured in-app editor (objective/scope/requirements/acceptance-criteria sections, stored as JSON in the existing `content` column — no upload-a-document path in v1, see §12's resolved open question), versioning (`new-version` clones an approved BRD into a fresh draft), full review workflow (`submit` → `request-changes`/`approve`), section-anchored resolvable comments
- **Task module** (`app/routers/tasks.py`): CRUD (PM/Admin create; assignee may only change their own task's status), progress updates (`ProgressUpdate` rows feed the activity timeline), each task tagged with a `stage` (§6.3) that drives stage reopen/auto-advance
- **Architecture diagram module** (`app/routers/diagrams.py`): multipart upload backed by the `local-disk` `STORAGE_PROVIDER` (`app/storage.py`, served back via a `/uploads` static mount), versioning by title, comment thread
- **Lifecycle stage transitions are automatic where a module exists to derive them** (`app/lifecycle.py`): BRD submitted → `BRD_REVIEW`; BRD approved → `PLANNING`; first task progress update posted → `DEVELOPMENT`; a stage's tasks all reaching Done → next stage (`maybe_advance_when_stage_cleared`); a task landing on an earlier, already-passed stage → that stage reopens (`maybe_reopen_stage`). This resolves the open question from HANDOFF.md's prior session. Stages with no dedicated module yet and no tasks tagged against them (`INFOSEC` until it gets a real review module, and anything from `UAT` onward before Phase 2) still use the **manual PM-only fallback** — `POST /api/products/{id}/advance-stage` moves the product exactly one step along the canonical loop order (`LIFECYCLE_ORDER` in `app/models.py`); surfaced in the UI as an "Advance to `<next stage>`" button on the product page.
- **Role-based access control** (`app/permissions.py`): every mutating endpoint checks the caller's `ProductMember` role server-side (global `Admin` bypasses); verified via curl and a driven Stakeholder browser session that edit controls are hidden/rejected while review controls (approve/request-changes/comment) work — see PRD §4's action table, now fully enforced rather than just documented
- React frontend: sign-in, dashboard, new-product form, product detail page (lifecycle tracker + live module summary cards + team list with an "Add member" form + activity feed), and three full module pages — `/products/:id/brd`, `/products/:id/tasks` (kanban + list views), `/products/:id/diagrams` (grid + zoomable lightbox viewer)
- Docker Compose for the full stack (postgres + backend + frontend via nginx), config-validated

**Known local-environment quirks** (machine-specific, not app bugs — noted here so they don't get "fixed" by accident later):
- This machine already has other processes bound to ports 5432, 8000, and 5173 outside of anything this project started. Local (non-Docker) dev here runs Postgres on **5433** via the portable binaries in `.pgsql-portable/`, the backend on **8010**, and the frontend on **5174** — reflected in the local `.env` files. `.env.example` files document the standard ports (5432/8000/5173) for a clean machine.
- Docker itself returned a permission error in this environment (`permission denied ... npipe:////./pipe/docker_engine`) when tried directly, so the Compose setup is config-validated (`docker compose config`) but not build-and-run verified here. Worth a real `docker compose up --build` once Docker access is sorted out, or if this is normal on this machine, from a session with the right permissions.
- **`uvicorn --reload` is unreliable on this machine** — this session hit reload cycles that silently kept an old worker process alive (serving stale routes) instead of picking up file changes, and the stale process wasn't killable by PID through the normal Windows process APIs (this looks like a shared/multi-session terminal server, per the unrelated other-user processes visible via `ps -W`). Workaround: run uvicorn **without** `--reload` during a session and manually restart (`taskkill /F /PID <pid>` if `Stop-Process` reports the PID doesn't exist — try the numeric PID printed in uvicorn's own startup log, not whatever `Get-NetTCPConnection`/`Get-CimInstance` report) after backend edits, then re-curl to confirm new routes are actually registered before trusting the running server.

**Not built yet:** UAT cycles, bug tracking, post-production feedback, notifications, and the richer Phase 2/3 visual dashboard — see the roadmap in §11, now updated to reflect Phase 1's completion.

## 10. Non-Functional Requirements

- **Access control**: every product-scoped action enforced server-side by `ProductMember` role, not just hidden in the UI.
- **Audit trail**: `ActivityEvent` log is authoritative and immutable — status changes, approvals, and assignments are always traceable to an actor and timestamp.
- **File limits**: sane per-upload size caps for BRDs/diagrams/screenshots (exact limits TBD, enforced at the storage abstraction layer so they apply regardless of provider).
- **Responsive**: desktop-first (this is a working tool used at a desk) but usable on tablet for quick status checks/approvals on the go; not a native mobile app in v1.
- **Theming**: light/dark, since Tailwind is already in place and this is a daily-use tool.
- **Performance**: activity timeline and dashboards should feel instant — paginate/virtualize event feeds rather than loading full history.

## 11. Phased Roadmap to Closure

Development is organized into three phases. Each phase ships something usable end-to-end rather than a horizontal slice (e.g., Phase 1 is not "just the database," it's "you can actually run a BRD through review" ).

### Phase 1 — Foundation & Core Lifecycle Engine ✅ complete
*Goal: a working internal tool covering Intake → BRD Review → Planning → Development, with the base visual shell every later phase plugs into.*

- ~~Foundation: FastAPI backend + Vite/React frontend scaffolded, full v1 data model, dev-credentials JWT auth, Docker Compose~~ **done**
- ~~App shell: nav, theming (light/dark), empty-state product dashboard, activity-event logging wired from day one~~ **done**
- ~~Product workspace: create/list/view, membership & per-product roles (§4)~~ **done** (including the add-member endpoint/UI that makes multi-role collaboration actually usable, not just modeled)
- ~~BRD module: author (structured in-app editor), versioning, section-anchored review comments, approval workflow~~ **done**
- ~~Task assignment & development progress: CRUD, kanban + list views, progress updates~~ **done**
- ~~Architecture diagram upload, versioning, viewing~~ **done**
- ~~Lifecycle stage auto-advances on BRD submit/approve and first task progress update~~ **done**

### Phase 2 — Full Lifecycle Loop & Visual Intelligence
*Goal: close the loop end-to-end and make the dashboard the "highly informative, interactive" surface the vision calls for.*

- UAT cycles, structured pass/fail feedback, one-click fail → bug conversion
- Bug tracking: triage, severity, status flow, filtering by source
- Post-production feedback capture and triage back into a new requirement — closes the lifecycle loop
- Visual dashboard: graphical lifecycle-stage tracker, health tiles/charts, full card-based activity timeline (§6.8)
- Notification center, driven off the same event stream as the timeline

### Phase 3 — Differentiation Layer ("the million-dollar bets")
*Goal: the moments that make it feel premium day-to-day, and the one thing that makes leadership pay for it.*

- Cmd+K command palette and animated transitions throughout
- Live presence (who's viewing/editing right now) and inline pin comments on diagrams/screenshots
- AI co-pilot: Q&A over a product's own data ("what's blocking release?"), using the existing `AI_PROVIDER` abstraction
- AI-assisted BRD summarization, task-breakdown suggestions, feedback auto-categorization (§6.9), auto-generated narrative digests
- Shareable, read-only "product story" page for execs/external stakeholders — no login required
- Cross-product portfolio dashboard for leadership
- Hardening: real SSO cutover (Entra ID/Google), performance pass, deploy

**Status:** Phase 1 is complete and verified end-to-end. Phase 2 (UAT cycles, bug tracking, post-production feedback, the richer visual dashboard, notifications) is next.

## 12. Open Questions

- Exact severity/priority taxonomies for bugs (proposed: Low/Medium/High/Critical) — confirm matches existing team vocabulary if there is one. Still open, relevant once Phase 2's bug tracking module starts.
- ~~Should BRDs be authored in-app (structured editor) or purely uploaded documents in v1?~~ **Resolved for v1**: structured in-app editor only (objective/scope/requirements/acceptance-criteria), no document upload path. Revisit adding upload support in a later phase if teams show up with existing BRD templates they need to import rather than re-author.
- ~~Whether stage transitions are automatic or an explicit PM action~~ **Resolved**: automatic, derived from domain events (BRD submitted/approved, first task progress update) — see PRD §9 and `backend/app/lifecycle.py`.
- Real SSO timeline (Entra ID vs Google) — affects when `dev-credentials` can be retired.
- Who are the first real users/products this will run for, to validate the lifecycle model against a real BRD end-to-end?
- BRD approval in v1 is a single approve action by any PM/Stakeholder/Admin reviewer, not a multi-reviewer quorum with designated named reviewers (§6.2 says "sign-off from designated reviewer(s)" and "PM sees outstanding reviewers at a glance" — neither designation nor an outstanding-reviewers view exists yet). Worth deciding whether that's a real Phase 2 requirement or the single-approval model is good enough.
