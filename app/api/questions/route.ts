import { NextResponse } from "next/server";
import { generateQuestions } from "@/lib/agent";

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json({ error: "Provide a prompt." }, { status: 400 });
    }
    const questions = await generateQuestions(prompt.trim());
    return NextResponse.json({ questions });
  } catch (e) {
    console.error("[questions] error:", e instanceof Error ? e.message : e);
    // Questions are optional — never block the flow; return none so the user can plan directly.
    return NextResponse.json({ questions: [] });
  }
}
