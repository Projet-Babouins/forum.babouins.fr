// @ts-check
import { defineConfig, envField, fontProviders } from 'astro/config';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
	site: 'https://forum.babouins.fr',

	// Le forum est vivant : toutes ses pages sont rendues par le serveur Node, à chaque visite.
	output: 'server',
	adapter: node({ mode: 'standalone' }),

	// La doc tourne déjà sur 4321 en développement : le forum prend la porte d'à côté.
	server: { port: 4322 },

	// Session : 8 heures, comme le jeton GitHub qu'elle garde.
	session: { ttl: 60 * 60 * 8 },

	security: {
		// La vérification d'origine est faite dans src/middleware.ts, à partir de `site` : celle d'Astro
		// compare à l'URL vue par Node, qui est fausse derrière le reverse proxy (même choix que la doc).
		checkOrigin: false,
		allowedDomains: [{ hostname: 'forum.babouins.fr', protocol: 'https' }],
	},

	// Police des titres, la même que la vitrine. Astro la télécharge au build et l'héberge avec le site.
	fonts: [
		{
			provider: fontProviders.fontsource(),
			name: 'Bricolage Grotesque',
			cssVariable: '--font-bricolage',
			weights: [800],
			styles: ['normal'],
			subsets: ['latin'],
			fallbacks: ['system-ui', 'sans-serif'],
		},
	],

	// Variables d'environnement, validées au démarrage. Voir .env.example.
	env: {
		schema: {
			// Dépôt dont les GitHub Discussions SONT le forum.
			GITHUB_REPO: envField.string({
				context: 'server',
				access: 'public',
				default: 'Projet-Babouins/forum.babouins.fr',
			}),
			// Dépôt qui fait les membres : qui peut écrire la doc peut écrire sur le forum.
			MEMBERS_REPO: envField.string({
				context: 'server',
				access: 'public',
				default: 'Projet-Babouins/docs.babouins.fr',
			}),
			// Adresse de la doc : son index (/pages.json), ses pages, son éditeur.
			DOCS_URL: envField.string({ context: 'server', access: 'public', default: 'https://docs.babouins.fr' }),
			// Adresses de GitHub. À changer seulement pour des essais contre un faux GitHub.
			GITHUB_URL: envField.string({ context: 'server', access: 'public', default: 'https://github.com' }),
			GITHUB_API_URL: envField.string({ context: 'server', access: 'public', default: 'https://api.github.com' }),
			// La GitHub App de la doc, qui sert aussi au forum (voir .env.example).
			OAUTH_CLIENT_ID: envField.string({ context: 'server', access: 'secret', optional: true }),
			OAUTH_CLIENT_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
			GITHUB_APP_ID: envField.string({ context: 'server', access: 'secret', optional: true }),
			GITHUB_APP_PRIVATE_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
			// Développement uniquement : connecte directement ce login, sans passer par GitHub.
			FORUM_DEV_LOGIN: envField.string({ context: 'server', access: 'secret', optional: true }),
			// Développement uniquement : `github` pour essayer les vraies Discussions au lieu du fichier local.
			FORUM_STORE: envField.enum({
				context: 'server',
				access: 'public',
				values: ['local', 'github'],
				default: 'local',
			}),
		},
	},
});
