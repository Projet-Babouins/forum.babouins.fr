import { DOCS_URL } from 'astro:env/server';
import { ForumError, messageOf } from './errors';

/** Adresse publique du forum, pour les liens absolus donnés à la doc. */
export const forumOrigin = (requestUrl: URL) => (import.meta.env.DEV ? requestUrl.origin : new URL(import.meta.env.SITE).origin);

/**
 * Réponse JSON lisible par les pages de la doc (CORS) : la liste des questions d'une page,
 * la recherche commune, le brouillon d'une page. Réservée aux membres (src/middleware.ts) :
 * la doc l'appelle avec le cookie de session du forum (`credentials: 'include'`), que le
 * navigateur envoie car les deux sites sont sur le même domaine, babouins.fr.
 */
export async function docsJson(action: () => Promise<unknown>): Promise<Response> {
	const headers = {
		'Access-Control-Allow-Origin': new URL(DOCS_URL).origin,
		'Access-Control-Allow-Credentials': 'true',
		Vary: 'Origin',
		// Jamais en cache : la réponse change dès qu'on se connecte ou se déconnecte du forum.
		// (Le forum garde déjà la liste des sujets 30 secondes en mémoire, côté serveur.)
		'Cache-Control': 'no-store',
	};
	try {
		return Response.json(await action(), { headers });
	} catch (error) {
		const status = error instanceof ForumError ? error.status : 500;
		return Response.json({ error: messageOf(error) }, { status, headers });
	}
}

/** Numéro de sujet lu dans l'URL ; ForumError 404 s'il est invalide. */
export function topicNumber(raw: string | undefined): number {
	const number = Number(raw);
	if (!Number.isInteger(number) || number <= 0) throw new ForumError(404, 'Sujet introuvable.');
	return number;
}
