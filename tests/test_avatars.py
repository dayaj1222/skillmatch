"""Avatar uploads are written outside the SPA build and served back."""

from __future__ import annotations

import base64

# 1x1 transparent PNG.
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def test_upload_and_serve_avatar(client, register):
    register("alice")

    r = client.post(
        "/api/profile/avatar",
        files={"file": ("me.png", PNG, "image/png")},
    )
    assert r.status_code == 200, r.text
    url = r.json()["avatar_url"]
    assert url.startswith("/avatars/")

    served = client.get(url)
    assert served.status_code == 200
    assert served.content == PNG

    public = client.get("/api/profile/alice").json()
    assert public["avatar_url"] == url


def test_avatar_rejects_non_image(client, register):
    register("alice")
    r = client.post(
        "/api/profile/avatar",
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert r.status_code == 400
