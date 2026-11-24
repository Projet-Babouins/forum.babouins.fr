import { ForumError } from '../errors';
import { database } from './db';
import { publish, type TicketEventType } from './bus';

export * from './bus';

/**
 * L'entraide en classe : un ticket = une demande d'aide, avec son fil de messages.
 * Cycle : Ouvert → Pris (un aidant) → Résolu. Toutes les règles sont ici, côté serveur :
 * les pages ne font que cacher les boutons inutiles (voir `rightsOn`).
 */

export type TicketStatus = 'open' | 'taken' | 'resolved';

export const STATUS_LABEL: Record<TicketStatus, string> = { open: 'Ouvert', taken: 'Pris', resolved: 'Résolu' };

/** Classe du badge (global.css) de chaque état. */
export const STATUS_BADGE: Record<TicketStatus, string> = { open: 'open', taken: 'taken', resolved: 'solved' };

export interface Ticket {
	id: number;
	title: string;
	/** Markdown. */
	body: string;
	/** Page ou dossier de la doc (voir lib/docs.ts). */
	doc: string | null;
	authorLogin: string;
	authorAvatar: string;
	helperLogin: string | null;
	status: TicketStatus;
	createdAt: string;
	updatedAt: string;
	resolvedAt: string | null;
	/** Numéro du sujet du forum, une fois le ticket publié. */
	discussionNumber: number | null;
	messageCount: number;
}

export interface TicketMessage {
	id: number;
	ticketId: number;
	authorLogin: string;
	authorAvatar: string;
	body: string;
	createdAt: string;
}

type Row = Record<string, string | number | null>;

const toTicket = (row: Row): Ticket => ({
	id: row.id as number,
	title: row.title as string,
	body: row.body as string,
	doc: row.doc as string | null,
	authorLogin: row.author_login as string,
	authorAvatar: row.author_avatar as string,
	helperLogin: row.helper_login as string | null,
	status: row.status as TicketStatus,
	createdAt: row.created_at as string,
	updatedAt: row.updated_at as string,
	resolvedAt: row.resolved_at as string | null,
	discussionNumber: row.discussion_number as number | null,
	messageCount: row.message_count as number,
});

const toMessage = (row: Row): TicketMessage => ({
	id: row.id as number,
	ticketId: row.ticket_id as number,
	authorLogin: row.author_login as string,
	authorAvatar: row.author_avatar as string,
	body: row.body as string,
	createdAt: row.created_at as string,
});

const SELECT = 'SELECT t.*, (SELECT COUNT(*) FROM messages m WHERE m.ticket_id = t.id) AS message_count FROM tickets t';

// --- Lecture ---------------------------------------------------------------------------

/** Tous les tickets, les plus récents d'abord. */
export const listTickets = (): Ticket[] => (database().prepare(`${SELECT} ORDER BY t.created_at DESC, t.id DESC`).all() as Row[]).map(toTicket);

export function getTicket(id: number): Ticket | null {
	const row = database().prepare(`${SELECT} WHERE t.id = ?`).get(id) as Row | undefined;
	return row ? toTicket(row) : null;
}

export const getMessages = (ticketId: number): TicketMessage[] =>
	(database().prepare('SELECT * FROM messages WHERE ticket_id = ? ORDER BY id').all(ticketId) as Row[]).map(toMessage);

// --- Droits ----------------------------------------------------------------------------

export type TicketAction = 'take' | 'release' | 'resolve' | 'reopen';

/** Ce que `user` peut faire sur ce ticket. Seule source de vérité : les actions la vérifient aussi. */
export function rightsOn(ticket: Ticket, user: ForumUser) {
	const mine = ticket.authorLogin === user.login;
	const referent = user.role === 'referent';
	return {
		take: ticket.status === 'open' && !mine,
		release: ticket.status === 'taken' && (ticket.helperLogin === user.login || referent),
		resolve: ticket.status !== 'resolved' && (mine || referent),
		reopen: ticket.status === 'resolved' && mine,
		publish: ticket.status === 'resolved' && mine && ticket.discussionNumber === null,
		remove: referent,
	};
}

// --- Écriture --------------------------------------------------------------------------

const need = (id: number): Ticket => getTicket(id) ?? fail(404, 'Ticket introuvable.');

function fail(status: number, message: string): never {
	throw new ForumError(status, message);
}

/** Prévient les navigateurs connectés. */
function announce(type: TicketEventType, ticket: Ticket, by: ForumUser) {
	publish({ type, ticketId: ticket.id, title: ticket.title, author: ticket.authorLogin, helper: ticket.helperLogin, by: by.login });
}

export function createTicket(user: ForumUser, { title, body, doc }: { title: string; body: string; doc: string | null }): number {
	if (title.length < 8) fail(400, 'Donne un titre un peu plus précis (8 caractères au moins).');
	if (title.length > 200) fail(400, 'Le titre est trop long (200 caractères au plus).');
	if (body.length < 10) fail(400, 'Explique un peu plus ton problème (10 caractères au moins).');
	if (body.length > 20_000) fail(400, 'Le message est trop long (20 000 caractères au plus).');
	const now = new Date().toISOString();
	const { lastInsertRowid } = database()
		.prepare('INSERT INTO tickets (title, body, doc, author_login, author_avatar, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
		.run(title, body, doc, user.login, user.avatar, now, now);
	const ticket = need(Number(lastInsertRowid));
	announce('created', ticket, user);
	return ticket.id;
}

const CHANGES: Record<TicketAction, { type: TicketEventType; set: string; refusal: string }> = {
	take: { type: 'taken', set: "status = 'taken', helper_login = ?", refusal: "Ce ticket n'est plus disponible, ou c'est le tien." },
	release: { type: 'released', set: "status = 'open', helper_login = NULL", refusal: "Seul l'aidant (ou un référent) peut libérer ce ticket." },
	resolve: { type: 'resolved', set: "status = 'resolved', resolved_at = ?", refusal: 'Seul le demandeur (ou un référent) résout un ticket.' },
	reopen: { type: 'reopened', set: "status = 'open', helper_login = NULL, resolved_at = NULL", refusal: 'Seul le demandeur rouvre son ticket.' },
};

export const isAction = (value: string): value is TicketAction => value in CHANGES;

/** Prendre, libérer, résoudre ou rouvrir un ticket. */
export function changeTicket(id: number, user: ForumUser, action: TicketAction): void {
	const ticket = need(id);
	const change = CHANGES[action];
	if (!rightsOn(ticket, user)[action]) fail(403, change.refusal);
	const now = new Date().toISOString();
	const args = action === 'take' ? [user.login] : action === 'resolve' ? [now] : [];
	database().prepare(`UPDATE tickets SET ${change.set}, updated_at = ? WHERE id = ?`).run(...args, now, id);
	announce(change.type, need(id), user);
}

export function addMessage(id: number, user: ForumUser, body: string): void {
	const ticket = need(id);
	if (body.length < 2) fail(400, 'Ton message est vide.');
	if (body.length > 20_000) fail(400, 'Ton message est trop long (20 000 caractères au plus).');
	const now = new Date().toISOString();
	const db = database();
	db.prepare('INSERT INTO messages (ticket_id, author_login, author_avatar, body, created_at) VALUES (?, ?, ?, ?, ?)').run(id, user.login, user.avatar, body, now);
	db.prepare('UPDATE tickets SET updated_at = ? WHERE id = ?').run(now, id);
	announce('message', ticket, user);
}

export function deleteTicket(id: number, user: ForumUser): void {
	const ticket = need(id);
	if (!rightsOn(ticket, user).remove) fail(403, 'Seul un référent supprime un ticket.');
	database().prepare('DELETE FROM tickets WHERE id = ?').run(id);
	announce('deleted', ticket, user);
}

/** Garde le numéro du sujet du forum créé à partir du ticket. */
export function setDiscussion(id: number, user: ForumUser, number: number): void {
	database().prepare('UPDATE tickets SET discussion_number = ? WHERE id = ?').run(number, id);
	announce('published', need(id), user);
}
