import { DOCS_URL } from 'astro:env/server';
import { ForumError, messageOf } from './errors';

/** Adresse publique du forum, pour les liens absolus donnés à la doc. */
export const forumOrigin = (requestUrl: URL) => (import.meta.env.DEV ? requestUrl.origin : new URL(import.meta.env.SITE).origin);

/**
 * Réponse JSON publique, lisible par les pages de la doc (CORS) : la liste des questions d'une
 * page, la recherche commune, le brouillon d'une page. Rien de privé n'y passe : tout ce
 * qu'elle contient est déjà lisible sur le forum sans compte.
 */
export async function publicJson(action: () => Promise<unknown>): Promise<Response> {
	const headers = {
		'Access-Control-Allow-Origin': new URL(DOCS_URL).origin,
		Vary: 'Origin',
		// Quelques secondes de cache suffisent : la doc redemande à chaque page ouverte.
		'Cache-Control': 'public, max-age=30',
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
