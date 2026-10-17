"""UPI payments / transactions."""

from __future__ import annotations

from datetime import UTC, datetime
from urllib.parse import quote, urlencode

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .models import Transaction, User


def create(
    db: Session,
    payer: User,
    payee_username: str,
    amount: float,
    project_id: int | None = None,
    note: str | None = None,
) -> Transaction:
    payee = db.scalar(select(User).where(User.username == payee_username))
    if payee is None:
        raise HTTPException(status_code=404, detail="No such user")
    if payee.id == payer.id:
        raise HTTPException(status_code=400, detail="You cannot pay yourself")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    tx = Transaction(
        project_id=project_id,
        payer_id=payer.id,
        payee_id=payee.id,
        amount=amount,
        note=note,
        status="PENDING",
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


def upi_link(db: Session, tx: Transaction) -> str:
    payee = db.get(User, tx.payee_id)
    profile = payee.profile if payee else None
    upi_id = getattr(profile, "upi_id", None) if profile else None
    if not upi_id:
        raise HTTPException(status_code=400, detail="Payee has no UPI id set")
    params = {
        "pa": upi_id,
        "pn": payee.username if payee else "",
        "am": f"{float(tx.amount):.2f}",
        "cu": "INR",
        "tn": tx.note or f"SkillMatch payment #{tx.id}",
    }
    return "upi://pay?" + urlencode(params, quote_via=quote)


def confirm(db: Session, tx_id: int, actor: User, upi_txn_id: str | None) -> Transaction:
    tx = db.get(Transaction, tx_id)
    if tx is None:
        raise HTTPException(status_code=404, detail="No such transaction")
    if tx.payer_id != actor.id:
        raise HTTPException(status_code=403, detail="Only the payer can confirm")
    if tx.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Already {tx.status.lower()}")
    tx.status = "PAID"
    tx.upi_txn_id = upi_txn_id
    tx.paid_at = datetime.now(UTC)
    db.commit()
    db.refresh(tx)
    return tx


def list_for(db: Session, user_id: int, role: str = "all") -> list[Transaction]:
    stmt = select(Transaction)
    if role == "sent":
        stmt = stmt.where(Transaction.payer_id == user_id)
    elif role == "received":
        stmt = stmt.where(Transaction.payee_id == user_id)
    else:
        stmt = stmt.where(
            or_(Transaction.payer_id == user_id, Transaction.payee_id == user_id)
        )
    return list(db.scalars(stmt.order_by(Transaction.created_at.desc())).all())


__all__ = ["confirm", "create", "list_for", "upi_link"]
