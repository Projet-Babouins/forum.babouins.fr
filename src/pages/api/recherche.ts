import type { APIRoute } from 'astro';
import { docPageUrl, docsIndex } from '../../lib/docs';
import { forumOrigin, publicJson } from '../../lib/http';
import { search } from '../../lib/search';
import { forum } from '../../lib/store';

/**
 * Recherche commune, en JSON : utilisée par la fenêtre de recherche de la doc (qui y ajoute
 * les sujets du forum) et par le formulaire « Nouveau sujet » (sujets qui se ressemblent).
 * Exemple : /api/recherche?q=chmod
 */
export const GET: APIRoute = ({ url }) =>
	publicJson(async () => {
		const query = (url.searchParams.get('q') ?? '').slice(0, 200);
		const limit = Math.min(Number(url.searchParams.get('n')) || 8, 20);
		const [index, topics] = await Promise.all([docsIndex(), forum().list()]);
		const results = search(query, index, topics, limit);
		const origin = forumOrigin(url);
		return {
			docs: results.docs.map(({ id, title, excerpt }) => ({ id, title, excerpt, url: docPageUrl(id) })),
			topics: results.topics.map(({ number, title, kind, answered, excerpt }) => ({
				number,
				title,
				kind,
				answered,
				excerpt,
				url: `${origin}/sujet/${number}`,
			})),
			more: `${origin}/recherche?q=${encodeURIComponent(query)}`,
		};
	});
