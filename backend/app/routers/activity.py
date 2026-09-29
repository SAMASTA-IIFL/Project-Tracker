from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.database import get_session
from app.deps import get_member_product
from app.models import ActivityEvent, User
from app.schemas import ActivityEventRead, UserRead
from app.security import get_current_user

router = APIRouter(prefix="/api/products/{product_id}/activity", tags=["activity"])


@router.get("", response_model=list[ActivityEventRead])
def list_activity(
    product_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    get_member_product(product_id, session, user)

    events = session.exec(
        select(ActivityEvent)
        .where(ActivityEvent.product_id == product_id)
        .order_by(ActivityEvent.created_at.desc())
        .limit(20)
    ).all()

    result = []
    for event in events:
        actor = session.get(User, event.actor_id)
        result.append(
            ActivityEventRead(
                id=event.id,
                event_type=event.event_type,
                ref_type=event.ref_type,
                ref_id=event.ref_id,
                created_at=event.created_at,
                actor=UserRead(id=actor.id, name=actor.name, email=actor.email),
            )
        )
    return result
