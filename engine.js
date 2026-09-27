export const STORAGE_KEY = 'civique.progress.v1';
export const DIFFICULTIES = ['facile', 'moyen', 'difficile'];

export function shuffled(values, random = Math.random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function freshState(questions) {
  return { version: 1, round: 1, completedRounds: 0, roundComplete: false, mastered: [], queue: shuffled(questions.map(q => q.id)), stats: {}, current: null, preferences: { view: 'practice', status: 'all', difficulty: 'all', theme: 'all', search: '' }, updatedAt: null };
}

export function recordFor(state, id) {
  return state.stats[id] || { attempts: 0, correct: 0, incorrect: 0, nextVariant: 0, lastResult: null, lastAnsweredAt: null, difficulty: null };
}

function startNextRound(state, questions) {
  state.round++;
  state.roundComplete = false;
  state.mastered = [];
  state.queue = shuffled(questions.map(q => q.id));
  state.current = null;
}

export function beginQuestion(state, questions, id) {
  const requestedId = id ?? (state.roundComplete && state.current ? state.current.id : state.queue[0]);
  if (state.current?.id === requestedId && (!state.roundComplete || state.current.result !== null)) return state.current;
  if (id !== undefined && !questions.some(q => q.id === id)) return null;
  // Reviewing from the library after completion belongs to a fresh round.
  if (state.roundComplete) startNextRound(state, questions);
  const question = questions.find(q => q.id === (id ?? state.queue[0]));
  if (!question) return null;
  id = question.id;
  const record = recordFor(state, id);
  const variant = record.nextVariant % question.answers.length;
  state.current = {
    id, variant,
    options: shuffled([{ text: question.answers[variant], correct: true }, ...shuffled(question.wrong).slice(0, 3).map(text => ({ text, correct: false }))]),
    selected: null, result: null,
  };
  return state.current;
}

export function submitAnswer(state, questions, index) {
  const current = state.current;
  if (!current || state.roundComplete || current.result !== null || !Number.isInteger(index) || !current.options[index]) return false;
  const question = questions.find(q => q.id === current.id);
  const correct = current.options[index].correct;
  const record = { ...recordFor(state, current.id) };
  record.attempts++;
  record[correct ? 'correct' : 'incorrect']++;
  record.nextVariant = (current.variant + 1) % question.answers.length;
  record.lastResult = correct ? 'correct' : 'incorrect';
  record.lastAnsweredAt = new Date().toISOString();
  state.stats[current.id] = record;
  current.selected = index;
  current.result = correct;
  state.queue = state.queue.filter(id => id !== current.id);
  state.mastered = state.mastered.filter(id => id !== current.id);
  if (correct) state.mastered.push(current.id);
  else state.queue.push(current.id);
  if (questions.length > 0 && state.mastered.length === questions.length) {
    state.roundComplete = true;
    state.completedRounds++;
  }
  return true;
}

export function nextQuestion(state, questions) {
  // An unanswered question stays in the queue, behind the other pending questions.
  if (state.current?.result === null && state.queue.includes(state.current.id)) {
    state.queue = state.queue.filter(id => id !== state.current.id).concat(state.current.id);
  }
  state.current = null;
  if (state.roundComplete) startNextRound(state, questions);
  return beginQuestion(state, questions);
}

export function setDifficulty(state, id, difficulty) {
  if (!state.stats[id]?.attempts || !DIFFICULTIES.includes(difficulty)) return false;
  state.stats[id].difficulty = difficulty;
  return true;
}

export function questionStatus(state, id) {
  const record = recordFor(state, id);
  return record.attempts === 0 ? 'unseen' : record.lastResult === 'incorrect' ? 'incorrect' : 'correct';
}

export function totals(state, questions) {
  const records = questions.map(q => recordFor(state, q.id));
  return {
    mastered: state.mastered.length,
    unseen: records.filter(r => !r.attempts).length,
    incorrect: records.filter(r => r.lastResult === 'incorrect').length,
    correct: records.filter(r => r.lastResult === 'correct').length,
    attempts: records.reduce((sum, r) => sum + r.attempts, 0),
    successes: records.reduce((sum, r) => sum + r.correct, 0),
    errors: records.reduce((sum, r) => sum + r.incorrect, 0),
  };
}

export function filterQuestions(state, questions, filters) {
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
  return questions.filter(q => {
    const record = recordFor(state, q.id);
    return (filters.status === 'all' || questionStatus(state, q.id) === filters.status)
      && (filters.difficulty === 'all' || (record.attempts > 0 && record.difficulty === filters.difficulty))
      && (filters.theme === 'all' || q.theme === filters.theme)
      && (!filters.search || normalize(q.question + ' ' + q.sourceIds.join(' ')).includes(normalize(filters.search)));
  });
}

// Rebuild whitelisted fields, reject malformed imports, and reconcile a changing question bank.
export function restoreState(raw, questions) {
  if (!raw || raw.version !== 1 || !Array.isArray(raw.queue) || !Array.isArray(raw.mastered) || !raw.stats || typeof raw.stats !== 'object' || Array.isArray(raw.stats)) throw new Error('Sauvegarde incompatible ou endommagée.');
  const state = freshState(questions);
  const ids = new Set(questions.map(q => q.id));
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  if (!integer(raw.round) || raw.round < 1 || !integer(raw.completedRounds)
    || raw.completedRounds < raw.round - 1 || raw.completedRounds > raw.round
    || (raw.roundComplete !== undefined && typeof raw.roundComplete !== 'boolean')) throw new Error('Numéro de tour invalide.');
  state.round = raw.round;
  state.completedRounds = raw.completedRounds;
  for (const q of questions) {
    const record = raw.stats[q.id];
    if (!record) continue;
    if (![record.attempts, record.correct, record.incorrect, record.nextVariant].every(integer)
      || record.attempts !== record.correct + record.incorrect
      || (record.attempts > 0 && !['correct', 'incorrect'].includes(record.lastResult))
      || (record.lastResult === 'correct' && record.correct === 0)
      || (record.lastResult === 'incorrect' && record.incorrect === 0)
      || (record.difficulty !== null && !DIFFICULTIES.includes(record.difficulty))) throw new Error('Historique de réponses invalide.');
    state.stats[q.id] = {
      attempts: record.attempts, correct: record.correct, incorrect: record.incorrect,
      nextVariant: record.nextVariant % q.answers.length,
      lastResult: record.attempts ? record.lastResult : null,
      lastAnsweredAt: typeof record.lastAnsweredAt === 'string' ? record.lastAnsweredAt : null,
      difficulty: record.attempts ? record.difficulty : null,
    };
  }
  state.mastered = [...new Set(raw.mastered)].filter(id => ids.has(id) && state.stats[id]?.lastResult === 'correct');
  state.queue = [...new Set(raw.queue)].filter(id => ids.has(id) && !state.mastered.includes(id));
  for (const id of shuffled([...ids])) if (!state.queue.includes(id) && !state.mastered.includes(id)) state.queue.push(id);
  // Old saves counted completion only on Next. Recover that pending completion,
  // and keep a recorded completion even if the question bank has since grown.
  state.roundComplete = raw.roundComplete === true || raw.completedRounds === raw.round
    || (questions.length > 0 && state.mastered.length === questions.length);
  state.completedRounds = state.round - 1 + Number(state.roundComplete);
  const p = raw.preferences || {};
  for (const [key, allowed] of Object.entries({ view: ['practice', 'library', 'stats'], status: ['all', 'unseen', 'correct', 'incorrect'], difficulty: ['all', ...DIFFICULTIES], theme: ['all', ...new Set(questions.map(q => q.theme))] })) {
    if (allowed.includes(p[key])) state.preferences[key] = p[key];
  }
  if (typeof p.search === 'string') state.preferences.search = p.search.slice(0, 200);
  const c = raw.current;
  const q = questions.find(q => q.id === c?.id);
  if (q && integer(c.variant) && c.variant < q.answers.length && Array.isArray(c.options) && c.options.length === 4
    && c.options.every(o => o && typeof o.text === 'string' && typeof o.correct === 'boolean')
    && c.options.filter(o => o.correct).length === 1
    && c.options.find(o => o.correct).text === q.answers[c.variant]
    && c.options.filter(o => !o.correct).every(o => q.wrong.includes(o.text))
    && new Set(c.options.map(o => o.text)).size === 4
    && [null, true, false].includes(c.result)
    && (c.selected === null || (integer(c.selected) && c.selected < 4))
    && (c.result === null || (c.selected !== null && c.options[c.selected].correct === c.result && state.stats[q.id]?.lastResult === (c.result ? 'correct' : 'incorrect')))) {
    state.current = { id: q.id, variant: c.variant, options: c.options.map(o => ({ text: o.text, correct: o.correct })), selected: c.selected, result: c.result };
  }
  if (state.roundComplete && state.current?.result === null) state.current = null;
  state.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : null;
  return state;
}
