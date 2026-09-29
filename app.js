import { STORAGE_KEY, freshState, restoreState, recordFor, beginQuestion, submitAnswer, nextQuestion, setConfidence, totals, filterQuestions, questionStatus } from './engine.js';

const root = document.querySelector('#app');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icons = {
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H4z"/><path d="M20 4h-4a3 3 0 0 0-3 3v14a4 4 0 0 1 4-3h3z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  chart: '<path d="M4 20V10m8 10V4m8 16v-7"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  cross: '<path d="m6 6 12 12M18 6 6 18"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name] || icons.book}</svg>`;
const labels = { correct: 'Réussie', incorrect: 'À revoir', unseen: 'À découvrir', guessed: 'J’ai répondu au pif', known: 'Je la savais' };
let bank, questions, state, storageError = '', pendingImport = null;

function toast(message) {
  const el = document.querySelector('#toast');
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('visible'), 4500);
}

function save() {
  state.updatedAt = new Date().toISOString();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); storageError = ''; }
  catch { storageError = 'La sauvegarde dans ce navigateur est indisponible. Exportez votre progression pour la conserver.'; }
}

function statCard(number, label, symbol, className = '') {
  return `<div class="stat-card ${className}"><span class="stat-symbol">${icon(symbol)}</span><div><strong>${number}</strong><span>${label}</span></div></div>`;
}

function render() {
  const t = totals(state, questions);
  const view = state.preferences.view;
  const percent = Math.round(t.mastered / questions.length * 100);
  root.innerHTML = `
    <aside class="sidebar">
      <a class="brand" href="#" data-view="practice"><span class="brand-mark">c.</span><span>Civique<span class="brand-sub">LE CARNET DE RÉVISION</span></span></a>
      <div class="sidebar-label">MON ESPACE</div>
      <nav aria-label="Navigation principale">
        ${[['practice', 'book', 'S’entraîner'], ['library', 'grid', 'Les questions'], ['stats', 'chart', 'Ma progression']].map(([key, symbol, title]) => `<button class="nav-item ${view === key ? 'active' : ''}" data-view="${key}" ${view === key ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${title}</span>${key === 'library' ? `<small>${questions.length}</small>` : ''}</button>`).join('')}
      </nav>
      <div class="sidebar-note"><span class="little-star">✦</span><p>Chaque question est<br>un pas de plus.</p><span>À votre rythme, vers<br>la citoyenneté française.</span></div>
      <div class="sidebar-bottom"><button class="nav-item" data-action="settings">${icon('settings')}<span>Mes sauvegardes</span></button><div class="local-note">${icon('shield')}<span>Votre progression reste chez vous.</span></div><div class="tricolor"><i></i><i></i><i></i></div></div>
    </aside>
    <div class="workspace">
      <header class="topbar"><span>EXAMEN CIVIQUE <span class="topbar-slash">/</span> <strong>NATURALISATION</strong></span><button class="save-state ${storageError ? 'save-error' : ''}" data-action="settings" aria-label="Mes sauvegardes — ${storageError ? 'sauvegarde indisponible' : 'progression enregistrée'}"><i></i>${storageError ? 'Sauvegarde indisponible' : 'Progression enregistrée'}</button></header>
      <main id="main" class="view-${view}" tabindex="-1">
        ${storageError ? `<div class="storage-warning" role="alert">${escape(storageError)} <button data-action="export">Exporter</button></div>` : ''}
        <section class="page-heading"><div><div class="eyebrow">${view === 'practice' ? 'UN PEU CHAQUE JOUR' : view === 'library' ? 'VOTRE BIBLIOTHÈQUE' : 'LE CHEMIN PARCOURU'}</div><h1>${view === 'practice' ? 'Un pas vers la citoyenneté.' : view === 'library' ? 'Toutes vos questions.' : 'Les progrès se construisent.'}</h1><p>${view === 'practice' ? 'Apprenez, essayez, recommencez. Chaque réponse vous fait avancer.' : view === 'library' ? 'Retrouvez une question, révisez un thème ou revenez sur vos difficultés.' : 'Vos réussites, vos essais et les sujets à explorer, au même endroit.'}</p></div><span class="round-pill">${icon('spark')} Tour ${state.round}</span></section>
        <section class="stats-strip" aria-label="Votre progression">${statCard(`${t.mastered}<small> / ${questions.length}</small>`, 'Maîtrisées dans ce tour', 'check', 'green')}${statCard(t.incorrect, 'À revoir', 'book', 'orange')}${statCard(t.unseen, 'À découvrir', 'grid')}${statCard(t.attempts ? `${Math.round(t.successes / t.attempts * 100)}<small> %</small>` : '—', 'Réussite · tous les essais', 'chart')}</section>
        ${view === 'practice' ? practiceView(t, percent) : view === 'library' ? libraryView() : statsView(t)}
        <footer class="page-footer"><span>Civique <span>·</span> Apprendre à faire partie de l’histoire.</span><button data-action="about">À propos des questions</button></footer>
      </main>
    </div>
    <dialog id="modal" aria-labelledby="modal-title"></dialog>`;
}

function practiceView(t, percent) {
  if (!state.current) {
    if (state.mastered.length === questions.length) return `<section class="empty-state"><span class="big-symbol">✦</span><h2>Un tour complet, bravo !</h2><p>Vous avez réussi les ${questions.length} questions. Vos évaluations et votre historique sont conservés.</p><button class="primary" data-action="next">Commencer le tour suivant ${icon('arrow')}</button></section>`;
    beginQuestion(state, questions);
    save();
  }
  const c = state.current;
  const q = questions.find(q => q.id === c.id);
  const r = recordFor(state, q.id);
  const answered = c.result !== null;
  const complete = state.mastered.length === questions.length;
  return `<div class="practice-layout"><section class="quiz-card" aria-label="Question en cours">
    <div class="quiz-top"><span class="theme-tag">${icon('book')}${escape(q.theme)}</span><span class="question-number">N° ${q.sourceIds[0]}</span></div>
    <div class="quiz-body"><div class="question-label">À VOUS DE JOUER <span>UNE SEULE RÉPONSE À CHOISIR</span></div><h2 id="question-title">${escape(q.question)}</h2>
      <div class="answers" role="group" aria-labelledby="question-title">${c.options.map((option, i) => {
        const status = answered ? option.correct ? 'is-correct' : c.selected === i ? 'is-wrong' : 'is-muted' : c.selected === i ? 'is-selected' : '';
        return `<button class="answer ${status}" data-answer="${i}" aria-pressed="${c.selected === i}" ${answered ? 'disabled' : ''}><span class="answer-letter">${'ABCD'[i]}</span><span>${escape(option.text)}</span><span class="answer-end">${answered && option.correct ? icon('check') : answered && c.selected === i ? icon('cross') : '<span class="radio-dot"></span>'}</span></button>`;
      }).join('')}</div>
      ${answered ? feedback(q, c) : '<p class="answer-hint">Cliquez sur une réponse pour la valider immédiatement.</p>'}
      ${c.result === true ? `<div class="confidence-box"><div><strong>Vous la saviez ou c’était au pif ?</strong><span>${c.confidence === 'guessed' ? 'Cette question revient en fin de file pour la revoir.' : c.confidence === 'known' ? 'Cette question est maîtrisée pour ce tour.' : 'Au pif ? Elle reviendra en fin de file.'}</span></div><div class="confidence-buttons">${['guessed', 'known'].map(value => `<button class="confidence ${value} ${c.confidence === value ? 'chosen' : ''}" data-confidence="${value}" aria-pressed="${c.confidence === value}" ${c.confidence !== null ? 'disabled' : ''}>${labels[value]}</button>`).join('')}</div></div>` : ''}
    </div><div class="quiz-bottom"><span class="keyboard-hint">${answered ? `${r.correct} réussite${r.correct > 1 ? 's' : ''} · ${r.incorrect} erreur${r.incorrect > 1 ? 's' : ''}` : '<kbd>1</kbd>–<kbd>4</kbd> pour répondre directement'}</span>${answered ? `<button class="primary" data-action="next" ${c.result === true && c.confidence === null ? 'disabled' : ''}>${complete ? 'Commencer le tour suivant' : 'Question suivante'}${icon('arrow')}</button>` : `<div class="quiz-actions"><button class="text-button" data-action="skip">Passer</button></div>`}</div>
    </section><aside class="practice-aside"><section class="progress-panel"><div class="panel-eyebrow">VOTRE TOUR ${state.round}</div><div class="progress-ring" style="--progress:${percent * 3.6}deg"><div><strong>${percent}<small>%</small></strong><span>du chemin parcouru</span></div></div><h3>Petit à petit, ça avance.</h3><p><strong>${questions.length - t.mastered} question${questions.length - t.mastered > 1 ? 's' : ''}</strong> à réussir pour terminer ce tour.</p><div class="thin-progress"><i style="width:${percent}%"></i></div><div class="progress-legend"><span>${t.mastered} maîtrisées</span><span>${questions.length} au total</span></div></section><section class="tip-panel"><span>${icon('spark')}</span><h3>Le droit de se tromper.</h3><p>Une erreur ou une bonne réponse au pif ? La question revient en fin de file. Choisissez « Je la savais » après une bonne réponse pour la maîtriser.</p><p>À chaque nouveau passage, découvrez une autre réponse possible.</p></section><button class="browse-link" data-view="library">Explorer les questions ${icon('arrow')}</button></aside></div>`;
}

function feedback(q, c) {
  const others = q.answers.filter((_, i) => i !== c.variant);
  return `<section tabindex="-1" class="feedback ${c.result ? 'success' : 'retry'}" role="status"><div class="feedback-heading">${icon(c.result ? 'check' : 'book')}<strong>${c.result ? 'Bien joué, c’est la bonne réponse !' : 'Pas tout à fait. On retient, puis on réessaie.'}</strong></div>${!c.result ? `<p>La bonne réponse : <strong>${escape(q.answers[c.variant])}</strong></p><p>Cette question reste à réviser et passe à la fin de la file.</p>` : ''}${others.length ? `<div class="other-answers"><h3>Les autres réponses possibles</h3><p>Une autre de ces réponses vous sera proposée au prochain passage.</p><ul>${others.map(a => `<li>${escape(a)}</li>`).join('')}</ul></div>` : ''}${q.corrections?.length ? `<details class="source-note"><summary>Une précision pour bien apprendre</summary>${q.corrections.map(note => `<p>${escape(note.reason)} <a href="${escape(note.source)}" target="_blank" rel="noopener noreferrer">Source de référence ↗</a></p>`).join('')}</details>` : ''}${state.mastered.length === questions.length ? '<p class="round-complete">✦ Toutes les questions de ce tour sont maîtrisées ! Le prochain tour conserve votre historique et vos évaluations.</p>' : ''}</section>`;
}

function libraryView() {
  const p = state.preferences;
  return `<section class="library-panel"><div class="library-toolbar"><label class="search-box">${icon('search')}<span class="sr-only">Rechercher une question</span><input id="search" type="search" placeholder="Rechercher : mot ou numéro…" maxlength="200" value="${escape(p.search)}"></label><label class="filter-label"><span>Thème</span><select id="theme-filter"><option value="all">Tous les thèmes</option>${[...new Set(questions.map(q => q.theme))].map(theme => `<option ${p.theme === theme ? 'selected' : ''}>${escape(theme)}</option>`).join('')}</select></label><label class="filter-label"><span>Votre réponse</span><select id="confidence-filter">${['all', 'guessed', 'known'].map(d => `<option value="${d}" ${(p.confidence || 'all') === d ? 'selected' : ''}>${d === 'all' ? 'Toutes les réponses' : labels[d]}</option>`).join('')}</select></label></div><div class="status-tabs" role="group" aria-label="Filtrer par résultat">${[['all', 'Toutes'], ['unseen', 'À découvrir'], ['correct', 'Réussies'], ['incorrect', 'À revoir']].map(([value, label]) => `<button data-status="${value}" class="${p.status === value ? 'selected' : ''}" aria-pressed="${p.status === value}">${label}<span>${value === 'all' ? questions.length : questions.filter(q => questionStatus(state, q.id) === value).length}</span></button>`).join('')}</div><p class="filter-explanation">Les résultats indiquent votre dernier essai. Les bonnes réponses au pif restent dans la file de révision.</p><div id="question-results">${libraryResults()}</div></section>`;
}

function libraryResults() {
  const filtered = filterQuestions(state, questions, { ...state.preferences, difficulty: 'all' });
  return `<div class="results-heading"><span>${filtered.length} question${filtered.length > 1 ? 's' : ''}</span><button class="text-button" data-action="clear-filters">Effacer les filtres</button></div>${filtered.length ? `<div class="question-list">${filtered.map(q => {
    const r = recordFor(state, q.id);
    const status = questionStatus(state, q.id);
    return `<button class="question-row" data-question="${q.id}"><span class="list-number">${String(q.sourceIds[0]).padStart(3, '0')}</span><span class="list-question"><span class="list-theme">${escape(q.theme)}</span><strong>${escape(q.question)}</strong><span class="list-history">${r.attempts ? `${r.correct} réussite${r.correct > 1 ? 's' : ''} · ${r.incorrect} erreur${r.incorrect > 1 ? 's' : ''}` : 'Pas encore essayée'}${state.mastered.includes(q.id) ? ' · Validée dans ce tour' : ''}</span></span><span class="row-badges"><span class="status-badge ${status}">${labels[status]}</span>${r.confidence ? `<span class="confidence-label ${r.confidence}">● ${labels[r.confidence]}</span>` : ''}</span>${icon('arrow')}</button>`;
  }).join('')}</div>` : '<div class="empty-state"><h2>Aucune question pour ces filtres.</h2><p>Essayez un autre thème ou effacez vos filtres.</p></div>'}`;
}

function statsView(t) {
  return `<div class="stats-layout"><section class="content-panel"><div class="section-heading"><div><div class="eyebrow">THÈME PAR THÈME</div><h2>Votre carte de progression.</h2></div></div>${[...new Set(questions.map(q => q.theme))].map((theme, i) => {
    const group = questions.filter(q => q.theme === theme);
    const count = group.filter(q => state.mastered.includes(q.id)).length;
    return `<button class="theme-progress" data-theme="${escape(theme)}"><span class="theme-index">0${i + 1}</span><span><strong>${escape(theme)}</strong><span class="thin-progress"><i style="width:${count / group.length * 100}%"></i></span></span><span>${count} / ${group.length}${icon('arrow')}</span></button>`;
  }).join('')}<p class="muted">Les barres indiquent les questions maîtrisées dans le tour en cours.</p></section><section class="content-panel history-panel"><div class="eyebrow">DEPUIS LE PREMIER JOUR</div><h2>Chaque essai compte.</h2><dl><div><dt>Tours terminés</dt><dd>${state.completedRounds}</dd></div><div><dt>Réponses données</dt><dd>${t.attempts}</dd></div><div><dt>Bonnes réponses</dt><dd class="positive">${t.successes}</dd></div><div><dt>Réponses à retravailler</dt><dd>${t.errors}</dd></div><div><dt>Questions déjà essayées</dt><dd>${questions.length - t.unseen}</dd></div></dl><button class="secondary" data-action="export">${icon('download')}Exporter ma progression</button></section></div>`;
}

function openModal(title, body) {
  const modal = document.querySelector('#modal');
  modal.innerHTML = `<div class="modal-top"><h2 id="modal-title">${title}</h2><button class="icon-button" data-action="close-modal" aria-label="Fermer">${icon('cross')}</button></div>${body}`;
  modal.showModal();
}

function settings() {
  openModal('Vos révisions, bien gardées.', `<p>Votre progression et vos préférences sont enregistrées automatiquement dans ce navigateur, à cette adresse.</p><p>Revenez sur <strong>${escape(location.host + location.pathname.replace(/index.html$/, ''))}</strong> avec le même navigateur pour reprendre. Chaque appareil garde sa propre progression : exportez-la ici puis importez-la sur votre téléphone ou votre ordinateur pour continuer ailleurs. Effacer les données du navigateur ou utiliser une fenêtre privée peut supprimer cette sauvegarde.</p><div class="backup-actions"><button class="primary" data-action="export">${icon('download')}Exporter une sauvegarde</button><label class="secondary file-button">Importer une sauvegarde<input id="import-file" type="file" accept="application/json,.json"></label></div><p class="muted">Le fichier exporté permet de transférer vos révisions vers un autre navigateur ou ordinateur.</p><div class="danger-zone"><strong>Repartir de zéro</strong><p>Supprimer les résultats, les évaluations et les tours enregistrés.</p><button class="danger-button" data-action="reset-confirm">Effacer ma progression</button></div>`);
}

function exportProgress() {
  const blob = new Blob([JSON.stringify({ app: 'Civique', exportedAt: new Date().toISOString(), state }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `civique-progression-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Votre sauvegarde a été exportée.');
}

function answer(index) {
  if (!submitAnswer(state, questions, index)) return;
  save(); render();
  document.querySelector('.feedback')?.focus({ preventScroll: true });
  document.querySelector('.feedback')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function action(name) {
  if (name === 'next' || name === 'skip') {
    nextQuestion(state, questions); save(); render();
    document.querySelector('#question-title')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else if (name === 'settings') settings();
  else if (name === 'close-modal') document.querySelector('#modal').close();
  else if (name === 'export') exportProgress();
  else if (name === 'clear-filters') { Object.assign(state.preferences, { search: '', status: 'all', difficulty: 'all', confidence: 'all', theme: 'all' }); save(); render(); }
  else if (name === 'reset-confirm') openModal('Effacer votre progression ?', '<p>Cette action supprime tous vos essais et vos évaluations dans ce navigateur. Exportez une copie si vous souhaitez les conserver.</p><div class="backup-actions"><button class="secondary" data-action="close-modal">Annuler</button><button class="danger-button" data-action="reset">Tout effacer</button></div>');
  else if (name === 'reset') { state = freshState(questions); beginQuestion(state, questions); save(); render(); toast('Un nouveau départ. Bonnes révisions !'); }
  else if (name === 'import-confirm' && pendingImport) { state = pendingImport; pendingImport = null; save(); render(); toast('Votre progression a été restaurée.'); }
  else if (name === 'about') openModal('Des questions pour apprendre.', `<p>Entraînement indépendant à partir du fichier <strong>data-gouv-qcm-civique-naturalisation.json</strong>.</p><p>${escape(bank.metadata.avertissement_legal || '')}</p><p>Les trois mauvaises réponses de chaque QCM ont été rédigées pour cet entraînement. Une seule bonne réponse est proposée à la fois ; les autres sont révélées après validation.</p><p>Les précisions apportées aux réponses sont accompagnées de leurs sources après la réponse. Ce carnet ne simule pas le barème d’un examen officiel.</p><p><strong>${questions.length} questions uniques</strong> · ${bank.deduplication.mergedQuestions} doublons fusionnés · ${escape(bank.metadata.licence || 'Licence Ouverte 2.0')}</p>`);
}

document.addEventListener('click', event => {
  if (!state) return;
  const el = event.target.closest('button, a[data-view]');
  if (!el || el.disabled) return;
  if (el.dataset.view) { event.preventDefault(); state.preferences.view = el.dataset.view; save(); render(); }
  else if (el.dataset.action) action(el.dataset.action);
  else if (el.dataset.answer !== undefined && state.current?.result === null) { answer(Number(el.dataset.answer)); }
  else if (el.dataset.confidence) { if (!setConfidence(state, questions, el.dataset.confidence)) return; save(); render(); document.querySelector('[data-action="next"]')?.focus({ preventScroll: true }); }
  else if (el.dataset.status) { state.preferences.status = el.dataset.status; save(); render(); }
  else if (el.dataset.question) {
    const id = el.dataset.question;
    // Opening a question from the library intentionally starts a fresh attempt.
    if (state.current?.id === id && state.current.result !== null) state.current = null;
    beginQuestion(state, questions, id); state.preferences.view = 'practice'; save(); render(); window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (el.dataset.theme) { Object.assign(state.preferences, { view: 'library', theme: el.dataset.theme, status: 'all', difficulty: 'all', confidence: 'all', search: '' }); save(); render(); }
});

document.addEventListener('input', event => {
  if (event.target.id === 'search') { state.preferences.search = event.target.value; save(); document.querySelector('#question-results').innerHTML = libraryResults(); }
});

document.addEventListener('change', async event => {
  const el = event.target;
  if (el.id === 'theme-filter' || el.id === 'confidence-filter') { state.preferences[el.id === 'theme-filter' ? 'theme' : 'confidence'] = el.value; save(); render(); }
  if (el.id === 'import-file' && el.files[0]) {
    try {
      if (el.files[0].size > 5_000_000) throw new Error('Ce fichier est trop volumineux.');
      const raw = JSON.parse(await el.files[0].text());
      if (raw.app !== 'Civique') throw new Error('Ce fichier n’est pas une sauvegarde Civique.');
      pendingImport = restoreState(raw.state, questions);
      openModal('Restaurer cette sauvegarde ?', `<p>Elle contient ${totals(pendingImport, questions).attempts} essais et remplacera la progression de ce navigateur.</p><div class="backup-actions"><button class="secondary" data-action="close-modal">Annuler</button><button class="primary" data-action="import-confirm">Restaurer ma progression</button></div>`);
    } catch (error) { toast(`Import impossible : ${error.message}`); el.value = ''; }
  }
});

document.addEventListener('keydown', event => {
  if (event.repeat || !state || state.preferences.view !== 'practice' || document.querySelector('dialog[open]') || event.ctrlKey || event.metaKey || event.altKey || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
  if (/^[1-4]$/.test(event.key) && state.current?.result === null) { event.preventDefault(); answer(Number(event.key) - 1); }
  if (event.key === 'Enter' && event.target.tagName !== 'BUTTON' && state.current?.result !== null && state.current) { event.preventDefault(); action('next'); }
});

window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY || !event.newValue || !questions) return;
  try { state = restoreState(JSON.parse(event.newValue), questions); render(); toast('Progression synchronisée avec votre autre onglet.'); } catch { toast('La sauvegarde reçue n’a pas pu être chargée.'); }
});

async function init() {
  try {
    const response = await fetch('data/questions.json');
    if (!response.ok) throw new Error('La banque de questions est indisponible.');
    bank = await response.json(); questions = bank.questions;
    if (!questions?.length) throw new Error('La banque de questions est vide.');
    let raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); }
    catch { storageError = 'Le stockage de ce navigateur est indisponible. Pensez à exporter votre progression.'; }
    try { state = raw ? restoreState(JSON.parse(raw), questions) : freshState(questions); }
    catch {
      // Preserve an unreadable save before offering a new session.
      try { localStorage.setItem(`${STORAGE_KEY}.recovery.${Date.now()}`, raw); } catch { /* The original remains if storage is unavailable. */ }
      state = freshState(questions);
      toast('Sauvegarde illisible : une copie de récupération a été conservée si le stockage le permet.');
    }
    state.preferences.difficulty = 'all';
    if (!state.current && state.queue.length) beginQuestion(state, questions);
    save(); render();
  } catch (error) {
    root.innerHTML = `<main class="loading"><h1>Le carnet n’a pas pu s’ouvrir.</h1><p>${escape(error.message)}</p><p>Vérifiez votre connexion (ou que le serveur local est lancé), puis rechargez cette page.</p><button class="primary" id="reload">Réessayer</button></main>`;
    document.querySelector('#reload').addEventListener('click', () => location.reload());
  }
}
init();

// Offline support once the site is served over HTTPS (GitHub Pages, Vercel…) or localhost.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* The site still works online without it. */ });
}
