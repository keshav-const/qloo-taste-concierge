import { findVerified, coverage } from "../lib/evidence.ts";
for (const n of ["Mamas Restaurant","Qutub Minar","Connaught Place","Paranthe Wali Gali","Lotus Temple","Olive Bar & Kitchen","Random Nonexistent Place"]) {
  const v = findVerified(n);
  console.log(`  ${n.padEnd(26)} -> ${v.matched ? `✓ ${v.name} | ${v.sources} src | ${v.creator_summary}` : "— no match"}`);
}
const c = coverage();
console.log(`\ncoverage: ${c.total} POIs across ${Object.keys(c.areas).length} areas`);
