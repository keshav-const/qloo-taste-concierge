"use client";

import { useEffect, useRef, useState } from "react";

// India's rough bounding box — drop any pin a bad geocode placed outside the country.
function inIndia(lat: number, lng: number): boolean {
  return lat >= 6 && lat <= 37.5 && lng >= 68 && lng <= 98.5;
}
/** Keep only valid, in-India pins and reject outliers far from the cluster (one bad geocode
 *  otherwise blows the map out to a whole-subcontinent view). */
function cleanPins(places: MapPlace[]): MapPlace[] {
  const valid = places.filter(
    (p) => typeof p.lat === "number" && typeof p.lng === "number" && inIndia(p.lat, p.lng),
  );
  if (valid.length <= 2) return valid;
  const med = (arr: number[]) => [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)];
  const mlat = med(valid.map((p) => p.lat as number));
  const mlng = med(valid.map((p) => p.lng as number));
  const kept = valid.filter(
    (p) => Math.abs((p.lat as number) - mlat) <= 2.5 && Math.abs((p.lng as number) - mlng) <= 2.5,
  );
  return kept.length ? kept : valid;
}

/** Minimal shape MapPanel needs from a verified place. */
export type MapPlace = {
  name: string;
  category: string | null;
  area: string | null;
  lat?: number | null;
  lng?: number | null;
  maps_url?: string;
};

/** Nearest usable airport per destination (keyless static lookup; no flight API needed). */
const AIRPORTS: Record<string, { name: string; iata: string; city: string }> = {
  delhi: { name: "Indira Gandhi Intl", iata: "DEL", city: "Delhi" },
  gurgaon: { name: "Indira Gandhi Intl", iata: "DEL", city: "Delhi" },
  jaipur: { name: "Jaipur Intl", iata: "JAI", city: "Jaipur" },
  udaipur: { name: "Maharana Pratap", iata: "UDR", city: "Udaipur" },
  bangalore: { name: "Kempegowda Intl", iata: "BLR", city: "Bengaluru" },
  hyderabad: { name: "Rajiv Gandhi Intl", iata: "HYD", city: "Hyderabad" },
  madurai: { name: "Madurai", iata: "IXM", city: "Madurai" },
  bhubaneswar: { name: "Biju Patnaik Intl", iata: "BBI", city: "Bhubaneswar" },
  khajuraho: { name: "Khajuraho", iata: "HJR", city: "Khajuraho" },
  panna: { name: "Khajuraho (nearest)", iata: "HJR", city: "Khajuraho" },
  guwahati: { name: "Gopinath Bordoloi Intl", iata: "GAU", city: "Guwahati" },
  meghalaya: { name: "Guwahati (nearest)", iata: "GAU", city: "Guwahati" },
  sikkim: { name: "Bagdogra (nearest)", iata: "IXB", city: "Siliguri" },
  darjeeling: { name: "Bagdogra (nearest)", iata: "IXB", city: "Siliguri" },
  kerala: { name: "Cochin Intl", iata: "COK", city: "Kochi" },
  gujarat: { name: "Ahmedabad (Sardar Patel)", iata: "AMD", city: "Ahmedabad" },
  mumbai: { name: "Chhatrapati Shivaji", iata: "BOM", city: "Mumbai" },
  goa: { name: "Goa (Mopa/Dabolim)", iata: "GOX", city: "Goa" },
};

function airportFor(city: string | null | undefined) {
  if (!city) return null;
  return AIRPORTS[city.toLowerCase().trim()] ?? null;
}

function flightsUrl(destCity: string) {
  return `https://www.google.com/travel/flights?q=${encodeURIComponent("flights to " + destCity)}`;
}
function directionsUrl(origin: string, dest: string) {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}`;
}

/** Load Leaflet from CDN once (keyless, free). Resolves when window.L is ready. */
let leafletReady: Promise<void> | null = null;
function loadLeaflet(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).L) return Promise.resolve();
  if (leafletReady) return leafletReady;
  leafletReady = new Promise<void>((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    css.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
    css.crossOrigin = "";
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
    s.crossOrigin = "";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("leaflet load failed"));
    document.body.appendChild(s);
  });
  return leafletReady;
}

export default function MapPanel({
  places,
  destinationCity,
  originCity,
}: {
  places: MapPlace[];
  destinationCity: string | null | undefined;
  originCity: string | null | undefined;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const [zoomArmed, setZoomArmed] = useState(false);

  const pinned = cleanPins(places);

  useEffect(() => {
    let cancelled = false;
    if (!pinned.length) return;
    loadLeaflet()
      .then(() => {
        if (cancelled || !ref.current) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const L = (window as any).L;
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
        // scrollWheelZoom OFF by default so the page scrolls past the map; a click on the map
        // ARMS wheel-zoom (good UX), leaving the map re-disables it so scrolling never traps.
        const map = L.map(ref.current, { scrollWheelZoom: false });
        mapRef.current = map;
        map.on("click focus", () => { map.scrollWheelZoom.enable(); setZoomArmed(true); });
        map.on("mouseout blur", () => { map.scrollWheelZoom.disable(); setZoomArmed(false); });
        // Prefer Mappls (MapmyIndia) tiles — they render India's OFFICIAL boundaries (J&K/Ladakh
        // correct) — and fall back to OpenStreetMap automatically if they fail to load (bad key,
        // quota, non-whitelisted origin), so the map is never blank.
        const addOSM = () =>
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap",
            maxZoom: 18,
          }).addTo(map);
        const mapplsKey = process.env.NEXT_PUBLIC_MAPPLS_KEY;
        if (mapplsKey) {
          const mappls = L.tileLayer(
            `https://apis.mappls.com/advancedmaps/v1/${mapplsKey}/map_tiles/{z}/{x}/{y}.png`,
            { attribution: "&copy; Mappls", maxZoom: 18 },
          );
          let fellBack = false;
          mappls.on("tileerror", () => {
            if (fellBack) return;
            fellBack = true;
            map.removeLayer(mappls);
            addOSM();
          });
          mappls.addTo(map);
        } else {
          addOSM();
        }
        const latlngs: [number, number][] = [];
        for (const p of pinned) {
          const lat = p.lat as number, lng = p.lng as number;
          latlngs.push([lat, lng]);
          const safe = (s: string) => s.replace(/</g, "&lt;");
          const link = p.maps_url
            ? `<br/><a href="${p.maps_url}" target="_blank" rel="noopener noreferrer" style="color:#e2550e">Open in Maps →</a>`
            : "";
          L.marker([lat, lng])
            .addTo(map)
            .bindPopup(`<strong>${safe(p.name)}</strong><br/><span style="color:#777">${safe([p.category, p.area].filter(Boolean).join(" · "))}</span>${link}`);
        }
        // Cap how far in/out fitBounds goes so a city stays a city view (never a subcontinent one).
        if (latlngs.length === 1) map.setView(latlngs[0], 12);
        else map.fitBounds(latlngs, { padding: [30, 30], maxZoom: 12 });
        setTimeout(() => map.invalidateSize(), 100);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [pinned.length, destinationCity]);

  const air = airportFor(destinationCity);
  const origin = originCity && originCity.toLowerCase() !== "anywhere in india" ? originCity : null;
  const destLabel = destinationCity || "your destination";

  return (
    <div className="space-y-3">
      {pinned.length > 0 ? (
        <div className="relative">
          <div ref={ref} className="h-72 w-full overflow-hidden rounded-2xl border border-line" style={{ background: "#e8e6e0" }} />
          <div className={`pointer-events-none absolute right-3 top-3 z-[500] rounded-full px-2.5 py-1 text-xs font-medium shadow-sm transition ${zoomArmed ? "bg-verified text-paper" : "bg-paper-card/90 text-ink-soft"}`}>
            {zoomArmed ? "scroll to zoom ✓" : "click map to zoom"}
          </div>
        </div>
      ) : (
        <div className="grid h-24 place-items-center rounded-2xl border border-dashed border-line text-sm text-ink-mute">
          Map pins appear as we geocode more of {destLabel}&apos;s spots.
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {air && (
          <span className="pill border border-line text-ink-soft">✈ Nearest airport: <span className="font-medium text-ink">{air.name} ({air.iata})</span></span>
        )}
        {destinationCity && (
          <a href={flightsUrl(destinationCity)} target="_blank" rel="noopener noreferrer" className="pill bg-saffron-soft text-saffron hover:underline">🔎 Find flights</a>
        )}
        {origin && destinationCity && (
          <a href={directionsUrl(origin, destinationCity)} target="_blank" rel="noopener noreferrer" className="pill border border-line text-ink-soft hover:text-ink hover:underline">🧭 Route from {origin}</a>
        )}
        {pinned.length > 0 && (
          <span className="text-xs text-ink-mute">{pinned.length} spot{pinned.length > 1 ? "s" : ""} on the map</span>
        )}
      </div>
    </div>
  );
}
