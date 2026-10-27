import { NextResponse } from "next/server";
import { coverageCities } from "@/lib/evidence";

/** Depth-city coverage for the India map (city, location, POI count). Static server data. */
export async function GET() {
  const cities = coverageCities();
  const total = cities.reduce((n, c) => n + c.count, 0);
  return NextResponse.json({ cities, total, cityCount: cities.length });
}
