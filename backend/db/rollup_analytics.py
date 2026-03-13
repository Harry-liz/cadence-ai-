from db import SessionLocal
from services.analytics_rollups import roll_up_recent_analytics


def main():
    with SessionLocal() as db:
        results = roll_up_recent_analytics(db)

    if not results:
        print("No analytics candidate dates found.")
        return

    print(f"Processed {len(results)} analytics date(s).")
    for result in results:
        print(
            f"- date={result.metric_date} "
            f"recommendations={result.recommendation_fact_count} "
            f"signals={result.interest_signal_count} "
            f"venues={result.venue_daily_count} "
            f"demand_rows={result.demand_daily_count}"
        )


if __name__ == "__main__":
    main()
