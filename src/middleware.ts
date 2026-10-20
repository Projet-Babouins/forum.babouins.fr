import { defineMiddleware } from 'astro:middleware';
import { DOCS_URL } from 'astro:env/server';
import { safeReturnTo } from './lib/oauth';

/** Méthodes qui ne modifient rien : pas besoin de vérifier d'où vient la requête. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Seules routes accessibles sans session : la connexion elle-même. */
const PUBLIC_ROUTES = new Set(['/connexion', '/connexion/retour']);

/** Adresse publique du site (voir callbackUrl dans lib/oauth.ts : même raison). */
const siteOrigin = (requestUrl: URL) => (import.meta.env.DEV ? requestUrl.origin : new URL(import.meta.env.SITE).origin);

/**
 * Point de contrôle unique du forum. Il est réservé aux membres : sans session, toute page
 * renvoie vers la connexion GitHub, et l'API répond 401 (la doc affiche alors « Connecte-toi »).
 * Le forum lit et écrit avec le jeton de la personne connectée : pas de jeton propre au serveur.
 */
export const onRequest = defineMiddleware(async (context, next) => {
	// Protection CSRF : une requête qui modifie quelque chose doit venir d'une page du forum.
	// Les navigateurs envoient l'en-tête `Origin` sur tout POST, formulaires compris.
	if (!SAFE_METHODS.has(context.request.method) && context.request.headers.get('origin') !== siteOrigin(context.url)) {
		return Response.json({ error: 'Requête refusée : elle ne vient pas du forum.' }, { status: 403 });
	}

	const pathname = context.url.pathname.replace(/\/$/, '') || '/';
	if (PUBLIC_ROUTES.has(pathname)) return next();

	const user = await context.session?.get('user');
	if (!user) {
		if (pathname.startsWith('/api/')) {
			// En-têtes CORS : la doc doit pouvoir lire ce 401 pour proposer de se connecter.
			return Response.json(
				{ error: 'Connexion requise.', login: `${siteOrigin(context.url)}/connexion` },
				{ status: 401, headers: { 'Access-Control-Allow-Origin': new URL(DOCS_URL).origin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' } },
			);
		}
		context.session?.set('returnTo', safeReturnTo(context.url.pathname + context.url.search));
		return context.redirect('/connexion', 303);
	}

	context.locals.user = user;
	// Le jeton ne quitte jamais le serveur : de la session aux pages, jamais vers le navigateur.
	context.locals.githubToken = await context.session?.get('githubToken');
	return next();
});
