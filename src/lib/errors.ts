/** Erreur métier, avec le code HTTP à renvoyer (400, 403, 404…). Sans dépendance : importable partout. */
export class ForumError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

/** Message lisible pour une personne, quelle que soit l'erreur. Le détail technique va dans le journal. */
export function messageOf(error: unknown): string {
	if (error instanceof ForumError) return error.message;
	if (error instanceof Error && error.name === 'TimeoutError') return 'GitHub ne répond pas. Réessaie dans un instant.';
	console.error(error);
	return 'Une erreur est survenue. Réessaie dans un instant.';
}
