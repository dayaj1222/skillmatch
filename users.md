# Local demo users

These accounts are created by `seed.py` for local testing only. Every account
uses the password `password123`.

| Username | Email | Password |
| --- | --- | --- |
| meera | meera@example.edu | password123 |
| arjun | arjun@example.edu | password123 |
| kavya | kavya@example.edu | password123 |
| rohit | rohit@example.edu | password123 |
| priya | priya@example.edu | password123 |
| daniel | daniel@example.edu | password123 |
| aisha | aisha@example.edu | password123 |
| vikram | vikram@example.edu | password123 |
| sneha | sneha@example.edu | password123 |
| tom | tom@example.edu | password123 |
| neha | neha@example.edu | password123 |
| leo | leo@example.edu | password123 |

## Reset the local data

From the repository root:

```bash
uv run python seed.py
```

This resets the local domain tables and recreates the demo users, skills,
projects, memberships, applications, and project updates. Do not use these
credentials in a deployed environment.

## Useful test scenarios

- `meera`: owns the open **Department timetable API** project and has pending applications.
- `arjun`: owns **Study group finder** and has `kavya` as a member.
- `kavya`: good database/data candidate with an application awaiting review.
- `rohit`: early-career applicant for testing profile and application flows.
- `daniel`: DevOps-heavy profile for skill search and matching.
- `sneha`: mobile-focused profile for cross-domain search.
