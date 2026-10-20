import type { APIRoute } from 'astro';
import { messageOf } from '../../lib/errors';
import { forum } from '../../lib/store';

/** Aperçu d'un message avant de le publier (bouton « Aperçu » des formulaires). Membres seulement. */
export const POST: APIRoute = async ({ request }) => {
	const { markdown } = (await request.json().catch(() => ({}))) as { markdown?: unknown };
	if (typeof markdown !== 'string' || markdown.length > 20_000) {
		return Response.json({ error: 'Message invalide.' }, { status: 400 });
	}
	try {
		return Response.json({ html: markdown.trim() ? await forum().preview(markdown) : '' });
	} catch (error) {
		return Response.json({ error: messageOf(error) }, { status: 502 });
	}
};
