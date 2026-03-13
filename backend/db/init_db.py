from db import Base, engine, models  # noqa: F401


def main():
    Base.metadata.create_all(bind=engine)
    print("Database schema initialized.")


if __name__ == "__main__":
    main()
