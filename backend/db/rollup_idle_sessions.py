from db import SessionLocal
from services.rollups import roll_up_idle_sessions


def main():
    with SessionLocal() as db:
        results = roll_up_idle_sessions(db)

    if not results:
        print("No idle sessions ready for rollup.")
        return

    print(f"Processed {len(results)} session(s).")
    for result in results:
        print(
            f"- session={result.session_id} "
            f"preferences={result.preference_count} "
            f"memories={result.memory_count}"
        )


if __name__ == "__main__":
    main()
