"""Seed demo data so the app has something to show.

Idempotent-ish: it truncates the domain tables first, so running it twice is
safe. Every person's password is "password123".

Usage:
    SKILLMATCH_DATABASE_URL=... uv run python seed.py
"""

from __future__ import annotations

from sqlalchemy import text

from app.auth import hash_password
from app.database import SessionLocal, engine, init_db
from app.models import (
    Application,
    Membership,
    Profile,
    Project,
    ProjectSkill,
    ProjectUpdate,
    Skill,
    SkillCategory,
    User,
    UserSkill,
)

PEOPLE = [
    {
        "username": "meera",
        "email": "meera@example.edu",
        "full_name": "Meera Raghavan",
        "headline": "Backend developer. Happiest inside a query planner.",
        "branch": "CSE",
        "year": 3,
        "location": "Chennai",
        "bio": "Built a timetabling service for the department last semester. "
        "Comfortable with FastAPI, Postgres, and arguing about indexes.",
        "contact_link": "https://github.com/meera",
        "skills": [("Python", 5, 4), ("Postgres", 5, 3), ("FastAPI", 4, 2), ("Docker", 3, 1)],
    },
    {
        "username": "arjun",
        "email": "arjun@example.edu",
        "full_name": "Arjun Sethi",
        "headline": "Frontend. I care about how things feel when you click them.",
        "branch": "IT",
        "year": 3,
        "location": "Bengaluru",
        "bio": "Two internships on design systems. I will rebuild your spacing scale "
        "whether you ask me to or not.",
        "contact_link": "https://github.com/arjun",
        "skills": [("React", 5, 3), ("TypeScript", 4, 3), ("Figma", 4, 2), ("CSS", 5, 4)],
    },
    {
        "username": "kavya",
        "email": "kavya@example.edu",
        "full_name": "Kavya Nair",
        "headline": "Data pipelines and the occasional graph.",
        "branch": "CSE",
        "year": 4,
        "location": "Kochi",
        "bio": "Spent a summer on a log-processing pipeline. Learning to like dbt.",
        "contact_link": "https://github.com/kavya",
        "skills": [("Python", 4, 4), ("Postgres", 4, 3), ("Pandas", 4, 3)],
    },
    {
        "username": "rohit",
        "email": "rohit@example.edu",
        "full_name": "Rohit Menon",
        "headline": "Still deciding. Good at showing up.",
        "branch": "ECE",
        "year": 2,
        "location": "Chennai",
        "bio": "Learning web development. Looking for a project where I can take a small "
        "piece and actually finish it.",
        "contact_link": "https://github.com/rohit",
        "skills": [("JavaScript", 2, 1), ("Git", 3, 2)],
    },
]

CATEGORIES = [
    ("Language", 1),
    ("Frontend", 2),
    ("Backend", 3),
    ("Mobile", 4),
    ("Data & ML", 5),
    ("Database", 6),
    ("DevOps & Cloud", 7),
    ("Testing & Quality", 8),
    ("Security", 9),
    ("Design", 10),
    ("Product & Docs", 11),
    ("Tooling", 12),
    ("Hardware & Embedded", 13),
    ("Soft Skills", 14),
]


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        # Clear domain data. Cascades handle the join tables.
        for table in (
            "project_updates",
            "applications",
            "memberships",
            "project_skills",
            "projects",
            "endorsements",
            "user_skills",
            "skills",
            "skill_categories",
            "profiles",
            "users",
        ):
            db.execute(text(f"TRUNCATE {table} RESTART IDENTITY CASCADE"))
        db.commit()

        # Categories and a skill vocabulary.
        cats = {}
        for name, order in CATEGORIES:
            c = SkillCategory(name=name, sort_order=order)
            db.add(c)
            cats[name] = c
        db.flush()

        skill_cat = {
            # Languages
            "Python": "Language",
            "JavaScript": "Language",
            "TypeScript": "Language",
            "Java": "Language",
            "C": "Language",
            "C++": "Language",
            "C#": "Language",
            "Go": "Language",
            "Rust": "Language",
            "Kotlin": "Language",
            "Swift": "Language",
            "Ruby": "Language",
            "PHP": "Language",
            "Scala": "Language",
            "R": "Language",
            "MATLAB": "Language",
            "SQL": "Language",
            "Bash": "Language",
            # Frontend
            "HTML": "Frontend",
            "CSS": "Frontend",
            "Sass": "Frontend",
            "Tailwind CSS": "Frontend",
            "React": "Frontend",
            "Next.js": "Frontend",
            "Vue": "Frontend",
            "Svelte": "Frontend",
            "Angular": "Frontend",
            "Accessibility": "Frontend",
            "Responsive Design": "Frontend",
            "Web Performance": "Frontend",
            "WebGL": "Frontend",
            # Backend
            "FastAPI": "Backend",
            "Django": "Backend",
            "Flask": "Backend",
            "Node.js": "Backend",
            "Express": "Backend",
            "Spring Boot": "Backend",
            "REST APIs": "Backend",
            "GraphQL": "Backend",
            "gRPC": "Backend",
            "WebSockets": "Backend",
            "Microservices": "Backend",
            "Caching": "Backend",
            "Message Queues": "Backend",
            # Mobile
            "React Native": "Mobile",
            "Flutter": "Mobile",
            "Android": "Mobile",
            "iOS": "Mobile",
            # Data & ML
            "Pandas": "Data & ML",
            "NumPy": "Data & ML",
            "Data Analysis": "Data & ML",
            "Data Visualization": "Data & ML",
            "Machine Learning": "Data & ML",
            "Deep Learning": "Data & ML",
            "PyTorch": "Data & ML",
            "TensorFlow": "Data & ML",
            "NLP": "Data & ML",
            "Computer Vision": "Data & ML",
            "LLMs": "Data & ML",
            "ETL": "Data & ML",
            "Spark": "Data & ML",
            "Statistics": "Data & ML",
            # Database
            "Postgres": "Database",
            "MySQL": "Database",
            "SQLite": "Database",
            "MongoDB": "Database",
            "Redis": "Database",
            "Database Design": "Database",
            "Query Optimization": "Database",
            "ORMs": "Database",
            # DevOps & Cloud
            "Docker": "DevOps & Cloud",
            "Kubernetes": "DevOps & Cloud",
            "CI/CD": "DevOps & Cloud",
            "AWS": "DevOps & Cloud",
            "GCP": "DevOps & Cloud",
            "Azure": "DevOps & Cloud",
            "Linux": "DevOps & Cloud",
            "Nginx": "DevOps & Cloud",
            "Terraform": "DevOps & Cloud",
            "Monitoring": "DevOps & Cloud",
            # Testing & Quality
            "Unit Testing": "Testing & Quality",
            "Integration Testing": "Testing & Quality",
            "Pytest": "Testing & Quality",
            "Jest": "Testing & Quality",
            "End-to-End Testing": "Testing & Quality",
            "Code Review": "Testing & Quality",
            "Debugging": "Testing & Quality",
            # Security
            "Application Security": "Security",
            "Authentication": "Security",
            "Cryptography": "Security",
            "Penetration Testing": "Security",
            # Design
            "Figma": "Design",
            "UI Design": "Design",
            "UX Research": "Design",
            "Design Systems": "Design",
            "Prototyping": "Design",
            "Illustration": "Design",
            "Motion Design": "Design",
            "Branding": "Design",
            # Product & Docs
            "Technical Writing": "Product & Docs",
            "Documentation": "Product & Docs",
            "Product Management": "Product & Docs",
            "User Interviews": "Product & Docs",
            "Project Planning": "Product & Docs",
            # Tooling
            "Git": "Tooling",
            "GitHub Actions": "Tooling",
            "VS Code": "Tooling",
            "Vim": "Tooling",
            "Jira": "Tooling",
            "Notion": "Tooling",
            # Hardware & Embedded
            "Arduino": "Hardware & Embedded",
            "Raspberry Pi": "Hardware & Embedded",
            "Embedded C": "Hardware & Embedded",
            "PCB Design": "Hardware & Embedded",
            "IoT": "Hardware & Embedded",
            "Robotics": "Hardware & Embedded",
            "Signal Processing": "Hardware & Embedded",
            # Soft Skills
            "Public Speaking": "Soft Skills",
            "Technical Presentation": "Soft Skills",
            "Teamwork": "Soft Skills",
            "Mentoring": "Soft Skills",
            "Event Organizing": "Soft Skills",
        }
        skills = {}
        for name, cat in skill_cat.items():
            s = Skill(name=name, category_id=cats[cat].id)
            db.add(s)
            skills[name] = s
        db.flush()

        users = {}
        for person in PEOPLE:
            u = User(
                username=person["username"],
                email=person["email"],
                password_hash=hash_password("password123"),
            )
            db.add(u)
            db.flush()
            db.add(
                Profile(
                    user_id=u.id,
                    full_name=person["full_name"],
                    headline=person["headline"],
                    branch=person["branch"],
                    year=person["year"],
                    location=person["location"],
                    bio=person["bio"],
                    contact_link=person["contact_link"],
                )
            )
            for name, level, years in person["skills"]:
                db.add(
                    UserSkill(user_id=u.id, skill_id=skills[name].id, level=level, years=years)
                )
            users[person["username"]] = u
        db.flush()

        # Two projects: one recruiting, one already formed.
        p1 = Project(
            owner_id=users["meera"].id,
            title="Department timetable API",
            description="The current timetable is a spreadsheet that three people edit by "
            "hand. I want a FastAPI service over Postgres with a real schema, plus "
            "a small admin page so the office staff can stop emailing me.",
            capacity=3,
            status="OPEN",
        )
        db.add(p1)
        db.flush()
        db.add(Membership(project_id=p1.id, user_id=users["meera"].id, role="LEADER"))
        for name, level in [("Postgres", 4), ("FastAPI", 3)]:
            db.add(ProjectSkill(project_id=p1.id, skill_id=skills[name].id, min_level=level))

        p2 = Project(
            owner_id=users["arjun"].id,
            title="Study group finder",
            description="A small tool where students post a course code and find two or three "
            "people to revise with. Design is mostly done, I need someone on the backend.",
            capacity=3,
            status="FORMING",
        )
        db.add(p2)
        db.flush()
        db.add(Membership(project_id=p2.id, user_id=users["arjun"].id, role="LEADER"))
        db.add(Membership(project_id=p2.id, user_id=users["kavya"].id, role="MEMBER"))
        for name, level in [("Postgres", 3), ("Python", 3)]:
            db.add(ProjectSkill(project_id=p2.id, skill_id=skills[name].id, min_level=level))

        # Applications on the recruiting project.
        db.add(
            Application(
                project_id=p1.id,
                applicant_id=users["kavya"].id,
                message="I have done a similar import job with a real schema. Happy to own "
                "the data layer and the migrations.",
                status="PENDING",
            )
        )
        db.add(
            Application(
                project_id=p1.id,
                applicant_id=users["rohit"].id,
                message="I am early, but I can take the admin page and learn the rest as "
                "we go. I finish what I start.",
                status="PENDING",
            )
        )

        db.add(
            ProjectUpdate(
                project_id=p2.id,
                author_id=users["arjun"].id,
                body="Wireframes are up. Kavya is taking the schema this week.",
            )
        )

        db.commit()
        print(f"Seeded {len(PEOPLE)} people, 2 projects, 2 pending applications.")
        print("All accounts use password: password123")
        print("Try: meera, arjun, kavya, rohit")
    finally:
        db.close()


if __name__ == "__main__":
    main()
