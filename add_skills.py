"""Add the expanded skill vocabulary to an existing database, non-destructively.

Unlike seed.py this never truncates: it only inserts categories and skills that
are missing, so user accounts and projects survive. Safe to run repeatedly.

Usage: uv run python add_skills.py
"""

from __future__ import annotations

from sqlalchemy import func, select

from app.database import SessionLocal, init_db
from app.models import Skill, SkillCategory

CATEGORIES = [
    "Language",
    "Frontend",
    "Backend",
    "Mobile",
    "Data & ML",
    "Database",
    "DevOps & Cloud",
    "Testing & Quality",
    "Security",
    "Design",
    "Product & Docs",
    "Tooling",
    "Hardware & Embedded",
    "Soft Skills",
]

SKILLS: dict[str, list[str]] = {
    "Language": [
        "Python", "JavaScript", "TypeScript", "Java", "C", "C++", "C#", "Go",
        "Rust", "Kotlin", "Swift", "Ruby", "PHP", "Scala", "R", "MATLAB",
        "SQL", "Bash",
    ],
    "Frontend": [
        "HTML", "CSS", "Sass", "Tailwind CSS", "React", "Next.js", "Vue",
        "Svelte", "Angular", "Accessibility", "Responsive Design",
        "Web Performance", "WebGL",
    ],
    "Backend": [
        "FastAPI", "Django", "Flask", "Node.js", "Express", "Spring Boot",
        "REST APIs", "GraphQL", "gRPC", "WebSockets", "Microservices", "Caching",
        "Message Queues",
    ],
    "Mobile": ["React Native", "Flutter", "Android", "iOS"],
    "Data & ML": [
        "Pandas", "NumPy", "Data Analysis", "Data Visualization", "Machine Learning",
        "Deep Learning", "PyTorch", "TensorFlow", "NLP", "Computer Vision", "LLMs",
        "ETL", "Spark", "Statistics",
    ],
    "Database": [
        "Postgres", "MySQL", "SQLite", "MongoDB", "Redis", "Database Design",
        "Query Optimization", "ORMs",
    ],
    "DevOps & Cloud": [
        "Docker", "Kubernetes", "CI/CD", "AWS", "GCP", "Azure", "Linux", "Nginx",
        "Terraform", "Monitoring",
    ],
    "Testing & Quality": [
        "Unit Testing", "Integration Testing", "Pytest", "Jest", "End-to-End Testing",
        "Code Review", "Debugging",
    ],
    "Security": [
        "Application Security", "Authentication", "Cryptography", "Penetration Testing",
    ],
    "Design": [
        "Figma", "UI Design", "UX Research", "Design Systems", "Prototyping",
        "Illustration", "Motion Design", "Branding",
    ],
    "Product & Docs": [
        "Technical Writing", "Documentation", "Product Management", "User Interviews",
        "Project Planning",
    ],
    "Tooling": ["Git", "GitHub Actions", "VS Code", "Vim", "Jira", "Notion"],
    "Hardware & Embedded": [
        "Arduino", "Raspberry Pi", "Embedded C", "PCB Design", "IoT", "Robotics",
        "Signal Processing",
    ],
    "Soft Skills": [
        "Public Speaking", "Technical Presentation", "Teamwork", "Mentoring",
        "Event Organizing",
    ],
}


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        # Categories, matched by name so re-runs do not duplicate.
        cats: dict[str, SkillCategory] = {}
        for order, name in enumerate(CATEGORIES, start=1):
            existing = db.scalar(select(SkillCategory).where(SkillCategory.name == name))
            if existing is None:
                existing = SkillCategory(name=name, sort_order=order)
                db.add(existing)
            cats[name] = existing
        db.flush()

        existing_names = {n for (n,) in db.execute(select(Skill.name)).all()}
        added = 0
        for cat_name, names in SKILLS.items():
            for skill_name in names:
                if skill_name in existing_names:
                    continue
                db.add(Skill(name=skill_name, category_id=cats[cat_name].id))
                added += 1

        db.commit()
        total = db.scalar(select(func.count()).select_from(Skill)) or 0
        print(f"Added {added} skills. Total skills now: {total}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
