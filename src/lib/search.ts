import { withoutMarker, type DocPage, type DocsIndex } from './docs';
import type { TopicSummary } from './store';

/**
 * Recherche commune : la doc et le forum, en une fois.
 *
 * Volontairement simple : les petits mots (« le », « comment »…) sont ignorés, au moins la
 * moitié des mots cherchés doivent apparaître (accents et majuscules ignorés), et un mot
 * trouvé dans le titre compte bien plus qu'un mot trouvé dans le texte.
 * Il y a quelques dizaines de pages et quelques centaines de sujets : tout tient en mémoire,
 * et le tout prend moins d'une milliseconde.
 */

const normalize = (text: string) =>
	text
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase();

/** Mots trop courants pour aider à trouver quoi que ce soit. */
const STOP_WORDS = new Set(
	`au aux avec ce ces c cest comment dans de des du elle en est et faire faut il j je la le les leur ma mais me mes mon
	ne on ou par pas pour qu que quel quelle quelles quels qui sa se ses son sur ta te tes ton tu un une vos votre vous y
	quoi pourquoi quand marche fonctionne probleme aide besoin choisir avoir etre`.split(/\s+/),
);

const wordsOf = (query: string) => [
	...new Set(
		normalize(query)
			.split(/[^a-z0-9]+/)
			.filter((word) => word.length > 1 && !STOP_WORDS.has(word)),
	),
];

interface Field {
	text: string;
	weight: number;
}

/**
 * Score d'un document ; 0 si moins de la moitié des mots y sont. Le nombre de mots trouvés
 * passe avant tout (centaines), puis l'endroit où ils sont trouvés (titre, texte).
 */
function score(words: string[], fields: Field[]): number {
	const prepared = fields.map((field) => ({ text: normalize(field.text), weight: field.weight }));
	let matched = 0;
	let weight = 0;
	for (const word of words) {
		const found = prepared.filter((field) => field.text.includes(word));
		if (found.length) matched++;
		weight += found.reduce((sum, field) => sum + field.weight, 0);
	}
	return matched * 2 >= words.length ? matched * 100 + weight : 0;
}

/** Court extrait autour du premier mot trouvé. */
function excerpt(text: string, words: string[], length = 180): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	const lower = normalize(flat);
	const first = Math.min(...words.map((word) => lower.indexOf(word)).filter((index) => index >= 0), flat.length);
	const start = Math.max(0, first - 60);
	const cut = flat.slice(start, start + length);
	return `${start > 0 ? '…' : ''}${cut}${start + length < flat.length ? '…' : ''}`;
}

/** Markdown vers texte à peu près brut, pour les extraits. */
const plain = (markdown: string) =>
	withoutMarker(markdown)
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/[#>*_`[\]()!-]/g, ' ');

export interface SearchResults {
	docs: (DocPage & { excerpt: string })[];
	topics: (TopicSummary & { excerpt: string })[];
}

export function search(query: string, index: DocsIndex, topics: TopicSummary[], limit = 20): SearchResults {
	const words = wordsOf(query);
	if (words.length === 0) return { docs: [], topics: [] };

	const docs = [...index.pages.values()]
		.map((page) => ({
			page,
			score: score(words, [
				{ text: page.title, weight: 5 },
				{ text: page.description, weight: 2 },
				{ text: page.text, weight: 1 },
			]),
		}))
		.filter((hit) => hit.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map(({ page }) => ({ ...page, excerpt: excerpt(page.text || page.description, words) }));

	const found = topics
		.map((topic) => ({
			topic,
			// À score égal, une question résolue passe devant : elle a une réponse à donner.
			score: score(words, [
				{ text: topic.title, weight: 5 },
				{ text: topic.body, weight: 1 },
			]) + (topic.answered ? 0.5 : 0),
		}))
		.filter((hit) => hit.score >= 1)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map(({ topic }) => ({ ...topic, excerpt: excerpt(plain(topic.body), words) }));

	return { docs, topics: found };
}
