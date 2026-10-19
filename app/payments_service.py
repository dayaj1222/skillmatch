"""UPI payments, tips, and QR codes.

A payment is only ever a *record* here: the money moves in the payer's UPI app.
To keep the paper trail trustworthy we stamp each row with an HMAC over its
facts, so the payee can verify a tip note that claims to be from SkillMatch.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
from datetime import UTC, datetime
from io import BytesIO
from urllib.parse import quote, urlencode

import qrcode
import qrcode.image.svg
from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .config import get_settings
from .models import Transaction, User
from .schemas import TransactionOut

TIP = "TIP"
PROJECT = "PROJECT"


def to_out(db: Session, tx: Transaction) -> TransactionOut:
    payer = db.get(User, tx.payer_id)
    payee = db.get(User, tx.payee_id)
    return TransactionOut(
        id=tx.id,
        project_id=tx.project_id,
        payer_id=tx.payer_id,
        payer_username=payer.username if payer else "?",
        payee_id=tx.payee_id,
        payee_username=payee.username if payee else "?",
        amount=float(tx.amount),
        currency=tx.currency,
        kind=tx.kind,
        status=tx.status,
        upi_txn_id=tx.upi_txn_id,
        signature=tx.signature,
        note=tx.note,
        created_at=tx.created_at,
        paid_at=tx.paid_at,
    )


def _signature(tx: Transaction) -> str:
    secret = get_settings().secret.encode()
    message = "|".join(
        [
            str(tx.id),
            str(tx.payer_id),
            str(tx.payee_id),
            f"{float(tx.amount):.2f}",
            tx.kind,
            tx.currency,
        ]
    ).encode()
    return hmac.new(secret, message, hashlib.sha256).hexdigest()[:40]


def create(
    db: Session,
    payer: User,
    payee_username: str,
    amount: float,
    project_id: int | None = None,
    note: str | None = None,
    kind: str = PROJECT,
) -> Transaction:
    payee = db.scalar(select(User).where(User.username == payee_username))
    if payee is None:
        raise HTTPException(status_code=404, detail="No such user")
    if payee.id == payer.id:
        raise HTTPException(status_code=400, detail="You cannot pay yourself")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    if amount > 1_000_000:
        raise HTTPException(status_code=400, detail="That amount is too large")
    tx = Transaction(
        project_id=project_id,
        payer_id=payer.id,
        payee_id=payee.id,
        amount=amount,
        kind=kind,
        note=note,
        status="PENDING",
    )
    db.add(tx)
    db.flush()
    tx.signature = _signature(tx)
    db.commit()
    db.refresh(tx)
    return tx


def verify_signature(tx: Transaction) -> bool:
    return bool(tx.signature) and hmac.compare_digest(tx.signature, _signature(tx))


def _payee_upi(db: Session, tx: Transaction) -> tuple[User, str]:
    payee = db.get(User, tx.payee_id)
    profile = payee.profile if payee else None
    upi_id = profile.upi_id if profile else None
    if payee is None or not upi_id:
        raise HTTPException(
            status_code=400,
            detail="This person has not added a UPI ID, so they cannot receive payments yet.",
        )
    return payee, upi_id


def upi_link(db: Session, tx: Transaction) -> str:
    payee, upi_id = _payee_upi(db, tx)
    label = "SkillMatch tip" if tx.kind == TIP else "SkillMatch payment"
    pn = payee.username if payee else upi_id.split("@")[0]
    params = {
        "pa": upi_id,
        "pn": pn,
        "am": f"{float(tx.amount):.2f}",
        "cu": tx.currency,
        "tn": tx.note or f"{label} #{tx.id}",
    }
    return "upi://pay?" + urlencode(params, quote_via=quote)


def qr_data_uri(uri: str) -> str:
    """Render the UPI URI as an inline SVG QR code the browser can show."""
    image = qrcode.make(uri, image_factory=qrcode.image.svg.SvgPathImage, box_size=10)
    buf = BytesIO()
    image.save(buf)
    encoded = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/svg+xml;base64,{encoded}"


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


def list_for(
    db: Session, user_id: int, role: str = "all", kind: str | None = None
) -> list[Transaction]:
    stmt = select(Transaction)
    if kind is not None:
        stmt = stmt.where(Transaction.kind == kind)
    if role == "sent":
        stmt = stmt.where(Transaction.payer_id == user_id)
    elif role == "received":
        stmt = stmt.where(Transaction.payee_id == user_id)
    else:
        stmt = stmt.where(
            or_(Transaction.payer_id == user_id, Transaction.payee_id == user_id)
        )
    return list(db.scalars(stmt.order_by(Transaction.created_at.desc())).all())


def received_tips_total(db: Session, user_id: int) -> tuple[float, int]:
    """How much this user has been tipped, counting only settled payments."""
    total = db.scalar(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.payee_id == user_id,
            Transaction.kind == TIP,
            Transaction.status == "PAID",
        )
    )
    count = db.scalar(
        select(func.count()).where(
            Transaction.payee_id == user_id,
            Transaction.kind == TIP,
            Transaction.status == "PAID",
        )
    )
    return float(total or 0), int(count or 0)


__all__ = [
    "PROJECT",
    "TIP",
    "confirm",
    "create",
    "list_for",
    "qr_data_uri",
    "received_tips_total",
    "to_out",
    "upi_link",
    "verify_signature",
]
