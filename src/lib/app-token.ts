import { createSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { GITHUB_API_URL, GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_REPO } from 'astro:env/server';
import { ForumError } from './errors';

/**
 * Jeton du serveur, pour LIRE le forum : tout le monde le lit sans compte, mais GitHub ne
 * répond pas aux appels anonymes de l'API GraphQL. Le serveur se présente donc comme la
 * GitHub App (un JWT signé avec sa clef privée), et demande un « jeton d'installation » :
 * - en lecture seule (Discussions et métadonnées), sur le seul dépôt du forum ;
 * - valable une heure, gardé en mémoire, jamais envoyé au navigateur ni écrit dans un journal.
 * Pour écrire, ce n'est jamais ce jeton qui sert, mais celui de la personne connectée.
 * Doc : https://docs.github.com/fr/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation
 */

const [, repoName] = GITHUB_REPO.split('/');
/** Marge avant l'expiration : un jeton qui expire dans 5 minutes est déjà remplacé. */
const MARGIN_MS = 5 * 60_000;

let cached: { token: string; expiresAt: number } | null = null;
let pending: Promise<string> | null = null;

export const isAppConfigured = () => Boolean(GITHUB_APP_ID && GITHUB_APP_PRIVATE_KEY);

/**
 * Clef privée au format PEM. GITHUB_APP_PRIVATE_KEY peut contenir :
 * - le chemin du fichier .pem (le plus sûr : rien à recopier, aucun souci de guillemets) ;
 * - ou son contenu, avec les retours à la ligne écrits « \n » ou remplacés par des espaces.
 */
function privateKey(): string {
	let raw = (GITHUB_APP_PRIVATE_KEY ?? '').trim().replace(/^["']|["']$/g, '');
	if (!raw.includes('-----BEGIN') && existsSync(raw)) raw = readFileSync(raw, 'utf8');
	raw = raw.replace(/\\n/g, '\n');
	const pem = raw.match(/-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/);
	if (!pem) {
		// Seule la longueur est écrite, jamais le contenu : c'est un secret.
		throw new ForumError(
			503,
			`GITHUB_APP_PRIVATE_KEY illisible (${raw.length} caractères reçus) : mets le chemin du fichier .pem, ou tout son contenu, BEGIN et END compris.`,
		);
	}
	const body = pem[2].replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n');
	return `-----BEGIN ${pem[1]}-----\n${body}\n-----END ${pem[1]}-----\n`;
}

/** JWT de l'App, valable 9 minutes (GitHub refuse plus de 10). */
function appJwt(): string {
	const now = Math.floor(Date.now() / 1000);
	const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
	const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({ iat: now - 60, exp: now + 540, iss: GITHUB_APP_ID })}`;
	try {
		return `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(privateKey(), 'base64url')}`;
	} catch (error) {
		if (error instanceof ForumError) throw error;
		console.error(error);
		throw new ForumError(503, 'GITHUB_APP_PRIVATE_KEY refusée : vérifie que c’est bien la clef privée de la GitHub App.');
	}
}

async function appCall<T>(method: string, path: string, body?: unknown): Promise<T> {
	const response = await fetch(`${GITHUB_API_URL}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${appJwt()}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
		},
		body: body === undefined ? undefined : JSON.stringify(body),
		signal: AbortSignal.timeout(15_000),
	});
	if (!response.ok) {
		console.error(`GitHub ${response.status} sur ${method} ${path} (jeton de l'App)`);
		throw new ForumError(502, "Le forum n'arrive pas à lire GitHub. Un référent doit vérifier la GitHub App.");
	}
	return response.json() as Promise<T>;
}

async function fetchToken(): Promise<string> {
	const installation = await appCall<{ id: number }>('GET', `/repos/${GITHUB_REPO}/installation`);
	const { token, expires_at } = await appCall<{ token: string; expires_at: string }>(
		'POST',
		`/app/installations/${installation.id}/access_tokens`,
		{ repositories: [repoName], permissions: { discussions: 'read', metadata: 'read' } },
	);
	cached = { token, expiresAt: Date.parse(expires_at) };
	return token;
}

/** Jeton de lecture du serveur ; un seul appel à GitHub même si plusieurs pages le demandent ensemble. */
export async function appToken(): Promise<string> {
	if (!isAppConfigured()) {
		throw new ForumError(503, 'Forum indisponible : GITHUB_APP_ID et GITHUB_APP_PRIVATE_KEY ne sont pas définis.');
	}
	if (cached && cached.expiresAt - MARGIN_MS > Date.now()) return cached.token;
	pending ??= fetchToken().finally(() => (pending = null));
	return pending;
}
