import type { APIRoute } from 'astro';
import { FORUM_DEV_LOGIN } from 'astro:env/server';
import { buildAuthorizeUrl, callbackUrl, isOAuthConfigured, safeReturnTo } from '../../lib/oauth';
import { isLocalMode } from '../../lib/store';

/** Démarre la connexion : redirige vers GitHub, qui renverra sur /connexion/retour. */
export const GET: APIRoute = async ({ session, redirect, url }) => {
	// Lien « Se connecter » d'une page : on y reviendra après la connexion.
	const from = url.searchParams.get('retour');
	if (from) session?.set('returnTo', safeReturnTo(from));

	// Raccourci de développement, en stockage local seulement (il ne donne pas de jeton GitHub).
	// `isLocalMode()` vaut toujours `false` dans un build de production : ce bloc n'y sert jamais.
	if (isLocalMode() && FORUM_DEV_LOGIN) {
		// `?dev=pseudo` : se connecter sous un autre pseudo (simple membre) pour essayer les droits à plusieurs.
		// Un navigateur partage ses cookies par adresse : ouvrir `localhost` et `127.0.0.1` donne deux sessions.
		const other = url.searchParams.get('dev');
		const login = other && /^[\w-]{1,39}$/.test(other) ? other : FORUM_DEV_LOGIN;
		session?.set('user', { login, name: login, avatar: '', role: login === FORUM_DEV_LOGIN ? 'referent' : 'membre' });
		const returnTo = await session?.get('returnTo');
		session?.delete('returnTo');
		return redirect(safeReturnTo(returnTo));
	}

	if (!isOAuthConfigured()) {
		return new Response('Connexion indisponible : OAUTH_CLIENT_ID et OAUTH_CLIENT_SECRET ne sont pas définis.', { status: 503 });
	}

	const state = crypto.randomUUID();
	session?.set('oauthState', state);
	return redirect(buildAuthorizeUrl(state, callbackUrl(url)));
};
