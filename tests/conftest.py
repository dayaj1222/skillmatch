"""Test fixtures.

Every test runs against a dedicated Postgres database that is dropped and
recreated per test, so the development database is never touched.

The subtle part is wiring app state to the throwaway database without reloading
modules. Reloading ``app.database`` would create a *new* ``Base`` class while
the models stayed registered on the old metadata, so ``create_all()`` would
create nothing. Instead we mutate the existing module's ``engine`` and
``SessionLocal`` in place, keeping one identity for ``Base`` throughout.
"""

from __future__ import annotations

import os

import psycopg
import pytest

ADMIN_DSN = "host=127.0.0.1 port=5433 user=daya dbname=postgres"
TEST_DB = "skillmatch_pytest"
TEST_URL = f"postgresql+psycopg://daya@127.0.0.1:5433/{TEST_DB}"

# Point the app at the throwaway database before anything imports settings.
os.environ["SKILLMATCH_DATABASE_URL"] = TEST_URL
os.environ["SKILLMATCH_SECRET"] = "test-secret"


@pytest.fixture(autouse=True)
def _fresh_database():
    """Drop and recreate the test database, then rebuild the engine in place."""
    with psycopg.connect(ADMIN_DSN, autocommit=True) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE datname = %s AND pid <> pg_backend_pid()",
            (TEST_DB,),
        )
        cur.execute(f'DROP DATABASE IF EXISTS "{TEST_DB}"')
        cur.execute(f'CREATE DATABASE "{TEST_DB}"')

    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session, sessionmaker

    from app import database

    # Dispose the previous pool, then rebuild against the fresh database while
    # keeping the same Base/metadata identity.
    database.engine.dispose()
    database.engine = create_engine(TEST_URL, pool_pre_ping=True, future=True)
    database.SessionLocal = sessionmaker(
        bind=database.engine, autoflush=False, expire_on_commit=False, class_=Session
    )

    database.init_db()
    yield


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture
def register(client):
    """Factory: register a user and return the created user dict."""

    def _register(username="alice", email=None, password="password123"):
        email = email or f"{username}@example.com"
        r = client.post(
            "/api/auth/register",
            json={"username": username, "email": email, "password": password},
        )
        assert r.status_code == 201, r.text
        return r.json()

    return _register


def make_client():
    """A second, independent client with its own cookie jar."""
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)
