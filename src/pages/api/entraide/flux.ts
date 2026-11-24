import type { APIRoute } from 'astro';
import { subscribe } from '../../../lib/tickets';

/**
 * Flux d'événements (Server-Sent Events) de l'entraide : chaque changement de ticket arrive ici
 * dès qu'il a lieu. `?ticket=12` ne garde que ce ticket (page d'un ticket). Membres seulement :
 * le middleware refuse déjà toute requête sans session.
 */
const PING_MS = 25_000;

export const GET: APIRoute = ({ request, url }) => {
	const only = Number(url.searchParams.get('ticket')) || null;
	const encoder = new TextEncoder();
	let stop = () => {};

	const stream = new ReadableStream({
		start(controller) {
			const send = (chunk: string) => {
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					stop(); // le navigateur est parti
				}
			};
			const unsubscribe = subscribe((event) => {
				if (only === null || event.ticketId === only) send(`data: ${JSON.stringify(event)}\n\n`);
			});
			// Un commentaire régulier garde la connexion ouverte à travers le reverse proxy.
			const ping = setInterval(() => send(': ping\n\n'), PING_MS);
			stop = () => {
				clearInterval(ping);
				unsubscribe();
				try {
					controller.close();
				} catch {}
			};
			request.signal.addEventListener('abort', stop);
			send('retry: 3000\n\n');
		},
		cancel: () => stop(),
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			// Demande à nginx de ne pas garder les événements en mémoire tampon.
			'X-Accel-Buffering': 'no',
		},
	});
};
