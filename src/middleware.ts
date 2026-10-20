import { defineMiddleware } from 'astro:middleware';
import { safeReturnTo } from './lib/oauth';

/** Méthodes qui ne modifient rien : pas besoin de vérifier d'où vient la requête. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Pages réservées aux membres, même pour les lire. */
const MEMBERS_ONLY = new Set(['/nouveau']);

/** Adresse publique du site (voir callbackUrl dans lib/oauth.ts : même raison). */
const siteOrigin = (requestUrl: URL) => (import.meta.env.DEV ? requestUrl.origin : new URL(import.meta.env.SITE).origin);

/**
 * Point de contrôle unique du forum :
 * - tout le monde lit ;
 * - écrire (toute requête POST) exige d'être connecté, et de venir d'une page du forum.
 */
export const onRequest = defineMiddleware(async (context, next) => {
	const writing = !SAFE_METHODS.has(context.request.method);

	// Protection CSRF : une requête qui modifie quelque chose doit venir d'une page du forum.
	// Les navigateurs envoient l'en-tête `Origin` sur tout POST, formulaires compris.
	if (writing && context.request.headers.get('origin') !== siteOrigin(context.url)) {
		return Response.json({ error: 'Requête refusée : elle ne vient pas du forum.' }, { status: 403 });
	}

	const user = await context.session?.get('user');
	if (user) {
		context.locals.user = user;
		// Le jeton ne quitte jamais le serveur : de la session aux pages, jamais vers le navigateur.
		context.locals.githubToken = await context.session?.get('githubToken');
	}

	const pathname = context.url.pathname.replace(/\/$/, '') || '/';
	if (!user && (writing || MEMBERS_ONLY.has(pathname))) {
		if (pathname.startsWith('/api/')) return Response.json({ error: 'Connexion requise.' }, { status: 401 });
		context.session?.set('returnTo', safeReturnTo(context.url.pathname + context.url.search));
		return context.redirect('/connexion', 303);
	}

	return next();
});
