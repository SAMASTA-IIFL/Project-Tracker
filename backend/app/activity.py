from sqlmodel import Session

from app.models import ActivityEvent


# Every domain action that matters to a product's story should call this.
# It is the single source for both the product activity timeline (Phase 2)
# and per-user notifications (Phase 2) — logged from day one so later
# phases only need to add readers, not writers.
def log_activity(
    session: Session,
    *,
    product_id: str,
    actor_id: str,
    event_type: str,
    ref_type: str,
    ref_id: str,
    metadata: dict | None = None,
) -> ActivityEvent:
    event = ActivityEvent(
        product_id=product_id,
        actor_id=actor_id,
        event_type=event_type,
        ref_type=ref_type,
        ref_id=ref_id,
        metadata_=metadata,
    )
    session.add(event)
    session.commit()
    session.refresh(event)
    return event
