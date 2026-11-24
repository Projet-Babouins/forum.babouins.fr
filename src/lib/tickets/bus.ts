import { EventEmitter } from 'node:events';

/**
 * Le « temps réel » de l'entraide : chaque changement est publié ici, et chaque navigateur
 * connecté (endpoint /api/entraide/flux) le reçoit. Le bus vit en mémoire : il suppose UN seul
 * processus Node (c'est le cas sur Pelican). À plusieurs processus, il faudrait un vrai bus.
 */

export type TicketEventType = 'created' | 'taken' | 'released' | 'resolved' | 'reopened' | 'message' | 'published' | 'deleted';

/** Ce qui est envoyé aux navigateurs : de quoi notifier, sans le contenu des messages. */
export interface TicketEvent {
	type: TicketEventType;
	ticketId: number;
	title: string;
	/** Login du demandeur. */
	author: string;
	/** Login de l'aidant, s'il y en a un. */
	helper: string | null;
	/** Qui a fait l'action. */
	by: string;
}

// `globalThis` : en développement, Vite recharge les modules ; le bus, lui, doit rester le même.
const shared = globalThis as typeof globalThis & { __ticketBus?: EventEmitter };
const emitter = (shared.__ticketBus ??= new EventEmitter().setMaxListeners(0));

export const publish = (event: TicketEvent) => void emitter.emit('ticket', event);

/** Écoute les changements ; renvoie la fonction qui arrête l'écoute. */
export function subscribe(listener: (event: TicketEvent) => void): () => void {
	emitter.on('ticket', listener);
	return () => void emitter.off('ticket', listener);
}
