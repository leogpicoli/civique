# Civique

Un site en français pour réviser l’examen civique, sans compte et sans dépendance à installer. Il fonctionne sur ordinateur comme sur téléphone, et hors connexion une fois ouvert.

## Ouvrir le site en local

Avec Node.js 20 ou plus récent :

```powershell
npm start
```

Ouvrez **http://localhost:7777**. Sous Windows, vous pouvez aussi double-cliquer sur `Demarrer.cmd`. Gardez le terminal ouvert pendant les révisions ; `Ctrl+C` arrête le serveur.

Le serveur écoute uniquement sur l’interface locale. Le site ne contacte aucun service externe pour fonctionner.

## Publier le site gratuitement (pour le téléphone)

Le site est entièrement statique : il suffit d’héberger les fichiers du dossier, sans étape de construction. Les chemins sont relatifs, donc il fonctionne aussi dans un sous-dossier (`https://nom.github.io/civique/`).

**GitHub Pages**

1. Créez un dépôt public sur GitHub (par exemple `civique`), sans README.
2. Dans ce dossier :

   ```powershell
   git init
   git add .
   git commit -m "Civique"
   git branch -M main
   git remote add origin https://github.com/VOTRE-NOM/civique.git
   git push -u origin main
   ```

3. Sur GitHub : **Settings → Pages → Build and deployment → Deploy from a branch**, branche `main`, dossier `/ (root)`, puis **Save**.
4. Après une minute, le site est disponible sur `https://VOTRE-NOM.github.io/civique/`.

**Vercel** (alternative) : sur vercel.com, **Add New → Project**, importez le dépôt GitHub, gardez le préréglage **Other**, sans commande de build, puis **Deploy**. `vercel.json` ajoute les mêmes en-têtes de sécurité que le serveur local.

**Sur le téléphone** : ouvrez l’adresse publiée, puis « Ajouter à l’écran d’accueil » (Safari : bouton Partager ; Chrome : menu ⋮). Le carnet s’ouvre alors comme une application et reste utilisable sans réseau (`sw.js` garde une copie ; la version en ligne est reprise dès que le réseau revient).

Chaque mise à jour se publie avec `git add . && git commit -m "..." && git push`.

## Votre entraînement

- Chaque question propose une bonne réponse et trois mauvaises réponses spécifiques. L’ordre des questions et des choix est aléatoire.
- Dès le clic sur une réponse, la bonne réponse et toutes les autres réponses possibles apparaissent, même en cas de réussite.
- À la prochaine tentative de cette question, la bonne réponse suivante est proposée. Après la dernière variante, on revient à la première.
- Une erreur compte dans l’historique, mais **ne valide pas** la question : celle-ci revient en fin de file. Après une bonne réponse, « Je la savais » la retire de la file du tour en cours ; « J’ai répondu au pif » la renvoie en fin de file.
- Quand toutes les questions sont réussies, le tour suivant repart dans un nouvel ordre. Les résultats cumulés, les variantes et les évaluations restent enregistrés.
- « Passer » déplace la question en fin de file sans compter de réponse.
- Les choix **J’ai répondu au pif** et **Je la savais** apparaissent uniquement après une bonne réponse. Choisissez avant de continuer. Aucune évaluation n’est demandée après une erreur.
- « Les questions » propose une recherche, des filtres par thème, dernier résultat et réponse au pif ou connue, ainsi qu’un accès direct à chaque question. Une question réussie précédemment puis ratée redevient « À revoir ».
- « Ma progression » montre les résultats du tour et les compteurs cumulés.
- Raccourcis : **1 à 4** pour répondre immédiatement ; **Entrée** pour continuer après la correction et, si la réponse est juste, le choix de confiance.

## Sauvegardes

Le site sauvegarde automatiquement les résultats, la file, la question affichée, ses choix, les évaluations et les préférences dans le **localStorage** du navigateur, sous la clé `civique.progress.v1`.

La progression est propre à chaque navigateur **et** à chaque adresse : le téléphone, l’ordinateur, `localhost:7777` et l’adresse publiée ont chacun leur propre sauvegarde. Pour continuer sur un autre appareil, exportez la progression puis importez-la sur l’autre. Effacer les données du navigateur ou fermer une session privée peut supprimer le progrès.

Dans **Mes sauvegardes**, exportez un fichier JSON pour garder une copie ou transférer votre progression. L’import vérifie le format et demande confirmation avant de remplacer les données. La même section permet une remise à zéro avec confirmation. Sur mobile, la navigation se trouve en bas de l’écran ; « Mes sauvegardes » s’ouvre avec le bouton « Progression enregistrée » en haut à droite.

## Questions et sources

Un seul JSON était présent dans le dossier initial : `data-gouv-qcm-civique-naturalisation.json`, contenant 258 questions.

- `data/source-original.json` : copie originale conservée avant toute modification.
- `data-gouv-qcm-civique-naturalisation.json` : source dédoublonnée, avec les identifiants d’origine dans `source_ids`.
- `data/questions.json` : banque utilisée par le site, avec réponses alternées, distracteurs et précisions sourcées.
- `data/distractors-*.json` : trois propositions fausses rédigées pour chacune des 258 questions initiales.
- `data/review-*.json` : corrections pédagogiques vérifiées avec des sources de référence, accessibles dans la correction des questions concernées.
- `data/answer-adjustments.json` : reformulations documentées des bonnes réponses (accord avec l’énoncé, variantes en double, faits dépassés comme la JAPD, indices typographiques).
- `data/deduplication-report.json` : détail des fusions et du nettoyage.

Les questions proches qui testent des détails distincts sont conservées. Quatre groupes de doublons de sens sont fusionnés : 3/116, 13/135, 21/99 et 41/72, soit **254 questions uniques**. Les deux questions 53 et 58 restent distinctes : leurs réponses ne sont pas interchangeables.

Les distracteurs sont des idées reçues plausibles ou des confusions avec un fait voisin (région / département, Premier ministre / président, 8 mai / 11 novembre), jamais des réponses absurdes. Ils ont la même forme que la bonne réponse : ponctuation et majuscules sont uniformisées à la reconstruction, pour que la présentation ne trahisse pas la réponse.

Les réponses du fichier fourni sont des suggestions indépendantes de leqcmcivique.fr, sous Licence Ouverte 2.0 ; les mentions d’origine sont conservées. Les distracteurs et les précisions ajoutées servent à l’entraînement. Ce site ne représente pas un examen officiel et ne reproduit pas son barème.

## Vérifier ou reconstruire

```powershell
npm test
npm run prepare-data
```

La reconstruction valide la couverture, les choix et les doublons avant d’écrire les fichiers. Elle repart toujours de `data/source-original.json`, auquel sont appliquées les corrections documentées.
