import { NextResponse } from "next/server";
import { refineItinerary } from "@/lib/agent";

export async function POST(req: Request) {
  try {
    const { itinerary, request: changeRequest, context } = await req.json();
    if (!itinerary || !changeRequest || typeof changeRequest !== "string" || !changeRequest.trim()) {
      return NextResponse.json({ error: "Provide 'itinerary' and 'request'." }, { status: 400 });
    }
    const revised = await refineItinerary(String(itinerary), changeRequest.trim(), String(context ?? ""));
    return NextResponse.json({ itinerary: revised });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
