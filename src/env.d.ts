/**
 * Rôle sur le forum, déduit du rôle sur le dépôt de la doc (MEMBERS_REPO) :
 * - `membre`   : tout compte GitHub connecté. Lit et écrit sur le forum.
 * - `referent` : rôle « Maintain » ou « Admin » sur la doc. Peut aussi choisir la solution d'une question.
 */
type MemberRole = 'membre' | 'referent';

/** Personne connectée (identité fournie par GitHub). */
interface ForumUser {
	login: string;
	name: string;
	avatar: string;
	role: MemberRole;
}

declare namespace App {
	/** Données stockées côté serveur dans la session. Rien de tout cela n'est envoyé au navigateur. */
	interface SessionData {
		user: ForumUser;
		/** Jeton GitHub de la personne (voir lib/oauth.ts). Absent en stockage local. */
		githubToken: string;
		/** Valeur anti-CSRF du flux OAuth, vérifiée au retour de GitHub. */
		oauthState: string;
		/** Page à rouvrir après la connexion. */
		returnTo: string;
	}

	/** Données attachées à la requête par le middleware. */
	interface Locals {
		user?: ForumUser;
		githubToken?: string;
	}
}
