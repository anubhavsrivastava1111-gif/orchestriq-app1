// Fails the build if the knowledge base has structural errors.
// Run: npm run validate
import { readFileSync } from 'node:fs';
const kb = (f) => JSON.parse(readFileSync(new URL(`../knowledge-base/${f}`, import.meta.url)));
const { exams } = kb('exams.json');
const { questions } = kb('questions.json');
const { lessons } = kb('lessons.json');
const guides = kb('guides.json');
const errors = [];
const papers = new Map(exams.flatMap((e) => e.papers.map((p) => [p.id, { exam: e.id, topics: p.topics }])));
const ids = new Set();
const STATUSES = ['author-draft', 'sme-verified', 'retired'];
for (const q of questions) {
  const where = q.id ?? '(no id)';
  if (ids.has(q.id)) errors.push(`${where}: duplicate id`);
  ids.add(q.id);
  for (const k of ['exam', 'paper', 'topic', 'stem', 'options', 'answer', 'explain', 'ref', 'status']) if (q[k] === undefined) errors.push(`${where}: missing ${k}`);
  const p = papers.get(q.paper);
  if (!p) errors.push(`${where}: unknown paper ${q.paper}`);
  else {
    if (p.exam !== q.exam) errors.push(`${where}: paper ${q.paper} belongs to ${p.exam}, not ${q.exam}`);
    if (!p.topics.includes(q.topic)) errors.push(`${where}: topic "${q.topic}" not in syllabus of ${q.paper}`);
  }
  if (!Array.isArray(q.options) || q.options.length < 2) errors.push(`${where}: needs ≥2 options`);
  else if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) errors.push(`${where}: answer index out of range`);
  if (new Set(q.options).size !== q.options?.length) errors.push(`${where}: duplicate options`);
  if (!q.explain?.simple || !q.explain?.steps?.length || !q.explain?.trap) errors.push(`${where}: explain needs simple, steps, trap`);
  if (!STATUSES.includes(q.status)) errors.push(`${where}: bad status ${q.status}`);
}
for (const l of lessons) for (const k of ['id', 'title', 'story', 'rule', 'example', 'check']) if (!l[k]) errors.push(`lesson ${l.id}: missing ${k}`);
// coverage report
const cov = {};
for (const e of exams) for (const p of e.papers) for (const t of p.topics) cov[`${e.id} / ${p.id} / ${t}`] = 0;
for (const q of questions) cov[`${q.exam} / ${q.paper} / ${q.topic}`]++;
const empty = Object.entries(cov).filter(([, n]) => n === 0).map(([k]) => k);
console.log(`Questions: ${questions.length}  Lessons: ${lessons.length}  Challenges: ${guides.challenges.length}  Workplace guides: ${guides.workplace.length}`);
console.log(`Syllabus topics: ${Object.keys(cov).length}, with ≥1 question: ${Object.keys(cov).length - empty.length}`);
if (empty.length) console.log(`Topics with no questions yet (${empty.length}):\n  - ` + empty.join('\n  - '));
if (errors.length) { console.error(`\n${errors.length} ERROR(S):\n` + errors.join('\n')); process.exit(1); }
console.log('Knowledge base OK');
