from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db
from app.routers import activity, auth, brd, bugs, diagrams, infosec, products, tasks, uat, users, vault, workspace
from app.vault_recovery import ensure_vault_recovery_key


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    ensure_vault_recovery_key()
    Path(settings.storage_local_dir).mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="Product Pro API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(products.router)
app.include_router(activity.router)
app.include_router(brd.router)
app.include_router(tasks.router)
app.include_router(diagrams.router)
app.include_router(infosec.bank_router)
app.include_router(infosec.router)
app.include_router(uat.router)
app.include_router(bugs.router)
app.include_router(workspace.router)
app.include_router(users.router)
app.include_router(vault.router)

# Backs the "local-disk" STORAGE_PROVIDER (PRD §8) — served directly by FastAPI
# in dev; production would front this with a real object store / CDN.
app.mount("/uploads", StaticFiles(directory=settings.storage_local_dir, check_dir=False), name="uploads")


@app.get("/api/health")
def health():
    return {"status": "ok"}
