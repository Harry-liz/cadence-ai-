from db import SessionLocal
from services.rollups import roll_up_venue_engagement_daily


def main():
    with SessionLocal() as db:
        results = roll_up_venue_engagement_daily(db)

    if not results:
        print("No venue engagement rows generated.")
        return

    print(f"Processed {len(results)} venue engagement row(s).")
    for result in results:
        print(
            f"- date={result.metric_date} "
            f"source={result.source} "
            f"venue={result.venue_name} "
            f"views={result.view_count}"
        )


if __name__ == "__main__":
    main()
