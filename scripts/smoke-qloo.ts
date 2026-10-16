// Live smoke test for lib/qloo.ts against the hackathon API.
// Run: node --env-file=.env --experimental-strip-types scripts/smoke-qloo.ts
import {
  searchEntities,
  resolveEntityId,
  tasteExpand,
  entityId,
  EntityType,
  type QlooEntity,
} from "../lib/qloo.ts";

const names = (es: QlooEntity[], n = 4) => es.slice(0, n).map((e) => e.name ?? "?").join(", ");

async function main() {
  console.log("1) search/resolve seeds");
  const rahman = await resolveEntityId("A.R. Rahman", EntityType.artist);
  const inception = await resolveEntityId("Inception", EntityType.movie);
  console.log(`   A.R. Rahman -> ${rahman}`);
  console.log(`   Inception   -> ${inception}`);
  const seeds = [rahman, inception].filter((x): x is string => !!x);

  console.log("\n2) cross-domain: taste -> India destinations");
  const dest = await tasteExpand(seeds, EntityType.destination, { countryCode: "IN", take: 8 });
  console.log(`   [${dest.length}] ${names(dest, 8)}`);

  console.log("\n3) cross-domain: taste -> films & tv");
  const films = await tasteExpand(seeds, EntityType.movie, { take: 5 });
  const tv = await tasteExpand(seeds, EntityType.tvShow, { take: 5 });
  console.log(`   films: ${names(films, 5)}`);
  console.log(`   tv:    ${names(tv, 5)}`);

  console.log("\n4) city places via locationQuery (Delhi) + popularity");
  const places = await tasteExpand(seeds, EntityType.place, { locationQuery: "Delhi", take: 5 });
  for (const p of places.slice(0, 5)) {
    const g = p.properties?.geocode;
    console.log(`   - ${p.name}  (${g?.city ?? g?.name ?? "?"}, ${g?.country_code ?? "?"})`);
  }

  console.log("\n✅ qloo client works end-to-end");
}

main().catch((e) => {
  console.error("❌ smoke test failed:", e);
  process.exit(1);
});
