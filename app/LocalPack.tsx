"use client";

import { useEffect, useState } from "react";

type Phrase = { local: string; roman: string; en: string };
type Pack = {
  greeting?: Phrase;
  phrases?: Phrase[];
  etiquette?: string[];
  food?: string[];
};

/** Lazy-loaded "local culture pack" for the destination — greeting, phrases, etiquette, food. */
export default function LocalPack({ city }: { city: string }) {
  const [pack, setPack] = useState<Pack | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setPack(null);
    fetch("/api/localpack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city }),
    })
      .then((r) => r.json())
      .then((d) => { if (alive) setPack(d.pack ?? null); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [city]);

  // Header lives inside the component so the whole section disappears together when the pack
  // fails to load (free tier can return nothing) — no orphaned "Local pack" heading.
  const Header = (
    <>
      <div className="flex items-center gap-3">
        <span className="text-saffron">◆</span>
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink">Local pack · {city}</h2>
        <span className="h-px flex-1 bg-gradient-to-r from-line to-transparent" />
      </div>
      <p className="mb-5 mt-2 text-sm text-ink-mute">A few words to greet people, what to know, and what to eat.</p>
    </>
  );

  if (loading) return <section className="mb-12">{Header}<div className="h-20 animate-pulse rounded-2xl border border-line bg-paper-card/50" /></section>;
  if (!pack) return null;

  return (
    <section className="mb-12">
      {Header}
    <div className="grid gap-3 sm:grid-cols-3">
      {(pack.greeting || pack.phrases?.length) && (
        <div className="ring-soft rounded-2xl border border-line bg-paper-card p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-saffron">💬 Say hello</p>
          {pack.greeting && (
            <p className="mb-2"><span className="font-display text-xl text-ink">{pack.greeting.local}</span> <span className="text-sm text-ink-soft">{pack.greeting.roman}</span></p>
          )}
          <ul className="space-y-1 text-sm">
            {(pack.phrases ?? []).slice(0, 3).map((p, i) => (
              <li key={i} className="text-ink-soft"><span className="font-medium text-ink">{p.roman}</span> — {p.en}</li>
            ))}
          </ul>
        </div>
      )}
      {pack.etiquette?.length ? (
        <div className="ring-soft rounded-2xl border border-line bg-paper-card p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-saffron">🙏 Good to know</p>
          <ul className="space-y-1.5 text-sm text-ink-soft">
            {pack.etiquette.slice(0, 3).map((t, i) => <li key={i} className="flex gap-1.5"><span className="text-verified">•</span>{t}</li>)}
          </ul>
        </div>
      ) : null}
      {pack.food?.length ? (
        <div className="ring-soft rounded-2xl border border-line bg-paper-card p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-saffron">🍲 Must-try food</p>
          <div className="flex flex-wrap gap-1.5">
            {pack.food.slice(0, 5).map((f, i) => <span key={i} className="pill bg-saffron-soft text-saffron">{f}</span>)}
          </div>
        </div>
      ) : null}
    </div>
    </section>
  );
}
