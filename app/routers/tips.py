"""Tips: discretionary payments to a teammate, with a UPI QR to settle them.

Received tips are private: ``/received`` always answers for the caller, so a
person can see their own tip income and nobody else's.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import Transaction, User
from ..payments_service import (
    TIP,
    confirm,
    create,
    list_for,
    qr_data_uri,
    received_tips_total,
    to_out,
    upi_link,
)
from ..schemas import TipIn, TipOut, TipSummaryOut, TransactionOut

router = APIRouter(prefix="/api/tips", tags=["tips"])


@router.post("", response_model=TipOut, status_code=status.HTTP_201_CREATED)
def send_tip(
    payload: TipIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TipOut:
    tx = create(
        db,
        user,
        payload.payee_username,
        payload.amount,
        payload.project_id,
        payload.note,
        kind=TIP,
    )
    link = upi_link(db, tx)
    out = to_out(db, tx)
    return TipOut(
        id=out.id,
        project_id=out.project_id,
        payer_username=out.payer_username,
        payee_username=out.payee_username,
        amount=out.amount,
        currency=out.currency,
        status=out.status,
        signature=out.signature,
        upi_link=link,
        qr_svg=qr_data_uri(link),
        note=out.note,
        created_at=out.created_at,
    )


@router.post("/{tip_id}/confirm", response_model=TransactionOut)
def confirm_tip(
    tip_id: int,
    body: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TransactionOut:
    tx = confirm(db, tip_id, user, body.get("upi_txn_id"))
    return to_out(db, tx)


@router.get("/received", response_model=TipSummaryOut)
def received(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> TipSummaryOut:
    total, count = received_tips_total(db, user.id)
    tips = [
        to_out(db, tx)
        for tx in list_for(db, user.id, role="received", kind=TIP)
        if tx.status == "PAID"
    ]
    return TipSummaryOut(total=total, count=count, tips=tips)


@router.get("/sent", response_model=list[TransactionOut])
def sent(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[TransactionOut]:
    return [to_out(db, tx) for tx in list_for(db, user.id, role="sent", kind=TIP)]


@router.get("/{tip_id}", response_model=TransactionOut)
def get_tip(
    tip_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TransactionOut:
    from fastapi import HTTPException

    tx = db.get(Transaction, tip_id)
    if tx is None or tx.kind != TIP or (tx.payer_id != user.id and tx.payee_id != user.id):
        raise HTTPException(status_code=404, detail="No such tip")
    return to_out(db, tx)
