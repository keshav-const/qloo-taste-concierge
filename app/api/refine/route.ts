import { NextResponse } from "next/server";
import { refineItinerary } from "@/lib/agent";
import { LLMError } from "@/lib/llm";

export async function POST(req: Request) {
  try {
    const { itinerary, request: changeRequest, context } = await req.json();
    if (!itinerary || !changeRequest || typeof changeRequest !== "string" || !changeRequest.trim()) {
      return NextResponse.json({ error: "Provide 'itinerary' and 'request'." }, { status: 400 });
    }
    const revised = await refineItinerary(String(itinerary), changeRequest.trim(), String(context ?? ""));
    return NextResponse.json({ itinerary: revised });
  } catch (e) {
    console.error("[refine] error:", e instanceof Error ? e.message : e);
    const message = e instanceof LLMError ? e.userMessage : "Couldn't update the plan — please try again.";
    return NextResponse.json({ error: message }, { status: e instanceof LLMError && e.rateLimited ? 429 : 500 });
  }
}
