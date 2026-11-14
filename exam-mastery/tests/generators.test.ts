// Run: npm test. Checks every template across thousands of seeds and reports unique variants per topic.
import { readFileSync } from 'node:fs'
import { TEMPLATES, generate } from '../src/generators'
const exams = JSON.parse(readFileSync(new URL('../knowledge-base/exams.json', import.meta.url), 'utf8')).exams
const topics = new Set<string>(exams.flatMap((e: any) => e.papers.flatMap((p: any) => p.topics.map((t: string) => `${e.id}|${p.id}|${t}`))))
const N = 3000; let fail = 0; const perTopic: Record<string, number> = {}
for (const t of TEMPLATES) {
  if (!topics.has(`${t.exam}|${t.paper}|${t.topic}`)) { console.error(`✗ ${t.id}: topic not in syllabus`); fail++ }
  const stems = new Set<string>()
  for (let s = 1; s <= N; s++) {
    const q = generate(t, s)
    const bad = [q.options.length !== 4 && 'not 4 options', new Set(q.options).size !== 4 && 'duplicate options', (q.answer < 0 || q.answer > 3) && 'answer missing',
      /NaN|Infinity|undefined/.test(JSON.stringify(q)) && 'NaN/undefined'].filter(Boolean)
    if (bad.length) { fail++; if (fail < 15) console.error(`✗ ${q.id}: ${bad.join(', ')} :: ${q.stem} :: ${q.options.join(' | ')}`) }
    stems.add(q.stem)
  }
  const k = `${t.exam} ${t.paper} · ${t.topic}`; perTopic[k] = (perTopic[k] ?? 0) + stems.size
  console.log(`${t.id.padEnd(14)} ${String(stems.size).padStart(5)} unique of ${N}`)
}
console.log('\nUnique generated questions per topic (sampled):'); for (const [k, v] of Object.entries(perTopic)) console.log(`  ${k}: ${v}`)
console.log(fail ? `\n${fail} FAILURES` : '\nAll generator checks passed'); process.exit(fail ? 1 : 0)
