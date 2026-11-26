"""
Create the FIRST administrator. Run
this once after `alembic upgrade head`:

    python create_admin.py

After that the administrator signs in and adds every employee from the
"Employees" tab of the admin dashboard.
"""
from getpass import getpass

from app.database import SessionLocal
from app.models import User
from app.routers.auth import hash_password


def main():
    name = input("Administrator name: ").strip()
    employee_id = input("Employee ID: ").strip()
    email = input("Company email: ").strip().lower()
    password = getpass("Password (8+ characters): ")

    if not (name and employee_id and email) or len(password) < 8:
        print("Name, employee ID, email and an 8+ character password are required.")
        return

    db = SessionLocal()
    try:
        clash = (
            db.query(User)
            .filter((User.email == email) | (User.employee_id == employee_id))
            .first()
        )
        if clash:
            print("That email or employee ID is already used.")
            return

        db.add(
            User(
                name=name,
                email=email,
                employee_id=employee_id,
                password_hash=hash_password(password),
                role="admin",
                is_active=True,
            )
        )
        db.commit()
        print("Administrator created. You can sign in now.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
