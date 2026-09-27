import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const originalPath = path.join(root, 'data-gouv-qcm-civique-naturalisation.json');
const dataPath = path.join(root, 'data');
const backupPath = path.join(dataPath, 'source-original.json');
const semanticGroups = [[3, 116], [13, 135], [21, 99], [41, 72]];

// Always regenerate from the immutable source, never from an already merged export.
await mkdir(dataPath, { recursive: true });
try {
  await copyFile(originalPath, backupPath, constants.COPYFILE_EXCL);
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}

const readJson = async (filename) => JSON.parse((await readFile(filename, 'utf8')).replace(/^\uFEFF/, ''));
const source = await readJson(backupPath);
// Documented rewording of correct answers (grammar, duplicates, outdated facts), keyed by retained ID.
const answerAdjustments = await readJson(path.join(dataPath, 'answer-adjustments.json'));
const entries = source.data.flatMap((section, sectionIndex) => section.questions.map((question) => ({
  ...question,
  theme: section.theme,
  sectionIndex,
})));
assert.equal(entries.length, 258, 'The preserved source must contain all 258 questions.');
const byId = new Map(entries.map((entry) => [entry.id, entry]));
assert.equal(byId.size, entries.length, 'Source IDs must be unique.');

const normalize = (value) => value.normalize('NFKC').toLocaleLowerCase('fr')
  .replace(/[\p{P}\p{S}]/gu, ' ').replace(/\s+/gu, ' ').trim();
const tidy = (value) => value.replace(/\s+/gu, ' ').trim();
// All choices share one typography, so a final period or a capital never singles out the right answer.
const option = (value) => (value.charAt(0).toLocaleUpperCase('fr') + value.slice(1)).replace(/(?<!\.)\.$/u, '');
const unique = (values) => {
  const seen = new Set();
  return values.filter((value) => {
    assert.equal(typeof value, 'string', 'Answers must be strings.');
    const key = normalize(value);
    assert.ok(key, 'Answers must not be empty.');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(tidy);
};

const parent = new Map(entries.map(({ id }) => [id, id]));
function find(id) {
  if (parent.get(id) !== id) parent.set(id, find(parent.get(id)));
  return parent.get(id);
}
function merge(ids) {
  ids.forEach((id) => assert.ok(byId.has(id), `Unknown merged source ID: ${id}`));
  const roots = ids.map(find);
  const first = Math.min(...roots);
  roots.forEach((id) => parent.set(id, first));
}

const exactByQuestion = new Map();
for (const entry of entries) {
  const key = normalize(entry.question);
  if (exactByQuestion.has(key)) merge([entry.id, exactByQuestion.get(key)]);
  else exactByQuestion.set(key, entry.id);
}
semanticGroups.forEach(merge);

const grouped = new Map();
for (const entry of entries) {
  const id = find(entry.id);
  if (!grouped.has(id)) grouped.set(id, []);
  grouped.get(id).push(entry);
}
const groups = [...grouped.values()].map((group) => group.sort((a, b) => a.id - b.id))
  .sort((a, b) => a[0].id - b[0].id);

const distractors = {};
const reviews = {};
for (let part = 1; part <= 3; part++) {
  for (const [id, answers] of Object.entries(await readJson(path.join(dataPath, `distractors-${part}.json`)))) {
    assert.ok(!Object.hasOwn(distractors, id), `Duplicate distractor entry ${id}.`);
    distractors[id] = answers;
  }
  const corrections = await readJson(path.join(dataPath, `review-${part}.json`));
  for (const [id, correction] of Object.entries(corrections)) {
    assert.ok(byId.has(Number(id)), `Unknown review ID ${id}.`);
    assert.ok(!Object.hasOwn(reviews, id), `Duplicate review entry ${id}.`);
    assert.ok(Array.isArray(correction.suggested_answers) && correction.suggested_answers.length,
      `Review ${id} has no replacement answers.`);
    assert.equal(typeof correction.reason, 'string', `Review ${id} has no reason.`);
    assert.ok(/^https:\/\//u.test(correction.source), `Review ${id} has no source URL.`);
    reviews[id] = correction;
  }
}
assert.equal(Object.keys(distractors).length, entries.length, 'Every source question needs its own distractors.');
for (const entry of entries) {
  const wrong = distractors[entry.id];
  assert.ok(Array.isArray(wrong), `Missing distractors for ${entry.id}.`);
  assert.equal(wrong.length, 3, `Question ${entry.id} must have exactly three distractors.`);
  assert.equal(unique(wrong).length, 3, `Question ${entry.id} has duplicate distractors.`);
  const correct = reviews[entry.id]?.suggested_answers ?? entry.suggested_answers;
  const correctKeys = new Set(correct.map(normalize));
  wrong.forEach((answer) => assert.ok(!correctKeys.has(normalize(answer)),
    `Question ${entry.id} has a distractor equal to a correct answer: ${answer}`));
}

const mergedGroupDetails = groups.filter((group) => group.length > 1).map((group) => ({
  retainedId: group[0].id,
  sourceIds: group.map(({ id }) => id),
  type: group.every((entry) => normalize(entry.question) === normalize(group[0].question))
    ? 'exact-normalized' : 'semantic-reviewed',
  question: group[0].question,
  originalQuestions: group.map(({ id, question }) => ({ id, question })),
  answersBefore: group.reduce((count, entry) => count + entry.suggested_answers.length, 0),
  answersAfter: unique(group.flatMap((entry) => entry.suggested_answers)).length,
}));

const deduplication = {
  inputQuestions: entries.length,
  mergedQuestions: entries.length - groups.length,
  outputQuestions: groups.length,
  groups: mergedGroupDetails,
};
assert.equal(deduplication.outputQuestions, 254, 'The reviewed corpus must contain 254 unique questions.');

for (const [id, adjustment] of Object.entries(answerAdjustments)) {
  assert.ok(groups.some((group) => group[0].id === Number(id)), `Adjustment ${id} must target a retained question ID.`);
  assert.ok(Array.isArray(adjustment.answers) && adjustment.answers.length, `Adjustment ${id} has no answers.`);
  assert.equal(typeof adjustment.reason, 'string', `Adjustment ${id} has no reason.`);
}

const questions = groups.map((group) => {
  const primary = group[0];
  const reviewedAnswers = group.flatMap((entry) => reviews[entry.id]?.suggested_answers ?? entry.suggested_answers);
  const answers = unique(answerAdjustments[primary.id]?.answers ?? reviewedAnswers).map(option);
  const wrong = unique(distractors[primary.id]).map(option);
  const correctKeys = new Set(answers.map(normalize));
  wrong.forEach((answer) => assert.ok(!correctKeys.has(normalize(answer)),
    `Merged question ${primary.id} has a conflicting distractor: ${answer}`));
  const corrections = group.filter((entry) => reviews[entry.id]).map((entry) => ({
    reason: reviews[entry.id].reason,
    source: reviews[entry.id].source,
  }));
  return {
    id: `q-${primary.id}`,
    sourceIds: group.map(({ id }) => id),
    theme: primary.theme,
    question: tidy(primary.question),
    answers,
    wrong,
    corrections,
  };
});
assert.equal(new Set(questions.flatMap((question) => question.sourceIds)).size, 258,
  'Every original question must remain traceable in the runtime corpus.');

const cleaned = {
  ...source,
  data: source.data.map((section, sectionIndex) => ({
    ...section,
    questions: groups.filter((group) => group[0].sectionIndex === sectionIndex).map((group) => {
      const { theme, sectionIndex: ignoredIndex, ...primary } = group[0];
      return {
        ...primary,
        suggested_answers: unique(group.flatMap((entry) => entry.suggested_answers)),
        source_ids: group.map(({ id }) => id),
      };
    }),
  })),
};
const answerDuplicates = entries.map((entry) => ({
  id: entry.id,
  removed: entry.suggested_answers.length - unique(entry.suggested_answers).length,
})).filter((entry) => entry.removed > 0);
const report = {
  sourceFile: 'data-gouv-qcm-civique-naturalisation.json',
  preservedSource: 'data/source-original.json',
  ...deduplication,
  normalization: 'Unicode NFKC ; casse, espaces et ponctuation normalisés ; première formulation conservée.',
  semanticMergePolicy: 'Seuls les quatre groupes de sens relus explicitement sont fusionnés. Les autres questions proches sont conservées, notamment 53 et 58 dont les réponses ne sont pas interchangeables.',
  semanticGroups,
  runtimeAnswerAdjustments: answerAdjustments,
  answerDuplicates,
  originalAnswerCount: entries.reduce((count, entry) => count + entry.suggested_answers.length, 0),
  cleanedAnswerCount: cleaned.data.reduce((count, section) => count + section.questions.reduce(
    (total, question) => total + question.suggested_answers.length, 0), 0),
  reviewedQuestions: Object.keys(reviews).map(Number).sort((a, b) => a - b),
  reviewedAnswerPolicy: 'Les corrections sourcées sont appliquées aux réponses de chaque question avant la fusion dans data/questions.json. La copie dédoublonnée du fichier fourni conserve ses réponses pédagogiques originales.',
};

// No outputs are changed until the entire source and runtime corpus pass validation.
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
await writeFile(path.join(dataPath, 'questions.json'), serialize({ metadata: source.metadata, deduplication, questions }), 'utf8');
await writeFile(path.join(dataPath, 'deduplication-report.json'), serialize(report), 'utf8');
await writeFile(originalPath, serialize(cleaned), 'utf8');
console.log(`${deduplication.inputQuestions} questions source → ${deduplication.outputQuestions} questions uniques ; ${deduplication.mergedQuestions} doublons fusionnés ; ${Object.keys(reviews).length} corrections sourcées.`);
