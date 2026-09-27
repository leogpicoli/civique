import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginQuestion, filterQuestions, freshState, nextQuestion, questionStatus,
  recordFor, restoreState, setDifficulty, submitAnswer, totals,
} from '../engine.js';

const questions = [
  { id: 1, sourceIds: [1, 101], question: 'Que signifie la fraternité ?', theme: 'Principes', answers: ['La solidarité.', "L'entraide."], wrong: ['La concurrence.', "L'isolement.", 'Un privilège.'] },
  { id: 2, sourceIds: [2], question: 'Qui élit les députés ?', theme: 'Institutions', answers: ['Les citoyens.'], wrong: ['Les préfets.', 'Les ministres.', 'Les juges.'] },
  { id: 3, sourceIds: [3], question: 'Quel fleuve traverse Paris ?', theme: 'Géographie', answers: ['La Seine.', 'Le fleuve Seine.', 'La Seine traverse Paris.'], wrong: ['Le Rhône.', 'La Loire.', 'La Garonne.'] },
];

const clone = value => JSON.parse(JSON.stringify(value));
const makeState = (bank = questions) => ({ ...freshState(bank), queue: bank.map(q => q.id) });
const answer = (state, correct, bank = questions) => {
  const index = state.current.options.findIndex(option => option.correct === correct);
  assert.equal(submitAnswer(state, bank, index), true);
};
const filter = (state, changes) => filterQuestions(state, questions, {
  status: 'all', difficulty: 'all', theme: 'all', search: '', ...changes,
}).map(q => q.id);

test('a new round contains every question exactly once and has no answer history', () => {
  const state = freshState(questions);
  assert.deepEqual([...state.queue].sort(), [1, 2, 3]);
  assert.equal(new Set(state.queue).size, 3);
  assert.deepEqual(state.mastered, []);
  assert.equal(state.round, 1);
  assert.equal(state.roundComplete, false);
  assert.equal(state.current, null);
  assert.deepEqual(totals(state, questions), {
    mastered: 0, unseen: 3, incorrect: 0, correct: 0, attempts: 0, successes: 0, errors: 0,
  });
});

test('a wrong answer moves to the tail, records the error, and remains unmastered', () => {
  const state = makeState();
  beginQuestion(state, questions);
  answer(state, false);
  assert.deepEqual(state.queue, [2, 3, 1]);
  assert.deepEqual(state.mastered, []);
  assert.equal(questionStatus(state, 1), 'incorrect');
  assert.deepEqual({ attempts: state.stats[1].attempts, correct: state.stats[1].correct, incorrect: state.stats[1].incorrect }, {
    attempts: 1, correct: 0, incorrect: 1,
  });
  assert.equal(nextQuestion(state, questions).id, 2);
  assert.deepEqual(state.queue, [2, 3, 1]);
});

test('a correct answer removes the question from the round and preserves earlier errors', () => {
  const state = makeState();
  beginQuestion(state, questions, 1);
  answer(state, false);
  nextQuestion(state, questions);
  beginQuestion(state, questions, 1);
  answer(state, true);
  assert.deepEqual(state.queue, [2, 3]);
  assert.deepEqual(state.mastered, [1]);
  assert.equal(state.stats[1].attempts, 2);
  assert.equal(state.stats[1].correct, 1);
  assert.equal(state.stats[1].incorrect, 1);
  assert.equal(questionStatus(state, 1), 'correct');
  assert.equal(totals(state, questions).errors, 1);
});

test('revisiting a mastered question and failing requeues it once', () => {
  const state = makeState();
  beginQuestion(state, questions, 1);
  answer(state, true);
  nextQuestion(state, questions);
  beginQuestion(state, questions, 1);
  answer(state, false);
  assert.deepEqual(state.mastered, []);
  assert.deepEqual(state.queue, [2, 3, 1]);
  assert.equal(state.stats[1].correct, 1);
  assert.equal(state.stats[1].incorrect, 1);
});

test('skipping leaves a question unseen, moves it to the tail, and does not advance its answer variant', () => {
  const state = makeState();
  const current = beginQuestion(state, questions, 1);
  assert.equal(current.variant, 0);
  assert.equal(nextQuestion(state, questions).id, 2);
  assert.deepEqual(state.queue, [2, 3, 1]);
  assert.equal(questionStatus(state, 1), 'unseen');
  assert.equal(recordFor(state, 1).attempts, 0);
  assert.equal(beginQuestion(state, questions, 1).variant, 0);
});

test('the final correct answer counts completion immediately, then Next begins a round retaining history', () => {
  const state = makeState();
  state.preferences = { ...state.preferences, view: 'library', difficulty: 'difficile', search: 'Paris' };
  for (const question of questions) {
    beginQuestion(state, questions, question.id);
    answer(state, true);
    assert.equal(setDifficulty(state, question.id, 'difficile'), true);
  }
  assert.equal(state.round, 1);
  assert.equal(state.completedRounds, 1);
  assert.equal(state.roundComplete, true);
  assert.equal(state.current.result, true);
  assert.equal(state.mastered.length, questions.length);
  assert.deepEqual(state.queue, []);
  const history = clone(state.stats);
  const preferences = clone(state.preferences);
  const current = nextQuestion(state, questions);
  assert.equal(state.round, 2);
  assert.equal(state.completedRounds, 1);
  assert.equal(state.roundComplete, false);
  assert.deepEqual(state.mastered, []);
  assert.deepEqual([...state.queue].sort(), [1, 2, 3]);
  assert.ok(state.queue.includes(current.id));
  assert.deepEqual(state.stats, history);
  assert.deepEqual(state.preferences, preferences);
  assert.equal(totals(state, questions).unseen, 0);
  assert.equal(totals(state, questions).successes, 3);
});

test('manual review after a complete round starts a new one, and an error cannot erase the completed round', () => {
  const state = makeState();
  for (const question of questions) {
    beginQuestion(state, questions, question.id);
    answer(state, true);
  }
  const feedback = state.current;
  assert.equal(beginQuestion(state, questions, feedback.id), feedback);
  assert.equal(beginQuestion(state, questions), feedback);
  assert.equal(state.round, 1);
  const current = beginQuestion(state, questions, 1);
  assert.equal(current.id, 1);
  assert.equal(current.result, null);
  assert.equal(current.variant, 1);
  assert.equal(state.round, 2);
  assert.equal(state.roundComplete, false);
  assert.equal(state.completedRounds, 1);
  assert.deepEqual(state.mastered, []);
  answer(state, false);
  assert.equal(state.completedRounds, 1);
  assert.equal(state.queue.at(-1), 1);
  assert.equal(new Set(state.queue).size, 3);
  assert.equal(state.stats[1].correct, 1);
  assert.equal(state.stats[1].incorrect, 1);
  const restored = restoreState(clone(state), questions);
  assert.equal(restored.completedRounds, 1);
  assert.equal(restored.round, 2);
  assert.equal(restored.current.result, false);
});

test('completion survives repeated reloads without double counting and preserves the final feedback', () => {
  let state = makeState();
  for (const question of questions) {
    beginQuestion(state, questions, question.id);
    answer(state, true);
  }
  const feedback = clone(state.current);
  const history = clone(state.stats);
  for (let reload = 0; reload < 3; reload++) {
    state = restoreState(clone(state), questions);
    assert.equal(state.roundComplete, true);
    assert.equal(state.completedRounds, 1);
    assert.equal(state.round, 1);
    assert.deepEqual(state.current, feedback);
    assert.equal(submitAnswer(state, questions, feedback.selected), false);
    assert.deepEqual(state.stats, history);
  }
  nextQuestion(state, questions);
  state = restoreState(clone(state), questions);
  assert.equal(state.round, 2);
  assert.equal(state.completedRounds, 1);
  assert.equal(state.roundComplete, false);
  assert.equal(state.current.result, null);
});

test('legacy pending completion is counted once and survives a growing question bank', () => {
  const bank = [questions[0]];
  const legacy = makeState(bank);
  beginQuestion(legacy, bank);
  answer(legacy, true, bank);
  delete legacy.roundComplete;
  legacy.completedRounds = 0;
  let state = restoreState(legacy, bank);
  assert.equal(state.roundComplete, true);
  assert.equal(state.completedRounds, 1);
  state = restoreState(clone(state), questions);
  assert.equal(state.roundComplete, true);
  assert.equal(state.completedRounds, 1);
  nextQuestion(state, questions);
  assert.equal(state.round, 2);
  assert.equal(state.completedRounds, 1);
  assert.equal(state.roundComplete, false);
  assert.deepEqual([...state.queue].sort(), [1, 2, 3]);
});

test('correct alternatives rotate after each answer, including failures and complete rounds', () => {
  const bank = [questions[2]];
  const state = makeState(bank);
  for (let attempt = 0; attempt < 7; attempt++) {
    const current = beginQuestion(state, bank);
    const variant = attempt % bank[0].answers.length;
    assert.equal(current.variant, variant);
    assert.equal(current.options.filter(option => option.correct).length, 1);
    assert.equal(current.options.find(option => option.correct).text, bank[0].answers[variant]);
    assert.equal(new Set(current.options.map(option => option.text)).size, 4);
    assert.ok(current.options.filter(option => !option.correct).every(option => bank[0].wrong.includes(option.text)));
    answer(state, attempt % 2 === 1, bank);
    nextQuestion(state, bank);
  }
  assert.equal(state.stats[3].attempts, 7);
  assert.equal(state.stats[3].correct, 3);
  assert.equal(state.stats[3].incorrect, 4);
  assert.equal(state.completedRounds, 3);
});

test('reloading an unanswered question preserves option order and does not count a presentation as an answer', () => {
  const state = makeState();
  beginQuestion(state, questions, 1);
  const restored = restoreState(clone(state), questions);
  assert.deepEqual(restored.current, state.current);
  assert.deepEqual(beginQuestion(restored, questions, 1), state.current);
  assert.equal(recordFor(restored, 1).attempts, 0);
  assert.equal(recordFor(restored, 1).nextVariant, 0);
  answer(restored, true);
  assert.equal(restored.stats[1].attempts, 1);
});

test('reloading an answered question preserves its result and cannot count the same answer twice', () => {
  for (const correct of [true, false]) {
    const state = makeState();
    beginQuestion(state, questions, 1);
    answer(state, correct);
    setDifficulty(state, 1, 'moyen');
    const restored = restoreState(clone(state), questions);
    assert.deepEqual(restored.current, state.current);
    assert.deepEqual(restored.stats, state.stats);
    const before = clone(restored);
    assert.equal(submitAnswer(restored, questions, restored.current.selected), false);
    assert.deepEqual(restored, before);
    assert.equal(restored.stats[1].attempts, 1);
    assert.equal(restored.stats[1].difficulty, 'moyen');
  }
});

test('difficulty is available only after answering, for failures as well as successes', () => {
  const state = makeState();
  assert.equal(setDifficulty(state, 1, 'facile'), false);
  beginQuestion(state, questions, 1);
  assert.equal(setDifficulty(state, 1, 'moyen'), false);
  answer(state, false);
  assert.equal(setDifficulty(state, 1, 'difficile'), true);
  assert.equal(setDifficulty(state, 1, 'facile'), true);
  assert.equal(setDifficulty(state, 1, 'unknown'), false);
  assert.equal(setDifficulty(state, 99, 'facile'), false);
  assert.equal(state.stats[1].difficulty, 'facile');
});

test('filters combine status, difficulty, theme, accent-insensitive search, and source IDs', () => {
  const state = makeState();
  beginQuestion(state, questions, 1);
  answer(state, false);
  setDifficulty(state, 1, 'difficile');
  beginQuestion(state, questions, 2);
  answer(state, true);
  setDifficulty(state, 2, 'facile');
  assert.deepEqual(filter(state, { status: 'unseen' }), [3]);
  assert.deepEqual(filter(state, { status: 'incorrect' }), [1]);
  assert.deepEqual(filter(state, { status: 'correct' }), [2]);
  assert.deepEqual(filter(state, { difficulty: 'facile' }), [2]);
  assert.deepEqual(filter(state, { difficulty: 'moyen' }), []);
  assert.deepEqual(filter(state, { difficulty: 'difficile', status: 'unseen' }), []);
  assert.deepEqual(filter(state, { difficulty: 'difficile', theme: 'Principes', search: 'FRATERNITE' }), [1]);
  assert.deepEqual(filter(state, { search: 'deputes' }), [2]);
  assert.deepEqual(filter(state, { search: '101' }), [1]);
  assert.deepEqual(filter(state, { theme: 'Géographie' }), [3]);
});

test('invalid selections leave progress unchanged', () => {
  const state = makeState();
  assert.equal(submitAnswer(state, questions, 0), false);
  beginQuestion(state, questions);
  const before = clone(state);
  for (const index of [-1, 4, 1.5, '0', null, undefined]) {
    assert.equal(submitAnswer(state, questions, index), false);
    assert.deepEqual(state, before);
  }
});

test('restore rejects incompatible state structures and inconsistent answer histories', () => {
  const valid = makeState();
  beginQuestion(valid, questions, 1);
  answer(valid, true);
  const malformed = [null, {}, { ...valid, version: 2 }, { ...valid, queue: '1,2,3' }, { ...valid, mastered: {} }, { ...valid, stats: [] }, { ...valid, round: 0 }, { ...valid, completedRounds: -1 }];
  for (const raw of malformed) assert.throws(() => restoreState(raw, questions));
  for (const patch of [
    { attempts: -1 }, { attempts: 2 }, { correct: 0, incorrect: 1, lastResult: 'correct' },
    { lastResult: 'incorrect' }, { lastResult: 'unknown' }, { nextVariant: 1.5 },
    { difficulty: 'impossible' }, { correct: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    const raw = clone(valid);
    Object.assign(raw.stats[1], patch);
    assert.throws(() => restoreState(raw, questions));
  }
});

test('restore reconciles a changed bank and drops tampered option content without modifying the import', () => {
  const state = makeState();
  beginQuestion(state, questions, 1);
  answer(state, true);
  nextQuestion(state, questions);
  const raw = clone(state);
  raw.queue = [2, 2, 3, 999];
  raw.mastered = [1, 1, 999];
  raw.current.options[0].text = '<script>untrusted</script>';
  raw.preferences.view = 'unknown';
  raw.preferences.search = 'x'.repeat(250);
  const snapshot = clone(raw);
  const added = { ...questions[2], id: 4, sourceIds: [4] };
  const changedBank = [questions[0], questions[1], added];
  const restored = restoreState(raw, changedBank);
  assert.deepEqual(raw, snapshot);
  assert.deepEqual(restored.mastered, [1]);
  assert.deepEqual([...restored.queue].sort(), [2, 4]);
  assert.equal(restored.current, null);
  assert.equal(restored.preferences.view, 'practice');
  assert.equal(restored.preferences.search.length, 200);
  assert.equal(restored.stats[1].correct, 1);
  assert.equal(restored.stats[999], undefined);
});
