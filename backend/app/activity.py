from app.models import ActivityEvent, activity_events_db


# Every domain action that matters to a product's story should call this.
# It is the single source for both the product activity timeline and
# per-user notifications.
def log_activity(
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
    return activity_events_db.set(event)
