# Consignes de développement — ComptaInf

## Portée

Ces consignes s’appliquent à tout le dépôt. Les instructions explicites de
l’utilisateur priment. Limiter les modifications au besoin demandé et conserver
les changements existants. Ne pas créer de commit, pousser ou publier sans
demande explicite.

## Mise à jour de la documentation

À chaque modification importante de l’architecture, vérifier si ce document et
[architecture.md](./architecture.md) doivent être actualisés. Les mettre à jour
si nécessaire dans le cadre du même changement.

Décrire uniquement le fonctionnement vérifié dans le code. Distinguer les règles
de développement, l’implémentation actuelle et ses limites ; ne pas présenter une
intention ou une évolution envisagée comme une fonctionnalité existante.

## Architecture

ComptaInf est une application de comptabilité avec justificatifs, reposant sur
Node.js, Express, Google Sheets et Google Drive.

- `server.js` : point d’entrée principal, sessions, authentification, API,
  imports, exports et nettoyage des fichiers temporaires.
- `public-assets.js` : liste explicite des ressources publiques du navigateur.
- `index.html` : structure principale et modales.
- `share.html` : interface d’import de documents partagés.
- `views/` : fragments HTML chargés dynamiquement par la navigation.
- `css/design_v1.css` : feuille de style utilisée par l’interface principale.
  `design_v0.css` reste présent ; éviter de le modifier sans besoin identifié.
- `js/navigation.js` : navigation, chargement des vues et traitement Drive.
- `js/dashboard.js` : tableau de bord, indicateurs et traitements périodiques.
- `js/depense.js` : interface de saisie et d’import des dépenses.
- `js/operations.js`, `stats.js`, `mileage.js`,
  `professional-expenses.js` : fonctionnalités des vues correspondantes.
- `js/sheets.js` : accès aux feuilles Google et écriture des opérations.
- `js/annual-report.js` : calcul des synthèses annuelles et génération du PDF.
- `js/drive.js` : dossiers, justificatifs, téléchargements et archivage Drive.
- `js/oauth.js` : client OAuth Google.
- `js/config.js` : configuration locale, utilisateurs, environnement et exercice.
- `js/ocr.js` : extraction PDF, OCR, détection et règles d’analyse.
- `js/ceesv.js` : traitements CEESV et rapprochements avec UBS.
- `js/importDocument.js` : envoi d’un justificatif vers Drive.
- `js/import/` : orchestration du workflow d’import.
- `utils/utils.js` : fonctions partagées, notamment dates et fournisseurs.
- `tests/` : tests exécutés avec le moteur de test natif de Node.js.
- `upload-server.js` : serveur auxiliaire distinct ; ne pas le confondre avec
  l’application principale.

Le dossier `js/` contient à la fois du code serveur et du code navigateur.
Ne jamais le publier intégralement.

## Conventions existantes

- JavaScript sans TypeScript ni chaîne de compilation frontend.
- Modules serveur en CommonJS : `require` et `module.exports`.
- Scripts navigateur classiques avec fonctions globales et événements HTML.
  Préserver les noms appelés depuis les attributs `onclick`.
- Conserver l’ordre des scripts de `index.html` et leurs dépendances.
- Indentation généralement de quatre espaces et points-virgules.
  Respecter le style local sans reformater les fichiers entiers.
- Interface et messages destinés à l’utilisateur en français.
- Préserver l’encodage des accents et éviter les changements massifs de fins
  de ligne.
- Réutiliser les fonctions métier existantes avant d’en créer de nouvelles.
- Ne pas introduire de framework, dépendance ou réorganisation globale pour
  une modification locale.
- Échapper les valeurs provenant des documents ou de Google Sheets avant de
  les insérer dans du HTML.

## Configuration et données

La configuration privée est chargée depuis `DATA_DIR`, ou depuis `data/`
à la racine quand cette variable n’est pas définie.

Ce dossier contient notamment les paramètres, utilisateurs, identifiants Google,
jetons OAuth et fichiers temporaires. Utiliser les modèles du dépôt pour
comprendre la structure sans divulguer les valeurs privées.

- Google Sheets utilise un compte de service.
- Google Drive utilise les jetons OAuth associés à l’adresse de l’utilisateur.
- Transmettre explicitement l’adresse de l’utilisateur aux fonctions métier.
- Résoudre l’environnement et les identifiants Google via `js/config.js`.
- Les environnements DEV et PROD sélectionnent leurs ressources configurées.
  Ne jamais supposer que les appels DEV sont sans effet.
- L’exercice utilisateur et l’exercice des paramètres Sheets sont deux sources
  présentes dans le code : vérifier leur cohérence avant une modification.
- Les ressources Sheets sont sélectionnées par environnement ; ne pas supposer
  qu’une feuille distincte existe pour chaque utilisateur.
- Ne pas afficher, copier dans des tests ou versionner les secrets.
- Ne pas modifier les données privées ou les ressources Google réelles pour
  effectuer une vérification automatique.

## Workflow d’import

Le workflow principal suit ces étapes :

1. Réception du document : import manuel, dépôt ou partage.
2. Normalisation : nom, type et format.
3. Analyse : extraction PDF, OCR ou analyse CSV.
4. Recherche des doublons.
5. Prévisualisation et décision utilisateur.
6. Exécution : justificatif Drive puis écritures Sheets.

Modules correspondants :
`workflowContext.js`, `normalizeStep.js`, `analyseStep.js`,
`duplicateStep.js`, `previewStep.js`, `executionStep.js` et
`importWorkflow.js`.

Règles à préserver :

- Ne pas sauvegarder dans Drive ou Sheets pendant la préparation.
- Les décisions sont `insert`, `replace` ou `cancel`.
- Vérifier le propriétaire du workflow avant toute décision.
- Une seconde décision ne doit pas modifier un import déjà en cours.
- Ne déclarer un succès qu’après la fin effective de l’enregistrement.
- Après une erreur, permettre une reprise cohérente et réutiliser le justificatif
  déjà envoyé lorsque son résultat est disponible.
- Vérifier l’année du document par rapport à l’exercice actif.
- Les workflows en attente sont stockés dans une Map en mémoire : ils ne
  survivent pas au redémarrage du serveur.
- D’anciennes routes d’import et de sauvegarde coexistent avec le workflow :
  vérifier les autres chemins qui utilisent la même logique avant une correction.

Drive et Sheets ne partagent pas de transaction. Une erreur réseau peut laisser
un résultat partiel ou incertain. Ne pas promettre une garantie d’import unique
sans mécanisme d’idempotence adapté.

## Écritures Google Sheets

La feuille `DEPENSES` utilise actuellement les colonnes suivantes :

| Colonne | Contenu |
| --- | --- |
| A | Date |
| B | Fournisseur |
| C | Catégorie |
| D | Compte |
| E | Montant signé |
| F | Justificatif principal |
| G | Type d’opération |
| H | Commentaire |
| I | Justificatif bancaire |
| J | Emplacement conservé vide par les ajouts actuels |
| K | Date d’import |
| L–M | Emplacements conservés vides par les ajouts actuels |
| N | Litres |

Ne pas réordonner les colonnes ni réutiliser un emplacement sans vérifier les
lectures, mises à jour, exports et données existantes.

- Les données lues incluent la ligne d’en-tête à l’index 0.
  Une ligne physique Sheets correspond donc à `index + 1`.
- `RECETTE` produit un montant positif ; les dépenses produisent un montant négatif.
- Préserver les centimes et gérer explicitement les séparateurs décimaux.
- Utiliser `values.append` pour les ajouts ; ne pas calculer la prochaine ligne
  avec une lecture suivie d’une écriture.
- Utiliser `replaceDepenses` pour regrouper ajout et suppression des anciennes
  lignes dans une requête atomique Sheets.
- Dédupliquer les lignes à supprimer et les traiter dans l’ordre décroissant.
  Ne jamais supprimer la ligne d’en-tête.
- Une atomicité de requête ne protège pas contre des numéros de ligne devenus
  obsolètes après une autre modification : vérifier les correspondances.
- Avec `appendCells`, écrire les dates comme des valeurs numériques Sheets avec
  un format DATE explicite. Une `stringValue` peut produire une date texte avec
  une apostrophe.
- Réutiliser la normalisation des dates et refuser les dates impossibles.
- Préserver les liens bancaires et les colonnes non concernées par une édition.

## CEESV, UBS et traitements périodiques

Un état CEESV peut produire deux recettes distinctes :
`CEESV - Facture` et `CEESV - Etat`.

- Conserver les montants facture, état et banque séparément.
- Préserver les justificatifs lors des rapprochements UBS.
- Regrouper la création des deux écritures CEESV et la suppression des anciennes
  lignes dans une même opération atomique quand elles font partie du même traitement.
- Tester les imports dans les deux ordres : UBS avant CEESV et CEESV avant UBS.

Les fréquences fournisseurs proviennent de `FOURNISSEURS!A:C`.
Les valeurs prises en charge sont `mensuel`, `trimestriel`, `semestriel`
et `annuel`.

- Relire les fréquences et opérations à chaque rafraîchissement.
- Conserver l’absence de cache sur l’API des traitements périodiques.
- Actualiser aussi les données à l’ouverture de la modale.
- Préserver le calcul actuel par périodes commencées de l’année civile courante ;
  toute autre règle d’échéance nécessite une demande métier explicite.
- Conserver le défilement vertical du contenu de la modale. Attention aux règles
  génériques `.modal-body` qui peuvent écraser une règle plus spécifique.

## Export PDF annuel

- L’export `GET /api/export-pdf` est authentifié et utilise `Exercice` des
  paramètres Sheets de l’utilisateur.
- Le module `js/annual-report.js` génère le document avec `pdf-lib`, déjà présent
  dans les dépendances. Ce module serveur ne doit pas être publié au navigateur.
- Filtrer les opérations par année, calculer les totaux en centimes et signaler
  les lignes exclues pour date ou montant invalide.
- Les montants signés déterminent les recettes et dépenses, comme sur le tableau
  de bord. Les synthèses mensuelles et par compte/catégorie doivent se réconcilier.
- Le document est une synthèse des écritures, pas un bilan des actifs et passifs.
- Préserver la pagination et gérer les caractères incompatibles avec les polices
  PDF standard pour qu’un libellé OCR n’empêche pas la génération.

## Sécurité et fichiers temporaires

- Ne jamais réintroduire `express.static(__dirname)`.
- Ajouter les ressources navigateur dans la liste de `public-assets.js`.
- Garder privés les configurations, sources serveur, archives et téléversements.
- Installer le middleware de session avant toute route qui l’utilise.
- Protéger les nouvelles routes métier côté serveur ; masquer un bouton dans
  l’interface ne constitue pas une autorisation.
- Les options de contournement de connexion restent désactivées par défaut.
- Ne pas utiliser l’en-tête Host pour reconnaître un client local.
- Valider les chemins et noms issus des téléversements.
- Ne pas supprimer un fichier temporaire encore nécessaire à une reprise.
  Le transfert Drive et le nettoyage serveur peuvent supprimer des fichiers.
- Les sessions, clients OAuth partagés et workflows en mémoire méritent une
  attention particulière en cas de concurrence ou de plusieurs utilisateurs.

## Vérifications

Le dépôt ne définit actuellement pas de scripts npm de test, build ou lint.
Ne pas inventer de commande `npm test`.

Commandes utiles depuis la racine :

```powershell
node --test tests/*.test.js
node --check server.js
node --check js/sheets.js
git diff --check
```

Adapter `node --check` aux fichiers JavaScript modifiés.

- Ajouter des tests ciblés pour les corrections métier, la concurrence et les
  échecs d’import.
- Les tests actuels utilisent notamment des simulations Google et des serveurs
  HTTP locaux : leur réussite ne valide pas les accès Google réels.
- Pour une modification visuelle, vérifier la vue concernée et les petits écrans.
- Ne pas lancer automatiquement `node server.js` pour une vérification anodine :
  le démarrage nettoie les téléversements et tente d’ouvrir Chrome.
- Le lancement Windows utilise une distribution portable Node 24.16.0.
  L’OCR dépend aussi de composants natifs ; sous Linux, le code utilise
  notamment `pdftocairo`.
- Avant de terminer, vérifier le diff et indiquer les changements, les contrôles
  effectués et les limites restantes.
