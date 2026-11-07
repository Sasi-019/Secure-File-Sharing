from app.database import Base, engine
from app import models


def create_tables():
    Base.metadata.create_all(bind=engine)
    print("Database tables checked successfully!")

    for table_name in Base.metadata.tables:
        print(f"Table available: {table_name}")


if __name__ == "__main__":
    create_tables()