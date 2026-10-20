/**
 * Contrat de stockage du forum. Deux versions :
 * - `github` : les GitHub Discussions du dépôt du forum (production) ;
 * - `local`  : un fichier JSON sur le disque (développement, sans compte ni réseau).
 * Les pages ne savent pas laquelle elles utilisent.
 */

/** Question : on attend une solution (catégorie « Q&A » de GitHub). Discussion : un échange libre. */
export type Kind = 'question' | 'discussion';

export interface Author {
	login: string;
	avatar: string;
}

/** Un sujet, tel qu'il apparaît dans une liste. */
export interface TopicSummary {
	number: number;
	title: string;
	kind: Kind;
	/** `null` : compte GitHub supprimé. */
	author: Author | null;
	createdAt: string;
	updatedAt: string;
	/** Nombre de réponses directes (sans les réponses aux réponses). */
	replies: number;
	answered: boolean;
	closed: boolean;
	/** Page ou dossier de la doc dont parle le sujet (voir lib/docs.ts). */
	doc: string | null;
	/** Message en Markdown, pour la recherche et pour la doc. */
	body: string;
	/** Le sujet sur github.com. */
	url: string;
}

export interface Reply {
	id: string;
	author: Author | null;
	createdAt: string;
	/** Markdown d'origine. */
	body: string;
	/** HTML rendu et nettoyé par GitHub (ou par lib/markdown.ts en local). */
	html: string;
	isAnswer: boolean;
	/** Masqué par un modérateur sur GitHub : le contenu n'est pas affiché. */
	hidden: boolean;
	/** Réponses à cette réponse (un seul niveau, comme sur GitHub). */
	replies: Reply[];
}

export interface Topic extends TopicSummary {
	/** Identifiant GitHub du sujet, pour y répondre. */
	id: string;
	html: string;
	comments: Reply[];
}

export interface NewTopic {
	kind: Kind;
	title: string;
	body: string;
	doc: string | null;
}

/** Qui écrit : la personne connectée, avec son jeton GitHub (absent en stockage local). */
export interface Writer {
	user: ForumUser;
	token?: string;
}

export interface ForumStore {
	/** Tous les sujets, du plus récemment actif au plus ancien. */
	list(): Promise<TopicSummary[]>;
	/** Un sujet avec ses réponses ; `null` s'il n'existe pas. */
	get(number: number): Promise<Topic | null>;
	/** Crée un sujet et renvoie son numéro. */
	create(writer: Writer, topic: NewTopic): Promise<number>;
	/** Répond à un sujet, ou à une réponse (`replyTo`). */
	reply(writer: Writer, topic: Topic, body: string, replyTo?: string): Promise<void>;
	/** Choisit la réponse qui résout une question. */
	markAnswer(writer: Writer, topic: Topic, replyId: string): Promise<void>;
	/** Aperçu d'un message, rendu comme il sera publié. */
	preview(markdown: string): Promise<string>;
}
