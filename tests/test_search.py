"""Search ranked by coverage, and the people directory."""

from __future__ import annotations

from tests.conftest import make_client


def _user_with_skills(username, skills):
    c = make_client()
    c.post(
        "/api/auth/register",
        json={"username": username, "email": f"{username}@x.com", "password": "password123"},
    )
    c.put("/api/profile/skills", json={"skills": skills})
    return c


def _names(results):
    return [r["username"] for r in results]


def test_coverage_ranking(client):
    _user_with_skills(
        "full",
        [
            {"name": "Python", "level": 5},
            {"name": "Postgres", "level": 4},
            {"name": "React", "level": 3},
        ],
    )
    _user_with_skills("partial", [{"name": "Python", "level": 3}])

    r = client.get("/api/search", params=[("skill", "Python"), ("skill", "Postgres")])
    assert r.status_code == 200
    results = r.json()
    # The person covering both skills must rank first.
    assert _names(results)[0] == "full"


def test_require_all_filters_out_partial(client):
    _user_with_skills(
        "full", [{"name": "Python", "level": 5}, {"name": "Postgres", "level": 4}]
    )
    _user_with_skills("partial", [{"name": "Python", "level": 3}])

    r = client.get(
        "/api/search",
        params=[("skill", "Python"), ("skill", "Postgres"), ("require_all", "true")],
    )
    assert _names(r.json()) == ["full"]


def test_min_level_filters(client):
    _user_with_skills("expert", [{"name": "Python", "level": 5}])
    _user_with_skills("beginner", [{"name": "Python", "level": 1}])

    r = client.get("/api/search", params=[("skill", "Python"), ("min_level", 4)])
    assert _names(r.json()) == ["expert"]


def test_people_directory_lists_everyone(client):
    _user_with_skills("ann", [{"name": "Go", "level": 2}])
    _user_with_skills("bob", [{"name": "Rust", "level": 2}])
    r = client.get("/api/people")
    assert set(_names(r.json())) == {"ann", "bob"}


def test_people_filter_by_skill(client):
    _user_with_skills("ann", [{"name": "Go", "level": 2}])
    _user_with_skills("bob", [{"name": "Rust", "level": 2}])
    r = client.get("/api/people", params={"skill": "Go"})
    assert _names(r.json()) == ["ann"]


def test_search_with_no_skills_returns_directory(client):
    _user_with_skills("ann", [{"name": "Go", "level": 2}])
    r = client.get("/api/search")
    assert r.status_code == 200
    assert _names(r.json()) == ["ann"]
