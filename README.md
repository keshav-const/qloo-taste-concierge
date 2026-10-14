# Taste Concierge — an agentic, cross-domain travel & culture planner for India

> Built for the **Qloo Agentic Hackathon 2026**. Powered end-to-end by **Qloo's Taste AI™**.

Tell it a few things you love — a band, a film, a designer, a cuisine, a city you
enjoyed — and an AI agent turns those cross-domain tastes into a **personalized cultural
and travel itinerary for India**: where to eat, what to see, and the neighborhoods that
match your vibe.

## Why Qloo is the engine (not a feature)

The entire personalization layer runs on **Qloo's Taste AI**. Qloo's cultural graph
(250M+ entities across music, film/TV, dining, fashion, travel and more) is what lets the
agent take an affinity in *one* domain and surface genuinely correlated recommendations in
*another* — e.g. your taste in music and film → the restaurants, places and experiences in
India you'll actually connect with. **Remove Qloo and there is no product:** no
personalization, no cross-domain reasoning, just a generic list.

## What makes it different: a creator-verified overlay

On top of Qloo's taste matches, recommendations are cross-checked against a **ground-truth
graph of real creator evidence** — places repeatedly vouched for by travel/food creators
(aggregated from video transcripts). Where a Qloo recommendation matches that graph, it
carries a **"verified by N creators"** trust signal. So a pick isn't just *"matches your
taste"* — it's *"matches your taste, and real people on the ground back it up."*

## How it works

1. **You share tastes** across any domain (music, film, food, fashion, travel).
2. The **agent** resolves each to a Qloo entity (`/search`) and expands it cross-domain via
   Qloo Insights (`/v2/insights` with `signal.interests.entities` → a target `filter.type`,
   filtered to India).
3. Matches are **verified** against the creator-evidence graph.
4. You get a **personalized, verified itinerary.**

## Tech

- Agent: tool-calling LLM loop (`qloo_search`, `qloo_taste_expand`, `evidence_check`, `itinerary_builder`)
- Qloo Taste AI API (`/search`, `/v2/insights`)
- Web app + live hosted demo

## Status

🚧 In active development for the hackathon. See the data snapshot in [`data/`](./data).

## License

[MIT](./LICENSE)
