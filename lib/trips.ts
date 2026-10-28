// Client-side "My Trips" store (localStorage). No login, no backend — per-device bookmarks the
// user fully owns. Each saved trip keeps enough to re-render it read-only (reusing the shared view).
export type SavedTrip = {
  id: string;
  title: string;
  reqText: string;
  itinerary: string;
  city: string | null;
  qa: { q: string; a: string }[];
  savedAt: number;
};

const KEY = "tastetrail.trips.v1";

export function getTrips(): SavedTrip[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as SavedTrip[]) : [];
    return Array.isArray(arr) ? arr.sort((a, b) => b.savedAt - a.savedAt) : [];
  } catch {
    return [];
  }
}

function write(trips: SavedTrip[]): SavedTrip[] {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(trips.slice(0, 50)));
  } catch {
    /* quota / private mode — ignore */
  }
  return trips;
}

/** Save (or de-dupe by itinerary). Returns the updated list. */
export function saveTrip(t: Omit<SavedTrip, "id" | "savedAt">): SavedTrip[] {
  const trips = getTrips();
  if (trips.some((x) => x.itinerary === t.itinerary)) return trips; // already saved
  const entry: SavedTrip = { ...t, id: Math.random().toString(36).slice(2, 10), savedAt: Date.now() };
  return write([entry, ...trips]);
}

export function deleteTrip(id: string): SavedTrip[] {
  return write(getTrips().filter((t) => t.id !== id));
}

export function isTripSaved(itinerary: string): boolean {
  return getTrips().some((t) => t.itinerary === itinerary);
}
