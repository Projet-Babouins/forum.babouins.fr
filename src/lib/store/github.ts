import { GITHUB_REPO } from 'astro:env/server';
import { appToken } from '../app-token';
import { docRefOf } from '../docs';
import { ForumError } from '../errors';
import { createGitHub } from '../github';
import type { Author, ForumStore, Kind, Reply, Topic, TopicSummary, Writer } from './types';

/**
 * Le forum, ce sont les GitHub Discussions du dépôt GITHUB_REPO.
 *
 * - Lire : avec le jeton du serveur (lib/app-token.ts). La liste complète des sujets est gardée
 *   30 secondes en mémoire : une classe écrit quelques centaines de sujets, pas des millions,
 *   et tout avoir sous la main rend les filtres et la recherche immédiats.
 * - Écrire : avec le jeton de la personne connectée. GitHub vérifie ses droits et publie à son nom.
 *
 * Catégories : une question va dans la première catégorie « répondable » du dépôt (Q&A à la
 * création des Discussions), une discussion dans « General ». Les dossiers de la doc ne sont
 * PAS des catégories GitHub (on ne peut pas en créer par l'API) : ils viennent du repère du message.
 */

const [owner, name] = GITHUB_REPO.split('/');
const LIST_TTL_MS = 30_000;
const TOPIC_TTL_MS = 15_000;
const META_TTL_MS = 60 * 60_000;
/** Au-delà, les plus anciens sujets ne sont plus listés (ils restent ouvrables par leur adresse). */
const MAX_PAGES = 10;

interface RawAuthor {
	login: string;
	avatarUrl: string;
}
interface RawSummary {
	number: number;
	title: string;
	body: string;
	createdAt: string;
	updatedAt: string;
	closed: boolean;
	isAnswered: boolean | null;
	url: string;
	category: { isAnswerable: boolean };
	author: RawAuthor | null;
	comments: { totalCount: number };
}
interface RawComment {
	id: string;
	body: string;
	bodyHTML: string;
	createdAt: string;
	isAnswer?: boolean;
	isMinimized: boolean;
	author: RawAuthor | null;
	replies?: { nodes: RawComment[] };
}
interface RawTopic extends RawSummary {
	id: string;
	bodyHTML: string;
	comments: { totalCount: number; nodes: RawComment[] };
}

const SUMMARY_FIELDS = `number title body createdAt updatedAt closed isAnswered url
	category { isAnswerable } author { login avatarUrl } comments { totalCount }`;
const COMMENT_FIELDS = 'id body bodyHTML createdAt isMinimized author { login avatarUrl }';

const LIST_QUERY = `query($owner: String!, $name: String!, $after: String) {
	repository(owner: $owner, name: $name) {
		discussions(first: 100, after: $after, orderBy: { field: UPDATED_AT, direction: DESC }) {
			pageInfo { hasNextPage endCursor }
			nodes { ${SUMMARY_FIELDS} }
		}
	}
}`;

const TOPIC_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
	repository(owner: $owner, name: $name) {
		discussion(number: $number) {
			id bodyHTML ${SUMMARY_FIELDS.replace('comments { totalCount }', '')}
			comments(first: 100) {
				totalCount
				nodes { ${COMMENT_FIELDS} isAnswer replies(first: 50) { nodes { ${COMMENT_FIELDS} } } }
			}
		}
	}
}`;

const META_QUERY = `query($owner: String!, $name: String!) {
	repository(owner: $owner, name: $name) {
		id
		discussionCategories(first: 25) { nodes { id slug isAnswerable } }
	}
}`;

const author = (raw: RawAuthor | null): Author | null => (raw ? { login: raw.login, avatar: raw.avatarUrl } : null);
const kindOf = (raw: RawSummary): Kind => (raw.category.isAnswerable ? 'question' : 'discussion');

function toSummary(raw: RawSummary, replies: number): TopicSummary {
	return {
		number: raw.number,
		title: raw.title,
		kind: kindOf(raw),
		author: author(raw.author),
		createdAt: raw.createdAt,
		updatedAt: raw.updatedAt,
		replies,
		answered: Boolean(raw.isAnswered),
		closed: raw.closed,
		doc: docRefOf(raw.body),
		body: raw.body,
		url: raw.url,
	};
}

function toReply(raw: RawComment): Reply {
	return {
		id: raw.id,
		author: author(raw.author),
		createdAt: raw.createdAt,
		body: raw.isMinimized ? '' : raw.body,
		html: raw.isMinimized ? '' : raw.bodyHTML,
		isAnswer: Boolean(raw.isAnswer),
		hidden: raw.isMinimized,
		replies: (raw.replies?.nodes ?? []).map(toReply),
	};
}

/** Lecture avec le jeton du serveur. */
const reader = async () => createGitHub(await appToken());

/** Écriture avec le jeton de la personne connectée. */
function writerClient({ token }: Writer) {
	if (!token) throw new ForumError(401, 'Ta session GitHub a expiré. Reconnecte-toi.');
	return createGitHub(token);
}

let list: { topics: TopicSummary[]; at: number } | null = null;
let listPending: Promise<TopicSummary[]> | null = null;
const topics = new Map<number, { topic: Topic | null; at: number }>();
let meta: { repositoryId: string; question: string; discussion: string; at: number } | null = null;

/** Après une écriture, ce qui est en mémoire est périmé. */
function forget(number?: number) {
	list = null;
	if (number !== undefined) topics.delete(number);
}

async function fetchList(): Promise<TopicSummary[]> {
	const github = await reader();
	const all: TopicSummary[] = [];
	let after: string | null = null;
	for (let page = 0; page < MAX_PAGES; page++) {
		type Page = { repository: { discussions: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: RawSummary[] } } };
		const data: Page = await github.graphql<Page>(LIST_QUERY, { owner, name, after });
		const { nodes, pageInfo } = data.repository.discussions;
		all.push(...nodes.map((node) => toSummary(node, node.comments.totalCount)));
		if (!pageInfo.hasNextPage) break;
		after = pageInfo.endCursor;
	}
	list = { topics: all, at: Date.now() };
	return all;
}

async function repositoryMeta() {
	if (meta && Date.now() - meta.at < META_TTL_MS) return meta;
	type Meta = { repository: { id: string; discussionCategories: { nodes: { id: string; slug: string; isAnswerable: boolean }[] } } };
	const { repository } = await (await reader()).graphql<Meta>(META_QUERY, { owner, name });
	const categories = repository.discussionCategories.nodes;
	const question = categories.find((category) => category.isAnswerable);
	const discussion =
		categories.find((category) => category.slug === 'general') ??
		categories.find((category) => !category.isAnswerable && !['announcements', 'polls'].includes(category.slug));
	if (!question || !discussion) {
		throw new ForumError(503, 'Les catégories « Q&A » et « General » manquent dans les Discussions du dépôt du forum.');
	}
	meta = { repositoryId: repository.id, question: question.id, discussion: discussion.id, at: Date.now() };
	return meta;
}

export const githubStore: ForumStore = {
	async list() {
		if (list && Date.now() - list.at < LIST_TTL_MS) return list.topics;
		listPending ??= fetchList().finally(() => (listPending = null));
		return listPending;
	},

	async get(number) {
		const hit = topics.get(number);
		if (hit && Date.now() - hit.at < TOPIC_TTL_MS) return hit.topic;
		type Data = { repository: { discussion: RawTopic | null } };
		const { repository } = await (await reader()).graphql<Data>(TOPIC_QUERY, { owner, name, number });
		const raw = repository.discussion;
		const topic: Topic | null = raw && {
			...toSummary(raw, raw.comments.totalCount),
			id: raw.id,
			html: raw.bodyHTML,
			comments: raw.comments.nodes.map(toReply),
		};
		topics.set(number, { topic, at: Date.now() });
		return topic;
	},

	async create(writer, { kind, title, body }) {
		const { repositoryId, question, discussion } = await repositoryMeta();
		type Data = { createDiscussion: { discussion: { number: number } } };
		const data = await writerClient(writer).graphql<Data>(
			`mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
				createDiscussion(input: { repositoryId: $repositoryId, categoryId: $categoryId, title: $title, body: $body }) {
					discussion { number }
				}
			}`,
			{ repositoryId, categoryId: kind === 'question' ? question : discussion, title, body },
		);
		forget();
		return data.createDiscussion.discussion.number;
	},

	async reply(writer, topic, body, replyTo) {
		await writerClient(writer).graphql(
			`mutation($discussionId: ID!, $body: String!, $replyToId: ID) {
				addDiscussionComment(input: { discussionId: $discussionId, body: $body, replyToId: $replyToId }) { comment { id } }
			}`,
			{ discussionId: topic.id, body, replyToId: replyTo ?? null },
		);
		forget(topic.number);
	},

	async markAnswer(writer, topic, replyId) {
		await writerClient(writer).graphql(
			`mutation($id: ID!) { markDiscussionCommentAsAnswer(input: { id: $id }) { discussion { id } } }`,
			{ id: replyId },
		);
		forget(topic.number);
	},

	async preview(markdown) {
		return (await reader()).markdown(markdown, GITHUB_REPO);
	},
};
