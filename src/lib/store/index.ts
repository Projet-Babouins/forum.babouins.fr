import { FORUM_STORE } from 'astro:env/server';
import { githubStore } from './github';
import { localStore } from './local';
import type { ForumStore, Member } from './types';

export * from './types';

/**
 * Stockage local : un fichier sur le poste, en développement. Pas de compte, pas de réseau.
 * `FORUM_STORE=github` dans .env permet d'essayer les vraies Discussions depuis son poste.
 * En production c'est toujours GitHub.
 */
export const isLocalMode = () => import.meta.env.DEV && FORUM_STORE !== 'github';

export const forum = (): ForumStore => (isLocalMode() ? localStore : githubStore);

/** La personne connectée et son jeton (garantie par src/middleware.ts : tout le forum exige une session). */
export const memberOf = (locals: App.Locals): Member => ({ user: locals.user!, token: locals.githubToken });
