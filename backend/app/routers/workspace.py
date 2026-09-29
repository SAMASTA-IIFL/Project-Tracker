import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, func, select

from app import ai
from app.activity import log_activity
from app.database import get_session
from app.deps import get_member_product
from app.models import (
    BRD,
    ArchitectureBoard,
    ArchitectureBoardVersion,
    BRDStatus,
    BudgetCategory,
    BudgetLineItem,
    HostingEnvironment,
    ProductRole,
    ProjectRepository,
    TechStackItem,
    User,
    new_id,
)
from app.permissions import require_roles
from app.schemas import (
    ArchitectureBoardRead,
    ArchitectureBoardUpdate,
    ArchitectureBoardVersionCreate,
    ArchitectureBoardVersionRead,
    ArchitectureSuggestion,
    BoardGenerateRequest,
    BoardGenerateResponse,
    BudgetCapUpdate,
    BudgetCategoryTotal,
    BudgetLineItemCreate,
    BudgetLineItemRead,
    BudgetLineItemUpdate,
    BudgetSummaryRead,
    HostingEnvironmentCreate,
    HostingEnvironmentRead,
    HostingEnvironmentUpdate,
    ProductRead,
    ProjectRepositoryCreate,
    ProjectRepositoryRead,
    ProjectRepositoryUpdate,
    TechStackItemCreate,
    TechStackItemRead,
    TechStackItemUpdate,
    UserRead,
)
from app.security import get_current_user

router = APIRouter(prefix="/api/products/{product_id}/workspace", tags=["workspace"])

# Repositories / tech stack / hosting / architecture board are edited by
# whoever actually owns this data day to day — same PM-or-Delivery gate the
# Diagrams module already uses for uploads. Budget is more sensitive and
# stays PM-only, per explicit product decision.
_EDIT_ROLES = {ProductRole.PM, ProductRole.DELIVERY}
_BUDGET_EDIT_ROLES = {ProductRole.PM}


def _user_read(user: User) -> UserRead:
    return UserRead(id=user.id, name=user.name, email=user.email)


# --- Repositories ---


def _repo_to_read(session: Session, repo: ProjectRepository) -> ProjectRepositoryRead:
    creator = session.get(User, repo.created_by_id)
    return ProjectRepositoryRead(
        id=repo.id, product_id=repo.product_id, label=repo.label, provider=repo.provider,
        url=repo.url, default_branch=repo.default_branch, notes=repo.notes, order=repo.order,
        created_by=_user_read(creator), created_at=repo.created_at, updated_at=repo.updated_at,
    )


@router.get("/repositories", response_model=list[ProjectRepositoryRead])
def list_repositories(product_id: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    get_member_product(product_id, session, user)
    repos = session.exec(
        select(ProjectRepository).where(ProjectRepository.product_id == product_id).order_by(ProjectRepository.order)
    ).all()
    return [_repo_to_read(session, r) for r in repos]


@router.post("/repositories", response_model=ProjectRepositoryRead)
def create_repository(
    product_id: str, body: ProjectRepositoryCreate,
    session: Session = Depends(get_session), user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, _EDIT_ROLES)

    existing_count = session.exec(
        select(func.count(ProjectRepository.id)).where(ProjectRepository.product_id == product_id)
    ).one()
    repo = ProjectRepository(
        product_id=product_id, label=body.label, provider=body.provider, url=body.url,
        default_branch=body.default_branch, notes=body.notes, order=existing_count, created_by_id=user.id,
    )
    session.add(repo)
    session.commit()
    session.refresh(repo)

    log_activity(
        session, product_id=product_id, actor_id=user.id,
        event_type="WORKSPACE_REPO_ADDED", ref_type="PROJECT_REPOSITORY", ref_id=repo.id,
        metadata={"label": repo.label},
    )
    return _repo_to_read(session, repo)


def _get_repo_or_404(session: Session, product_id: str, repo_id: str) -> ProjectRepository:
    repo = session.get(ProjectRepository, repo_id)
    if not repo or repo.product_id != product_id:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


@router.patch("/repositories/{repo_id}", response_model=ProjectRepositoryRead)
def update_repository(
    product_id: str, repo_id: str, body: ProjectRepositoryUpdate,
    session: Session = Depends(get_session), user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, _EDIT_ROLES)
    repo = _get_repo_or_404(session, product_id, repo_id)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(repo, field, value)
    repo.updated_at = datetime.utcnow()
    session.add(repo)
    session.commit()
    session.refresh(repo)
    return _repo_to_read(session, repo)


@router.delete("/repositories/{repo_id}", status_code=204)
def delete_repository(
    product_id: str, repo_id: str,
    session: Session = Depends(get_session), user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, _EDIT_ROLES)
    repo = _get_repo_or_404(session, product_id, repo_id)
    session.delete(repo)
    session.commit()


# --- Tech stack ---


def _tech_to_read(session: Session, item: TechStackItem) -> TechStackItemRead:
    creator = session.get(User, item.created_by_id)
    return TechStackItemRead(
        id=item.id, product_id=item.product_id, category=item.category, name=item.name,
        version=item.version, url=item.url, notes=item.notes, order=item.order,
        created_by=_user_read(creator), created_at=item.created_at, updated_at=item.updated_at,
    )


@router.get("/tech-stack", response_model=list[TechStackItemRead])
def list_tech_stack(product_id: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    get_member_product(product_id, session, user)
    items = session.exec(
        select(TechStackItem).where(TechStackItem.product_id == product_id).order_by(TechStackItem.category, TechStackItem.order)
    ).all()
    return [_tech_to_read(session, i) for i in items]


@router.post("/tech-stack", response_model=TechStackItemRead)
def create_tech_stack_item(
    product_id: str, body: TechStackItemCreate,
    session: Session = Depends(get_session), user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, _EDIT_ROLES)

    existing_count = session.exec(
        select(func.count(TechStackItem.id)).where(
            TechStackItem.product_id == product_id, TechStackItem.category == body.category
        )
    ).one()
    item = TechStackItem(
        product_id=product_id, category=body.category, name=body.name, version=body.version,
        url=body.url, notes=body.notes, order=existing_count, created_by_id=user.id,
    )
    session.add(item)
    session.commit()
    session.refresh(item)

    log_activity(
        session, product_id=product_id, actor_id=user.id,
        event_type="WORKSPACE_TECH_ITEM_ADDED", ref_type="TECH_STACK_ITEM", ref_id=item.id,
        metadata={"name": item.name, "category": item.category},
    )
    return _tech_to_read(session, item)


def _get_tech_item_or_404(session: Session, product_id: str, item_id: str) -> TechStackItem:
    item = session.get(TechStackItem, item_id)
    if not item or item.product_id != product_id:
        raise HTTPException(status_code=404, detail="Tech stack item not found")
    return item


@router.patch("/tech-stack/{item_id}", response_model=TechStackItemRead)
def update_tech_stack_item(
    product_id: str, item_id: str, body: TechStackItemUpdate,
    session: Session = Depends(get_session), user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, _EDIT_ROLES)
    item = _get_tech_item_or_404(session, product_id, item_id)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    item.updated_at = datetime.utcnow()
    session.add(item)
    session.commit()
    session.refresh(item)
    return _tech_to_read(session, item)


@router.delete("/tech-stack/{item_id}", status_code=204)
def delete_tech_stack_item(
    product_id: str, item_id: str,
    session: Session = Depends(get_session), user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, _EDIT_ROLES)
    item = _get_tech_item_or_404(session, product_id, item_id)
    session.delete(item)
    session.commit()


# --- Hosting environments ---


def _hosting_to_read(session: Session, env: HostingEnvironment) -> HostingEnvironmentRead:
    creator = session.get(User, env.created_by_id)
    return HostingEnvironmentRead(
        id=env.id, product_id=env.product_id, name=env.name, provider=env.provider,
        url=env.url, region=env.region, notes=env.notes, order=env.order,
        created_by=_user_read(creator), created_at=env.created_at, updated_at=env.updated_at,
    )


@router.get("/hosting", response_model=list[HostingEnvironmentRead])
def list_hosting(product_id: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    get_member_product(product_id, session, user)
    envs = session.exec(
        select(HostingEnvironment).where(HostingEnvironment.product_id == product_id).order_by(HostingEnvironment.order)
    ).all()
    return [_hosting_to_read(session, e) for e in envs]


@router.post("/hosting", response_model=HostingEnvironmentRead)
def create_hosting(
    product_id: str, body: HostingEnvironmentCreate,
    session: Session = Depends(get_session), user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, _EDIT_ROLES)

    existing_count = session.exec(
        select(func.count(HostingEnvironment.id)).where(HostingEnvironment.product_id == product_id)
    ).one()
    env = HostingEnvironment(
        product_id=product_id, name=body.name, provider=body.provider, url=body.url,
        region=body.region, notes=body.notes, order=existing_count, created_by_id=user.id,
    )
    session.add(env)
    session.commit()
    session.refresh(env)

    log_activity(
        session, product_id=product_id, actor_id=user.id,
        event_type="WORKSPACE_HOSTING_ADDED", ref_type="HOSTING_ENVIRONMENT", ref_id=env.id,
        metadata={"name": env.name},
    )
    return _hosting_to_read(session, env)


def _get_hosting_or_404(session: Session, product_id: str, env_id: str) -> HostingEnvironment:
    env = session.get(HostingEnvironment, env_id)
    if not env or env.product_id != product_id:
        raise HTTPException(status_code=404, detail="Hosting environment not found")
    return env


@router.patch("/hosting/{env_id}", response_model=HostingEnvironmentRead)
def update_hosting(
    product_id: str, env_id: str, body: HostingEnvironmentUpdate,
    session: Session = Depends(get_session), user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, _EDIT_ROLES)
    env = _get_hosting_or_404(session, product_id, env_id)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(env, field, value)
    env.updated_at = datetime.utcnow()
    session.add(env)
    session.commit()
    session.refresh(env)
    return _hosting_to_read(session, env)


@router.delete("/hosting/{env_id}", status_code=204)
def delete_hosting(
    product_id: str, env_id: str,
    session: Session = Depends(get_session), user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, _EDIT_ROLES)
    env = _get_hosting_or_404(session, product_id, env_id)
    session.delete(env)
    session.commit()


# --- Budget ---


def _budget_to_read(session: Session, item: BudgetLineItem) -> BudgetLineItemRead:
    creator = session.get(User, item.created_by_id)
    return BudgetLineItemRead(
        id=item.id, product_id=item.product_id, category=item.category, name=item.name,
        planned_amount=item.planned_amount, actual_amount=item.actual_amount, currency=item.currency,
        period=item.period, notes=item.notes, created_by=_user_read(creator),
        created_at=item.created_at, updated_at=item.updated_at,
    )


@router.get("/budget", response_model=list[BudgetLineItemRead])
def list_budget(product_id: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    get_member_product(product_id, session, user)
    items = session.exec(
        select(BudgetLineItem).where(BudgetLineItem.product_id == product_id).order_by(BudgetLineItem.created_at)
    ).all()
    return [_budget_to_read(session, i) for i in items]


@router.get("/budget/summary", response_model=BudgetSummaryRead)
def budget_summary(product_id: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    product = get_member_product(product_id, session, user)
    items = session.exec(select(BudgetLineItem).where(BudgetLineItem.product_id == product_id)).all()

    totals_by_category: dict[BudgetCategory, dict[str, float]] = {}
    for item in items:
        bucket = totals_by_category.setdefault(item.category, {"planned": 0.0, "actual": 0.0})
        bucket["planned"] += item.planned_amount
        bucket["actual"] += item.actual_amount

    return BudgetSummaryRead(
        total_planned=sum(i.planned_amount for i in items),
        total_actual=sum(i.actual_amount for i in items),
        budget_cap=product.budget_cap,
        by_category=[
            BudgetCategoryTotal(category=cat, planned=vals["planned"], actual=vals["actual"])
            for cat, vals in totals_by_category.items()
        ],
    )


@router.post("/budget", response_model=BudgetLineItemRead)
def create_budget_item(
    product_id: str, body: BudgetLineItemCreate,
    session: Session = Depends(get_session), user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, _BUDGET_EDIT_ROLES)

    item = BudgetLineItem(
        product_id=product_id, category=body.category, name=body.name, planned_amount=body.planned_amount,
        actual_amount=body.actual_amount, currency=body.currency, period=body.period, notes=body.notes,
        created_by_id=user.id,
    )
    session.add(item)
    session.commit()
    session.refresh(item)

    log_activity(
        session, product_id=product_id, actor_id=user.id,
        event_type="BUDGET_LINE_ITEM_ADDED", ref_type="BUDGET_LINE_ITEM", ref_id=item.id,
        metadata={"name": item.name, "category": item.category, "planned_amount": item.planned_amount},
    )
    return _budget_to_read(session, item)


def _get_budget_item_or_404(session: Session, product_id: str, item_id: str) -> BudgetLineItem:
    item = session.get(BudgetLineItem, item_id)
    if not item or item.product_id != product_id:
        raise HTTPException(status_code=404, detail="Budget line item not found")
    return item


@router.patch("/budget/{item_id}", response_model=BudgetLineItemRead)
def update_budget_item(
    product_id: str, item_id: str, body: BudgetLineItemUpdate,
    session: Session = Depends(get_session), user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, _BUDGET_EDIT_ROLES)
    item = _get_budget_item_or_404(session, product_id, item_id)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    item.updated_at = datetime.utcnow()
    session.add(item)
    session.commit()
    session.refresh(item)
    return _budget_to_read(session, item)


@router.delete("/budget/{item_id}", status_code=204)
def delete_budget_item(
    product_id: str, item_id: str,
    session: Session = Depends(get_session), user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, _BUDGET_EDIT_ROLES)
    item = _get_budget_item_or_404(session, product_id, item_id)
    session.delete(item)
    session.commit()


@router.patch("/budget-cap", response_model=ProductRead)
def update_budget_cap(
    product_id: str, body: BudgetCapUpdate,
    session: Session = Depends(get_session), user: User = Depends(get_current_user),
):
    product = get_member_product(product_id, session, user)
    require_roles(session, product_id, user, _BUDGET_EDIT_ROLES)

    product.budget_cap = body.budget_cap
    session.add(product)
    session.commit()
    session.refresh(product)
    return product


# --- Architecture board ---


def _get_or_create_board(session: Session, product_id: str, user: User) -> ArchitectureBoard:
    board = session.exec(select(ArchitectureBoard).where(ArchitectureBoard.product_id == product_id)).first()
    if board:
        return board
    board = ArchitectureBoard(product_id=product_id, updated_by_id=user.id)
    session.add(board)
    session.commit()
    session.refresh(board)
    return board


def _board_to_read(session: Session, board: ArchitectureBoard) -> ArchitectureBoardRead:
    updater = session.get(User, board.updated_by_id)
    return ArchitectureBoardRead(
        id=board.id, product_id=board.product_id, graph_json=board.graph_json,
        updated_by=_user_read(updater), created_at=board.created_at, updated_at=board.updated_at,
    )


@router.get("/board", response_model=ArchitectureBoardRead)
def get_board(product_id: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    get_member_product(product_id, session, user)
    board = _get_or_create_board(session, product_id, user)
    return _board_to_read(session, board)


@router.patch("/board", response_model=ArchitectureBoardRead)
def update_board(
    product_id: str, body: ArchitectureBoardUpdate,
    session: Session = Depends(get_session), user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, _EDIT_ROLES)
    board = _get_or_create_board(session, product_id, user)

    board.graph_json = body.graph_json
    board.updated_by_id = user.id
    board.updated_at = datetime.utcnow()
    session.add(board)
    session.commit()
    session.refresh(board)
    return _board_to_read(session, board)


@router.get("/board/versions", response_model=list[ArchitectureBoardVersionRead])
def list_board_versions(product_id: str, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    get_member_product(product_id, session, user)
    versions = session.exec(
        select(ArchitectureBoardVersion)
        .where(ArchitectureBoardVersion.product_id == product_id)
        .order_by(ArchitectureBoardVersion.version.desc())
    ).all()
    result = []
    for v in versions:
        saver = session.get(User, v.saved_by_id)
        result.append(
            ArchitectureBoardVersionRead(
                id=v.id, product_id=v.product_id, version=v.version, graph_json=v.graph_json,
                label=v.label, saved_by=_user_read(saver), created_at=v.created_at,
            )
        )
    return result


@router.post("/board/versions", response_model=ArchitectureBoardVersionRead)
def create_board_version(
    product_id: str, body: ArchitectureBoardVersionCreate,
    session: Session = Depends(get_session), user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, _EDIT_ROLES)
    board = _get_or_create_board(session, product_id, user)

    latest = session.exec(
        select(func.max(ArchitectureBoardVersion.version)).where(ArchitectureBoardVersion.product_id == product_id)
    ).one()
    next_version = (latest or 0) + 1

    version = ArchitectureBoardVersion(
        product_id=product_id, version=next_version, graph_json=board.graph_json,
        label=body.label, saved_by_id=user.id,
    )
    session.add(version)
    session.commit()
    session.refresh(version)

    log_activity(
        session, product_id=product_id, actor_id=user.id,
        event_type="BOARD_VERSION_SAVED", ref_type="ARCHITECTURE_BOARD_VERSION", ref_id=version.id,
        metadata={"version": next_version},
    )
    return ArchitectureBoardVersionRead(
        id=version.id, product_id=version.product_id, version=version.version, graph_json=version.graph_json,
        label=version.label, saved_by=_user_read(user), created_at=version.created_at,
    )


# --- AI-assisted board generation ---


# Turns the AI's key-referenced nodes/edges into a real graph with UUIDs and
# positions. LLMs are unreliable at pixel layout, so instead of asking for
# it, this does a standard layered (Sugiyama-style) left-to-right layout:
# Kahn's algorithm buckets nodes into layers by longest path from a source,
# columns = layers, rows = order within a layer. Any node not reachable via
# edges (isolated, or part of a cycle the peel loop can't clear) still gets
# placed — appended to the layer after everything that peeled cleanly —
# so a malformed AI response degrades to "ungraded but present," never lost.
def _layout_graph(suggestion: ArchitectureSuggestion) -> dict:
    key_to_id = {n.key: new_id() for n in suggestion.nodes}
    valid_edges = [e for e in suggestion.edges if e.source in key_to_id and e.target in key_to_id]

    successors: dict[str, list[str]] = {k: [] for k in key_to_id}
    in_degree: dict[str, int] = {k: 0 for k in key_to_id}
    for e in valid_edges:
        successors[e.source].append(e.target)
        in_degree[e.target] += 1

    layer: dict[str, int] = {}
    queue = [k for k, d in in_degree.items() if d == 0]
    for k in queue:
        layer[k] = 0
    remaining = dict(in_degree)
    while queue:
        current = queue.pop(0)
        for nxt in successors[current]:
            remaining[nxt] -= 1
            candidate_layer = layer[current] + 1
            layer[nxt] = max(layer.get(nxt, 0), candidate_layer)
            if remaining[nxt] == 0 and nxt not in queue:
                queue.append(nxt)

    unplaced = [k for k in key_to_id if k not in layer]
    if unplaced:
        fallback_layer = (max(layer.values()) + 1) if layer else 0
        for k in unplaced:
            layer[k] = fallback_layer

    rows_used: dict[int, int] = {}
    positions: dict[str, dict[str, float]] = {}
    for n in suggestion.nodes:
        l = layer[n.key]
        row = rows_used.get(l, 0)
        rows_used[l] = row + 1
        positions[n.key] = {"x": l * 260 + 40, "y": row * 140 + 40}

    nodes = [
        {
            "id": key_to_id[n.key],
            "type": "archNode",
            "position": positions[n.key],
            "data": {"label": n.label, "category": n.category, "description": n.description},
        }
        for n in suggestion.nodes
    ]
    edges = [
        {
            "id": new_id(),
            "source": key_to_id[e.source],
            "target": key_to_id[e.target],
            "label": e.label,
            "data": {"kind": e.kind},
        }
        for e in valid_edges
    ]
    return {"nodes": nodes, "edges": edges}


@router.post("/board/generate", response_model=BoardGenerateResponse)
def generate_board(
    product_id: str, body: BoardGenerateRequest,
    session: Session = Depends(get_session), user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)
    require_roles(session, product_id, user, _EDIT_ROLES)

    brd_context = None
    if body.use_brd:
        brds = session.exec(select(BRD).where(BRD.product_id == product_id)).all()
        if brds:
            latest = max(brds, key=lambda b: b.version)
            if latest.status == BRDStatus.APPROVED and latest.content:
                try:
                    sections = json.loads(latest.content)
                except (json.JSONDecodeError, TypeError):
                    sections = {}
                brd_context = "\n".join(f"{k}: {v}" for k, v in sections.items() if v)

    try:
        suggestion = ai.generate_architecture(body.prompt, brd_context)
    except (RuntimeError, NotImplementedError) as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return BoardGenerateResponse(graph_json=_layout_graph(suggestion))
