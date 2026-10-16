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
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
