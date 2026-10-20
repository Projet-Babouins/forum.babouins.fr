import { GITHUB_URL, MEMBERS_REPO, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET } from 'astro:env/server';
import { createGitHub } from './github';

/**
 * Connexion via GitHub (flux « authorization code »), avec la GitHub App de la doc.
 *
 * Le jeton obtenu agit au nom de la personne, mais seulement dans les limites de l'App
 * (contenu, pull requests, discussions) et sur les dépôts où elle est installée. Il reste
 * dans la session, côté serveur, et expire au bout de 8 heures.
 *
 * Le forum est ouvert à tout compte GitHub. Seuls les référents sont à part : une seule source
 * de vérité pour toute la plateforme, le rôle « Maintain » ou « Admin » sur le dépôt de la doc
 * (MEMBERS_REPO).
 * Doc : https://docs.github.com/fr/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app
 */

export const isOAuthConfigured = () => Boolean(OAUTH_CLIENT_ID && OAUTH_CLIENT_SECRET);

/** URL de retour déclarée dans la GitHub App. Derrière le proxy, elle part de `site` (astro.config.mjs). */
export function callbackUrl(requestUrl: URL): string {
	const origin = import.meta.env.DEV ? requestUrl.origin : import.meta.env.SITE;
	return new URL('/connexion/retour', origin).toString();
}

export function buildAuthorizeUrl(state: string, redirectUri: string): string {
	const url = new URL('/login/oauth/authorize', GITHUB_URL);
	url.search = new URLSearchParams({ client_id: OAUTH_CLIENT_ID ?? '', redirect_uri: redirectUri, state }).toString();
	return url.toString();
}

/** Échange le code reçu de GitHub contre l'identité de la personne et son jeton. */
export async function authenticate(code: string, redirectUri: string): Promise<{ user: ForumUser; token: string }> {
	const response = await fetch(new URL('/login/oauth/access_token', GITHUB_URL), {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
		body: JSON.stringify({ client_id: OAUTH_CLIENT_ID, client_secret: OAUTH_CLIENT_SECRET, code, redirect_uri: redirectUri }),
	});
	// GitHub répond 200 même en cas de refus : l'erreur est dans le corps de la réponse.
	const { access_token: token, error } = (await response.json().catch(() => ({}))) as { access_token?: string; error?: string };
	if (!response.ok || !token) throw new Error(`Échange du code OAuth refusé (${error ?? response.status})`);

	const github = createGitHub(token);
	const [profile, repo] = await Promise.all([
		github.get<{ login: string; name: string | null; avatar_url: string }>('/user'),
		github
			.get<{ permissions?: { push?: boolean; maintain?: boolean; admin?: boolean } }>(`/repos/${MEMBERS_REPO}`)
			.catch(() => ({ permissions: undefined })),
	]);
	return {
		token,
		user: {
			login: profile.login,
			name: profile.name || profile.login,
			avatar: profile.avatar_url,
			role: repo.permissions?.maintain || repo.permissions?.admin ? 'referent' : 'membre',
		},
	};
}

/** Adresse de retour après connexion : seulement un chemin de ce site (pas de redirection ailleurs). */
export const safeReturnTo = (path: string | null | undefined) => (path && /^\/(?!\/)/.test(path) && !path.includes('\\') ? path : '/');
