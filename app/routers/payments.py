from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import Transaction, User
from ..payments_service import confirm, create, list_for, to_out, upi_link
from ..schemas import TransactionIn, TransactionOut, UpiLinkOut

router = APIRouter(prefix="/api/payments", tags=["payments"])


def _out(tx, db) -> TransactionOut:
    return to_out(db, tx)


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_payment(
    payload: TransactionIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TransactionOut:
    tx = create(db, user, payload.payee_username, payload.amount, payload.project_id, payload.note)
    return _out(tx, db)


@router.get("/{transaction_id}", response_model=TransactionOut)
def get_payment(
    transaction_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TransactionOut:
    tx = db.get(Transaction, transaction_id)
    if tx is None or (tx.payer_id != user.id and tx.payee_id != user.id):
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="No such transaction")
    return _out(tx, db)


@router.get("/{transaction_id}/upi-link", response_model=UpiLinkOut)
def get_upi_link(
    transaction_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UpiLinkOut:
    tx = db.get(Transaction, transaction_id)
    if tx is None or tx.payer_id != user.id:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="No such transaction")
    return UpiLinkOut(upi_link=upi_link(db, tx))


@router.post("/{transaction_id}/confirm", response_model=TransactionOut)
def confirm_payment(
    transaction_id: int,
    body: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TransactionOut:
    tx = confirm(db, transaction_id, user, body.get("upi_txn_id"))
    return _out(tx, db)


@router.get("", response_model=list[TransactionOut])
def list_payments(
    role: str = Query(default="all"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TransactionOut]:
    txs = list_for(db, user.id, role)
    return [_out(tx, db) for tx in txs]
