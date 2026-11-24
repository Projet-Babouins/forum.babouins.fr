import { docMarker } from '../docs';
import { ForumError } from '../errors';
import { forum, type Member } from '../store';
import { getMessages, getTicket, rightsOn, setDiscussion } from './index';

/** Tickets en cours de publication : évite deux sujets si on clique deux fois. */
const publishing = new Set<number>();

/** Au plus 65 536 caractères par Discussion GitHub : on garde de la marge pour le repère. */
const MAX_BODY = 60_000;

const quote = (text: string) => text.replace(/^/gm, '> ');

/**
 * Publie un ticket résolu sur le forum : une question à son nom, avec sa description, le résumé
 * du fil et le repère de la page de la doc. Passe par le store du forum, donc par le jeton de la
 * personne (GitHub applique ses droits). Les pseudos sont écrits sans « @ » : pas de notification.
 */
export async function publishToForum(id: number, member: Member): Promise<number> {
	const ticket = getTicket(id);
	if (!ticket) throw new ForumError(404, 'Ticket introuvable.');
	if (!rightsOn(ticket, member.user).publish || publishing.has(id)) {
		throw new ForumError(403, 'Seul le demandeur publie son ticket résolu, une seule fois.');
	}

	const thread = getMessages(id);
	const summary = thread.length
		? `\n\n---\n\n**Ce qui s'est dit en classe**${ticket.helperLogin ? ` (aidant : ${ticket.helperLogin})` : ''}\n\n${thread.map((message) => `**${message.authorLogin}** :\n${quote(message.body)}`).join('\n\n')}`
		: '';
	const body = (ticket.body + summary).slice(0, MAX_BODY) + (ticket.doc ? docMarker(ticket.doc) : '');

	publishing.add(id);
	try {
		const number = await forum().create(member, { kind: 'question', title: ticket.title, body, doc: ticket.doc });
		setDiscussion(id, member.user, number);
		return number;
	} finally {
		publishing.delete(id);
	}
}
