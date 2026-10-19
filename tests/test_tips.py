"""Tips: UPI QR generation, signed references, and private totals."""

from __future__ import annotations

from tests.conftest import make_client


def _login(username: str, password: str = "password123"):
    c = make_client()
    r = c.post(
        "/api/auth/login",
        json={"username_or_email": username, "password": password},
    )
    assert r.status_code == 200, r.text
    return c


def test_tip_requires_payee_upi(client, register):
    register("alice")
    register("bob")
    alice = _login("alice")

    r = alice.post("/api/tips", json={"payee_username": "bob", "amount": 100})
    assert r.status_code == 400
    assert "UPI" in r.json()["detail"]


def test_tip_returns_qr_and_signature(client, register):
    register("alice")
    register("bob")
    bob = _login("bob")
    assert bob.put("/api/profile", json={"upi_id": "bob@upi"}).status_code == 200

    alice = _login("alice")
    r = alice.post(
        "/api/tips",
        json={"payee_username": "bob", "amount": 150, "note": "schema work"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["upi_link"].startswith("upi://pay?")
    assert "pa=bob%40upi" in body["upi_link"]
    assert "am=150.00" in body["upi_link"]
    assert body["qr_svg"].startswith("data:image/svg+xml;base64,")
    assert body["signature"]
    assert body["status"] == "PENDING"


def test_received_tips_are_private_and_only_count_paid(client, register):
    register("alice")
    register("bob")
    register("carol")

    bob = _login("bob")
    bob.put("/api/profile", json={"upi_id": "bob@upi"})
    alice = _login("alice")

    tip = alice.post("/api/tips", json={"payee_username": "bob", "amount": 250})
    assert tip.status_code == 201
    tip_id = tip.json()["id"]

    # Pending money is not "received" yet.
    assert bob.get("/api/tips/received").json() == {"total": 0.0, "count": 0, "tips": []}

    assert alice.post(f"/api/tips/{tip_id}/confirm", json={}).status_code == 200

    received = bob.get("/api/tips/received").json()
    assert received["total"] == 250.0
    assert received["count"] == 1
    assert received["tips"][0]["payer_username"] == "alice"

    # Carol's own view is empty; she cannot read Bob's total through this route.
    carol = _login("carol")
    assert carol.get("/api/tips/received").json()["count"] == 0


def test_only_the_payer_can_confirm(client, register):
    register("alice")
    register("bob")
    bob = _login("bob")
    bob.put("/api/profile", json={"upi_id": "bob@upi"})
    alice = _login("alice")
    tip_id = alice.post(
        "/api/tips", json={"payee_username": "bob", "amount": 50}
    ).json()["id"]

    assert bob.post(f"/api/tips/{tip_id}/confirm", json={}).status_code == 403
    assert alice.post(f"/api/tips/{tip_id}/confirm", json={}).status_code == 200


def test_cannot_tip_yourself(client, register):
    register("alice")
    alice = _login("alice")
    alice.put("/api/profile", json={"upi_id": "alice@upi"})

    r = alice.post("/api/tips", json={"payee_username": "alice", "amount": 10})
    assert r.status_code == 400
