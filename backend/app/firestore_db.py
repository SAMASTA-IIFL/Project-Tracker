"""Firestore access layer — the Postgres/SQLModel replacement.

Firestore is a schemaless document store: each SQLModel table from the old
app/database.py becomes one top-level collection here, with the same field
names. `Collection[T]` is a small generic wrapper that covers every query
shape the routers actually use (get-by-id, equality/`in` filters, order-by,
limit) — there is no ORM, no joins, and no migrations to run, so this stays
intentionally thin rather than trying to imitate SQLAlchemy.
"""

import threading
from enum import Enum
from typing import Generic, TypeVar

import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.base_query import FieldFilter
from pydantic import BaseModel

from app.config import settings

_lock = threading.Lock()
_app: firebase_admin.App | None = None


def _init_app() -> firebase_admin.App:
    global _app
    if _app is not None:
        return _app
    with _lock:
        if _app is not None:
            return _app
        cred = (
            credentials.Certificate(settings.firebase_credentials_path)
            if settings.firebase_credentials_path
            else credentials.ApplicationDefault()
        )
        options = {"projectId": settings.firebase_project_id} if settings.firebase_project_id else None
        _app = firebase_admin.initialize_app(cred, options)
        return _app


def get_client() -> firestore.Client:
    _init_app()
    return firestore.client()


def _normalize(value):
    """Recursively turn (str,Enum) members into plain strings so every value
    written to Firestore is a plain JSON-safe primitive — Pydantic's own
    model_dump(mode="python") leaves Enum members as Enum instances, which
    the Firestore client does not know how to serialize."""
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, dict):
        return {k: _normalize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_normalize(v) for v in value]
    return value


def to_doc(model: BaseModel) -> dict:
    return _normalize(model.model_dump(mode="python", exclude={"id"}))


T = TypeVar("T", bound=BaseModel)


class Collection(Generic[T]):
    def __init__(self, name: str, model: type[T]):
        self.name = name
        self.model = model

    def _col(self):
        return get_client().collection(self.name)

    def _from_doc(self, doc) -> T | None:
        if not doc.exists:
            return None
        data = doc.to_dict() or {}
        data["id"] = doc.id
        return self.model(**data)

    def get(self, id: str | None) -> T | None:
        if not id:
            return None
        return self._from_doc(self._col().document(id).get())

    def set(self, model: T) -> T:
        self._col().document(model.id).set(to_doc(model))
        return model

    def delete(self, id: str) -> None:
        self._col().document(id).delete()

    # `order_by`/`desc`/`limit` are reserved kwarg names for this helper —
    # every model field used as a filter here (task.status, budget.category,
    # ...) is a different name, so there's no collision with real field names.
    def where(self, *, order_by: str | None = None, desc: bool = False, limit: int | None = None, **filters) -> list[T]:
        q = self._col()
        for field, value in filters.items():
            if isinstance(value, (list, tuple, set)):
                vals = [v.value if isinstance(v, Enum) else v for v in value]
                q = q.where(filter=FieldFilter(field, "in", vals))
            else:
                v = value.value if isinstance(value, Enum) else value
                q = q.where(filter=FieldFilter(field, "==", v))
        if order_by:
            direction = firestore.Query.DESCENDING if desc else firestore.Query.ASCENDING
            q = q.order_by(order_by, direction=direction)
        if limit is not None:
            q = q.limit(limit)
        return [self._from_doc(d) for d in q.stream()]

    def first(self, *, order_by: str | None = None, desc: bool = False, **filters) -> T | None:
        results = self.where(order_by=order_by, desc=desc, limit=1, **filters)
        return results[0] if results else None

    def all(self, *, order_by: str | None = None, desc: bool = False) -> list[T]:
        return self.where(order_by=order_by, desc=desc)
