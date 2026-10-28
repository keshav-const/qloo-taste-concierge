import { NextResponse } from "next/server";
import { graphStats } from "@/lib/evidence";

/** Headline evidence-graph numbers for the landing credibility bar. Static server data. */
export async function GET() {
  return NextResponse.json(graphStats());
}
