import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { docRefOf } from '../docs';
import { renderMarkdown } from '../markdown';
import type { Author, ForumStore, Kind, Member, Reply, Topic, TopicSummary } from './types';

/**
 * Stockage de développement : tout le forum dans un fichier JSON à la racine du projet
 * (.forum-local.json, jamais commité). Au premier lancement, il est rempli de quelques
 * sujets d'exemple reliés aux vraies pages de la doc, pour avoir quelque chose à regarder.
 */

const FILE = '.forum-local.json';

interface StoredReply {
	id: string;
	author: Author;
	createdAt: string;
	body: string;
	replies: StoredReply[];
}
interface StoredTopic {
	number: number;
	kind: Kind;
	title: string;
	body: string;
	author: Author;
	createdAt: string;
	answerId: string | null;
	comments: StoredReply[];
}

const avatar = (login: string) => `https://github.com/${login}.png?size=80`;
const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

function seed(): StoredTopic[] {
	const alice = { login: 'alice-sio', avatar: '' };
	const bob = { login: 'bob-sio', avatar: '' };
	return [
		{
			number: 1,
			kind: 'question',
			title: 'chmod 755 ou 750 pour un dossier partagé ?',
			body: "Dans la page sur les droits, on voit `chmod 755`. Pour un dossier que seul mon groupe doit lire, c'est 750 ?\n\n<!-- babouins:doc=sisr/linux/droits-linux -->",
			author: alice,
			createdAt: at(3),
			answerId: 'exemple-reponse-1',
			comments: [
				{
					id: 'exemple-reponse-1',
					author: bob,
					createdAt: at(2),
					body: "Oui : `750` donne tout au propriétaire, lecture et entrée au groupe, rien aux autres.\n\n```bash\nchmod 750 /srv/partage\nls -ld /srv/partage\n```",
					replies: [{ id: randomUUID(), author: alice, createdAt: at(2), body: 'Merci, ça marche !', replies: [] }],
				},
			],
		},
		{
			number: 2,
			kind: 'question',
			title: 'Ma clef SSH est refusée : « Permission denied (publickey) »',
			body: "J'ai suivi la page sur la clef SSH, mais le serveur refuse toujours ma clef. Une idée ?\n\n<!-- babouins:doc=sisr/creation-d-une-clef-ssh -->",
			author: bob,
			createdAt: at(1),
			answerId: null,
			comments: [],
		},
		{
			number: 3,
			kind: 'discussion',
			title: 'Quelles pages manquent dans le dossier Linux ?',
			body: "On a les commandes utiles et les droits. Je propose : les services avec systemd, puis cron. D'autres idées ?\n\n<!-- babouins:doc=sisr/linux -->",
			author: alice,
			createdAt: at(5),
			answerId: null,
			comments: [{ id: randomUUID(), author: bob, createdAt: at(4), body: "+1 pour systemd, et une page sur `ip` et le réseau.", replies: [] }],
		},
	];
}

async function load(): Promise<StoredTopic[]> {
	try {
		return JSON.parse(await readFile(FILE, 'utf8')) as StoredTopic[];
	} catch {
		const topics = seed();
		await save(topics);
		return topics;
	}
}

const save = (topics: StoredTopic[]) => writeFile(FILE, `${JSON.stringify(topics, null, '\t')}\n`);

const withAvatar = (author: Author): Author => ({ ...author, avatar: author.avatar || avatar(author.login) });
const lastActivity = (topic: StoredTopic) =>
	[topic.createdAt, ...topic.comments.flatMap((comment) => [comment.createdAt, ...comment.replies.map((reply) => reply.createdAt)])].sort().at(-1)!;

function toSummary(topic: StoredTopic): TopicSummary {
	return {
		number: topic.number,
		title: topic.title,
		kind: topic.kind,
		author: withAvatar(topic.author),
		createdAt: topic.createdAt,
		updatedAt: lastActivity(topic),
		replies: topic.comments.length,
		answered: topic.answerId !== null,
		closed: false,
		doc: docRefOf(topic.body),
		body: topic.body,
		url: `/sujet/${topic.number}`,
	};
}

function toReply(reply: StoredReply, answerId: string | null): Reply {
	return {
		id: reply.id,
		author: withAvatar(reply.author),
		createdAt: reply.createdAt,
		body: reply.body,
		html: renderMarkdown(reply.body),
		isAnswer: reply.id === answerId,
		hidden: false,
		replies: reply.replies.map((child) => toReply(child, null)),
	};
}

const authorOf = ({ user }: Member): Author => ({ login: user.login, avatar: user.avatar });

export const localStore: ForumStore = {
	async list() {
		return (await load()).map(toSummary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	},

	async get(_member, number) {
		const topic = (await load()).find((candidate) => candidate.number === number);
		if (!topic) return null;
		return {
			...toSummary(topic),
			id: String(topic.number),
			html: renderMarkdown(topic.body),
			comments: topic.comments.map((comment) => toReply(comment, topic.answerId)),
		} satisfies Topic;
	},

	async create(writer, { kind, title, body }) {
		const topics = await load();
		const number = Math.max(0, ...topics.map((topic) => topic.number)) + 1;
		topics.push({ number, kind, title, body, author: authorOf(writer), createdAt: new Date().toISOString(), answerId: null, comments: [] });
		await save(topics);
		return number;
	},

	async reply(writer, { number }, body, replyTo) {
		const topics = await load();
		const topic = topics.find((candidate) => candidate.number === number)!;
		const reply: StoredReply = { id: randomUUID(), author: authorOf(writer), createdAt: new Date().toISOString(), body, replies: [] };
		const parent = replyTo ? topic.comments.find((comment) => comment.id === replyTo) : undefined;
		(parent ? parent.replies : topic.comments).push(reply);
		await save(topics);
	},

	async markAnswer(_writer, { number }, replyId) {
		const topics = await load();
		const topic = topics.find((candidate) => candidate.number === number)!;
		topic.answerId = replyId;
		await save(topics);
	},

	async preview(_member, markdown) {
		return renderMarkdown(markdown);
	},
};
