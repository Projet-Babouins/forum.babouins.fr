import type { APIRoute } from 'astro';
import { isValidDocId } from '../../lib/docs';
import { ForumError } from '../../lib/errors';
import { forumOrigin, docsJson } from '../../lib/http';
import { forum, memberOf } from '../../lib/store';

const SHOWN = 5;

/**
 * Les sujets d'une page de la doc, pour le bloc « Questions sur cette page » affiché en bas
 * de chaque page de docs.babouins.fr. Exemple : /api/sujets?doc=sisr/linux/droits-linux
 */
export const GET: APIRoute = ({ url, locals }) =>
	docsJson(async () => {
		const doc = url.searchParams.get('doc') ?? '';
		if (!isValidDocId(doc)) throw new ForumError(400, 'Page de la doc invalide.');
		const origin = forumOrigin(url);
		const topics = (await forum().list(memberOf(locals))).filter((topic) => topic.doc === doc);
		return {
			total: topics.length,
			topics: topics.slice(0, SHOWN).map(({ number, title, kind, answered, replies }) => ({
				number,
				title,
				kind,
				answered,
				replies,
				url: `${origin}/sujet/${number}`,
			})),
			all: `${origin}/?doc=${encodeURIComponent(doc)}`,
			ask: `${origin}/nouveau?doc=${encodeURIComponent(doc)}`,
		};
	});
