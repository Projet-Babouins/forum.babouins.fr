import { GITHUB_API_URL } from 'astro:env/server';
import { ForumError } from './errors';

/**
 * Petit client de l'API GitHub, toujours avec le jeton de la personne connectée : GitHub
 * applique SES droits, et chaque sujet ou réponse est publié à son nom.
 * Doc : https://docs.github.com/fr/graphql/guides/using-the-graphql-api-for-discussions
 */

const TIMEOUT_MS = 15_000;

export type GitHub = ReturnType<typeof createGitHub>;

export function createGitHub(token: string) {
	async function call<T>(method: string, path: string, body?: unknown, accept = 'application/vnd.github+json'): Promise<T> {
		const response = await fetch(`${GITHUB_API_URL}${path}`, {
			method,
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: accept,
				'Content-Type': 'application/json',
				'X-GitHub-Api-Version': '2022-11-28',
			},
			body: body === undefined ? undefined : JSON.stringify(body),
			// GitHub injoignable : on échoue vite, sinon toutes les pages attendraient derrière.
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});

		if (response.status === 401) throw new ForumError(401, 'Ta session GitHub a expiré. Reconnecte-toi.');
		if (!response.ok) {
			const detail = (await response.json().catch(() => null)) as { message?: string } | null;
			// Le jeton n'apparaît jamais dans ce journal : seulement la route et la réponse de GitHub.
			console.error(`GitHub ${response.status} sur ${method} ${path} : ${detail?.message ?? ''}`);
			throw new ForumError(response.status === 404 ? 404 : 502, `GitHub a refusé l'action : ${detail?.message ?? response.status}.`);
		}
		return (accept === 'text/html' ? response.text() : response.json()) as Promise<T>;
	}

	return {
		get: <T>(path: string) => call<T>('GET', path),
		post: <T>(path: string, body: unknown) => call<T>('POST', path, body),
		/** Markdown rendu par GitHub, exactement comme sur github.com (et nettoyé de la même façon). */
		markdown: (text: string, context: string) => call<string>('POST', '/markdown', { text, mode: 'gfm', context }, 'text/html'),
		/** API GraphQL : les Discussions n'existent que là. */
		async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
			const result = await call<{ data?: T; errors?: { message: string }[] }>('POST', '/graphql', { query, variables });
			if (result.errors?.length) {
				console.error(`GitHub GraphQL : ${result.errors[0].message}`);
				throw new ForumError(422, `GitHub a refusé l'action : ${result.errors[0].message}`);
			}
			return result.data as T;
		},
	};
}
