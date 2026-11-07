from getpass import getpass

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import User


def main():
    email = input(
        "Enter the registered email to promote: "
    ).strip().lower()

    db: Session = SessionLocal()

    try:
        user = (
            db.query(User)
            .filter(User.email == email)
            .first()
        )

        if user is None:
            print("User not found. Register the account first.")
            return

        if user.role == "admin":
            print("This account is already an administrator.")
            return

        confirmation = input(
            f"Promote {user.email} to administrator? Type YES: "
        ).strip()

        if confirmation != "YES":
            print("Operation cancelled.")
            return

        user.role = "admin"
        db.commit()

        print(
            f"Success! {user.email} is now an administrator."
        )

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


if __name__ == "__main__":
    main()