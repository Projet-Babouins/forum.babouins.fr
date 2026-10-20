import type { APIRoute } from 'astro';
import { docsIndex, withoutMarker } from '../../../lib/docs';
import { ForumError } from '../../../lib/errors';
import { forumOrigin, docsJson, topicNumber } from '../../../lib/http';
import { forum, memberOf, type Reply } from '../../../lib/store';

/**
 * Brouillon de page de doc tiré d'un sujet : le bouton « Transformer en page de doc » ouvre
 * l'éditeur de la doc (docs.babouins.fr/admin?depuis-forum=12), qui lit ce brouillon ici.
 *
 * Le brouillon n'est qu'un point de départ : il passe ensuite par l'éditeur, puis par la
 * relecture à deux, comme n'importe quelle page. Il contient la solution choisie, sinon
 * toutes les réponses, et cite toujours le sujet d'origine et ses auteurs.
 */
export const GET: APIRoute = ({ params, url, locals }) =>
	docsJson(async () => {
		const topic = await forum().get(memberOf(locals), topicNumber(params.number));
		if (!topic) throw new ForumError(404, 'Sujet introuvable.');

		const visible = topic.comments.filter((reply) => !reply.hidden && reply.body.trim());
		const answer = visible.find((reply) => reply.isAnswer);
		const kept: Reply[] = answer ? [answer] : visible;
		if (kept.length === 0) throw new ForumError(409, "Ce sujet n'a pas encore de réponse à reprendre.");

		const thanks = [...new Set(kept.map((reply) => reply.author?.login).filter(Boolean))].map((login) => `@${login}`);
		const source = `> Issu du forum : [${topic.title}](${forumOrigin(url)}/sujet/${topic.number})${
			thanks.length ? `, avec les réponses de ${new Intl.ListFormat('fr').format(thanks)}` : ''
		}.`;
		const content = kept.map((reply) => withoutMarker(reply.body).trim()).join('\n\n');

		const index = await docsIndex();
		const doc = topic.doc && (index.pages.has(topic.doc) ? 'page' : index.folders.has(topic.doc) ? 'folder' : null);
		return {
			title: topic.title,
			/** Page ou dossier de la doc dont parle le sujet. */
			doc: doc ? { id: topic.doc, kind: doc } : null,
			/** Pour une nouvelle page : le texte, sans titre (le titre est un champ à part). */
			body: `${content}\n\n${source}\n`,
			/** Pour compléter une page existante : une section, avec son titre. */
			section: `## ${topic.title}\n\n${content}\n\n${source}\n`,
		};
	});
