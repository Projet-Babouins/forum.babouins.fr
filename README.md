# 💬 Forum forum.babouins.fr

Bienvenue sur le dépôt de [forum.babouins.fr](https://forum.babouins.fr), le forum du projet **Babouins** : les questions et les échanges des étudiants de BTS SIO, reliés à la doc.

| Où ? | Quoi ? |
| --- | --- |
| [forum.babouins.fr](https://forum.babouins.fr) | Ce dépôt : le forum |
| [docs.babouins.fr](https://docs.babouins.fr) | La documentation (projet séparé) |
| [www.babouins.fr](https://www.babouins.fr) | La vitrine, le concept, le guide de contribution (projet séparé) |
| [GitHub Discussions](https://github.com/Projet-Babouins/forum.babouins.fr/discussions) | Les messages du forum, tels que GitHub les garde |

### 📚 Le principe

Le forum n'a pas de base de données : **ses messages sont les GitHub Discussions de ce dépôt**. Le site n'en est que la vitrine, plus simple à lire, et reliée à la doc. Conséquences :

- le forum est **réservé aux personnes connectées** : on se connecte avec son compte GitHub (n'importe lequel), même pour lire ;
- le forum lit et écrit avec le jeton de la personne connectée : un message part sur GitHub **à son nom**, et le serveur n'a aucun jeton à lui ;
- la modération, l'historique et les sauvegardes sont ceux de GitHub ;
- un message écrit directement sur github.com apparaît aussi sur le forum.

### 🔗 Le lien avec la doc

| Côté forum | Côté doc |
| --- | --- |
| Les thèmes du forum sont les dossiers et les pages de la doc, dans l'ordre de son menu | En bas de chaque page : « Questions sur cette page », et un lien pour en poser une |
| Chaque sujet affiche la page dont il parle, et les sujets du même thème | Le lien « Forum » dans l'en-tête |
| La recherche cherche dans la doc **et** dans le forum | La fenêtre de recherche montre aussi les sujets du forum |
| « Transformer en page de doc » sur un sujet qui a des réponses | L'éditeur `/admin` s'ouvre avec un brouillon tiré de la solution, qui cite le sujet. Il passe ensuite par la relecture à deux, comme toute page |

Comment ça marche :

1. À chaque build, la doc publie son index : [docs.babouins.fr/pages.json](https://docs.babouins.fr/pages.json) (arbre du menu, titre et texte de chaque page). Le forum le relit toutes les 5 minutes.
2. Un sujet est relié à une page ou à un dossier par un repère invisible à la fin de son message : `<!-- babouins:doc=sisr/linux/droits-linux -->`. Un sujet ouvert sur github.com n'en a pas : on prend alors le premier lien vers une page de la doc qu'il contient.
3. La doc interroge le forum depuis le navigateur, sur trois adresses en JSON : `/api/sujets?doc=…`, `/api/recherche?q=…` et `/api/brouillon/<numéro>`. Elle envoie le cookie de session du forum (les deux sites sont sur `babouins.fr`) : un membre connecté au forum voit les questions dans la doc ; sinon, la doc propose de se connecter au forum.

### ✅ Qui peut faire quoi ?

Tout compte GitHub peut se connecter. Les référents viennent d'une seule source de vérité pour toute la plateforme : **le rôle sur le dépôt de la doc**.

| Qui | Sur le forum |
| --- | --- |
| Tout compte GitHub connecté | Lire, poser une question, répondre, choisir la solution de **ses** questions |
| "Maintain" ou "Admin" sur docs.babouins.fr (référent) | En plus : choisir la solution de n'importe quelle question |

Pour que n'importe quel compte puisse se connecter, la GitHub App doit être **publique** (réglages de l'App > Advanced > "Make public"). Privée, elle répond 404 à toute personne extérieure à l'organisation.

Le forum n'applique rien en cachette : c'est GitHub qui vérifie les droits de chaque action, avec le jeton de la personne connectée.

> ⚠️ Règle d'or : **aucune information venant d'une entreprise d'alternance** (adresses IP, noms de domaines internes, identifiants, captures d'écran non anonymisées). Un message reste dans l'historique de GitHub.

## 📦 Déploiement

Comme la doc et la vitrine : un serveur Node.js (panel [Pelican](https://pelican.dev)). Ici, **toutes** les pages sont rendues par le serveur, à chaque visite (le forum est vivant). Après avoir récupéré `main` :

```bash
npm ci
npm run build
npm start
```

| Variable | Rôle |
| --- | --- |
| `HOST` | Mettre `0.0.0.0` pour être joignable depuis l'extérieur |
| `PORT` | Le port attribué par Pelican |
| `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET` | La GitHub App de la doc, pour la connexion (les mêmes valeurs que la doc) |

Le HTTPS et le nom de domaine sont gérés par le reverse proxy. Comme pour la doc, tout ce qui a besoin de la vraie adresse la lit dans `site`, dans `astro.config.mjs`.

### 🔧 Mise en place sur GitHub

À faire une fois, par un administrateur de l'organisation :

1. **Discussions** : sur ce dépôt, Settings > General > Features > cocher "Discussions". Garder les catégories "Q&A" (les questions) et "General" (les discussions). On peut les renommer, pas changer leur format.
2. **GitHub App** : réutiliser celle de la doc (voir `.env.example`) :
   - ajouter la Callback URL `https://forum.babouins.fr/connexion/retour` ;
   - ajouter la permission "Discussions" en lecture et écriture ;
   - ajouter ce dépôt à l'installation de l'App.
3. **Ruleset** sur `main`, comme les autres dépôts : 2 approbations, check `build` obligatoire.
4. **Doc** : `FORUM_URL` y vaut `https://forum.babouins.fr` par défaut, rien à faire.

## 🚀 Lancer le forum en local

Il te faut [Node.js](https://nodejs.org) en version LTS (22.12 ou plus récent).

```bash
npm install
cp .env.example .env
npm run dev
```

Le forum est visible sur `http://localhost:4322`. Par défaut il n'appelle pas GitHub : les sujets sont dans un fichier local, `.forum-local.json`, rempli au premier lancement avec quelques exemples. Dans `.env`, renseigne `FORUM_DEV_LOGIN` avec ton pseudo pour être connecté sans GitHub.

Pour voir les liens avec la doc, lance aussi la doc (`npm run dev` dans `docs.babouins.fr`, avec `FORUM_URL=http://localhost:4322` dans son `.env`) : le forum lit son index sur `http://localhost:4321`. Sans elle, le forum marche, mais sans thèmes.

| Commande | Effet |
| --- | --- |
| `npm install` | Installe les dépendances (à faire une fois, après le clone) |
| `npm run dev` | Lance le forum en local, avec rechargement automatique |
| `npm run check` | Vérifie les types de tout le projet |
| `npm run build` | Construit le forum dans `dist/` (à lancer avant chaque PR) |
| `npm start` | Lance le serveur de production, après un build |

## 🗂️ Structure du projet

Le site est fait avec [Astro](https://astro.build), comme la doc et la vitrine. Les formulaires sont de vrais formulaires HTML : le forum marche sans JavaScript, qui ne sert qu'à l'aperçu des messages et aux suggestions.

```text
.
├── src/
│   ├── middleware.ts            Contrôle d'accès unique : tout exige une session ; écrire, une requête venue du forum
│   ├── pages/
│   │   ├── index.astro          Les sujets, filtrables par thème de la doc, type et état
│   │   ├── sujet/[number].astro Un sujet et ses réponses ; traite aussi « répondre » et « c'est la solution »
│   │   ├── nouveau.astro        Nouveau sujet (avec les sujets et pages qui se ressemblent)
│   │   ├── recherche.astro      Recherche commune doc + forum
│   │   ├── connexion/, deconnexion.ts
│   │   └── api/                 sujets, recherche, brouillon (publics, pour la doc) ; apercu (membres)
│   ├── lib/
│   │   ├── docs.ts              Le lien avec la doc : son index, le repère d'un sujet
│   │   ├── search.ts            La recherche commune
│   │   ├── oauth.ts             Connexion via GitHub, rôle d'après le dépôt de la doc
│   │   ├── github.ts            Petit client de l'API GitHub (REST et GraphQL)
│   │   ├── markdown.ts          Rendu des messages en stockage local (en production, c'est GitHub)
│   │   └── store/               Où vivent les sujets : github.ts (Discussions) ou local.ts (fichier)
│   ├── components/              Header, Footer, liste de sujets, arbre des thèmes, zone de saisie…
│   └── styles/global.css        La palette de la vitrine, plus les éléments du forum
└── astro.config.mjs             Configuration et variables d'environnement
```

### 🔒 Les règles de sécurité du code

- **Le serveur décide, GitHub juge.** Chaque écriture part avec le jeton de la personne connectée : GitHub applique ses droits. Le forum ne fait que cacher les boutons inutiles.
- **Un seul jeton, jamais durable** : celui de la personne connectée (8 heures, dans la session côté serveur), pour lire comme pour écrire. Il n'est jamais envoyé au navigateur ni écrit dans un journal. Le serveur n'a aucun jeton à lui.
- **CSRF** : toute requête POST doit porter l'en-tête `Origin` du forum (`src/middleware.ts`).
- **HTML des messages** : rendu et nettoyé par GitHub (`bodyHTML`), affiché tel quel. En local, `lib/markdown.ts` affiche le HTML comme du texte.
- **Redirections** : après la connexion, on ne revient que sur une adresse du forum (`safeReturnTo`).

## 📄 Licences

- Code : [MIT](LICENSE), copyright Projet Babouins et contributeurs.
- Contenu (messages) : [CC BY-SA 4.0](LICENSE-content).

En participant, vous acceptez que vos messages soient publiés sous CC BY-SA 4.0 : c'est ce qui permet de les reprendre dans la doc.

---

<br>
Créé avec ❤️ en 2026 par la promo BTS SIO 2026-2028, pour le projet lancé en 2024 par Dimitri Chassignol, Jordan Digat et Mathis Norel, au CFAI LDA de Saint-Étienne.
