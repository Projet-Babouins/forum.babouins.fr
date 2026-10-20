import { DOCS_URL } from 'astro:env/server';

/**
 * Le lien avec la doc.
 *
 * La doc publie à chaque build un index de ses pages : DOCS_URL/pages.json (voir
 * src/pages/pages.json.ts dans le dépôt docs.babouins.fr). Le forum le lit pour :
 * - ranger les sujets dans les dossiers de la doc (mêmes noms, même ordre que son menu) ;
 * - afficher la page dont parle un sujet ;
 * - chercher dans la doc et dans le forum en même temps (lib/search.ts).
 *
 * Un sujet est relié à une page ou à un dossier par un repère invisible, écrit à la fin de
 * son message : <!-- babouins:doc=sisr/linux/droits-linux -->. Un sujet ouvert directement sur
 * github.com n'a pas de repère : on prend alors le premier lien vers une page de la doc.
 */

/** Nœud de l'arbre de la doc, dans l'ordre de son menu. */
export type DocNode =
	| { type: 'page'; id: string; title: string }
	| { type: 'folder'; path: string; label: string; items: DocNode[] };

export interface DocPage {
	id: string;
	title: string;
	description: string;
	/** Texte brut de la page, pour la recherche commune. */
	text: string;
}

export interface DocsIndex {
	tree: DocNode[];
	pages: Map<string, DocPage>;
	/** Nom affiché de chaque dossier, par chemin. */
	folders: Map<string, string>;
}

/** Ce que la doc publie dans /pages.json. */
interface PagesJson {
	tree: RawNode[];
	pages: DocPage[];
}
type RawNode = { type: 'course'; path: string; title: string } | { type: 'folder'; path: string; label: string; items: RawNode[] };

const SEGMENT = '[a-z0-9]+(?:-[a-z0-9]+)*';
const DOC_ID = new RegExp(`^${SEGMENT}(?:/${SEGMENT}){0,5}$`);
const MARKER = /<!--\s*babouins:doc=([a-z0-9/-]+)\s*-->/;

/** Vrai pour un identifiant de page ou de dossier bien formé (mêmes règles que la doc). */
export const isValidDocId = (id: string) => DOC_ID.test(id);

/** Repère à écrire à la fin d'un message pour le relier à la doc. */
export const docMarker = (id: string) => `\n\n<!-- babouins:doc=${id} -->`;

/** Message sans son repère : c'est ce qu'on affiche et ce qu'on recopie dans la doc. */
export const withoutMarker = (body: string) => body.replace(MARKER, '').trimEnd();

/** Page ou dossier de la doc dont parle un message ; `null` s'il ne parle d'aucun. */
export function docRefOf(body: string): string | null {
	const marked = body.match(MARKER)?.[1];
	if (marked && isValidDocId(marked)) return marked;
	const host = new URL(DOCS_URL).host.replace(/\./g, '\\.');
	const linked = body.match(new RegExp(`${host}/docs/(${SEGMENT}(?:/${SEGMENT}){0,5})`))?.[1];
	return linked ?? null;
}

export const docPageUrl = (id: string) => `${DOCS_URL}/docs/${id}/`;
/** L'éditeur de la doc, prêt à transformer un sujet en page (voir le dépôt de la doc). */
export const docEditorUrl = (topic: number) => `${DOCS_URL}/admin?depuis-forum=${topic}`;
export const docsHome = () => DOCS_URL;

// --- Index de la doc -----------------------------------------------------------

/** L'index est relu au plus toutes les 5 minutes : la doc ne change qu'à chaque publication. */
const TTL_MS = 5 * 60_000;
const EMPTY: DocsIndex = { tree: [], pages: new Map(), folders: new Map() };

let cached: { index: DocsIndex; at: number } | null = null;
let pending: Promise<DocsIndex> | null = null;

function toIndex(json: PagesJson): DocsIndex {
	const folders = new Map<string, string>();
	const convert = (nodes: RawNode[]): DocNode[] =>
		nodes.map((node) => {
			if (node.type === 'course') return { type: 'page', id: node.path, title: node.title };
			folders.set(node.path, node.label);
			return { type: 'folder', path: node.path, label: node.label, items: convert(node.items) };
		});
	const tree = convert(json.tree);
	return { tree, folders, pages: new Map(json.pages.map((page) => [page.id, page])) };
}

async function fetchIndex(): Promise<DocsIndex> {
	try {
		const response = await fetch(`${DOCS_URL}/pages.json`, { signal: AbortSignal.timeout(5_000) });
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const index = toIndex((await response.json()) as PagesJson);
		cached = { index, at: Date.now() };
		return index;
	} catch (error) {
		// La doc est injoignable : le forum reste utilisable, avec le dernier index connu (ou aucun).
		console.error(`Index de la doc illisible (${DOCS_URL}/pages.json) : ${error instanceof Error ? error.message : error}`);
		cached = { index: cached?.index ?? EMPTY, at: Date.now() - TTL_MS + 30_000 }; // nouvel essai dans 30 s
		return cached.index;
	}
}

export async function docsIndex(): Promise<DocsIndex> {
	if (cached && Date.now() - cached.at < TTL_MS) return cached.index;
	pending ??= fetchIndex().finally(() => (pending = null));
	return pending;
}

// --- Présentation d'un lien vers la doc ----------------------------------------------

export interface DocLink {
	kind: 'page' | 'folder';
	id: string;
	/** Titre de la page, ou nom du dossier. */
	label: string;
	/** Dossiers parents, du plus haut au plus proche : ['SISR', 'Linux']. */
	trail: string[];
	/** Page : son adresse dans la doc. Dossier : les sujets de ce dossier, sur le forum. */
	href: string;
}

/** Tout ce qu'il faut pour afficher le lien d'un sujet vers la doc ; `null` si la doc ne le connaît pas. */
export function describeDoc(index: DocsIndex, id: string | null): DocLink | null {
	if (!id) return null;
	const segments = id.split('/');
	const trail = segments.slice(0, -1).map((_, depth) => {
		const path = segments.slice(0, depth + 1).join('/');
		return index.folders.get(path) ?? path;
	});
	const page = index.pages.get(id);
	if (page) return { kind: 'page', id, label: page.title, trail, href: docPageUrl(id) };
	const folder = index.folders.get(id);
	if (folder) return { kind: 'folder', id, label: folder, trail, href: `/?doc=${encodeURIComponent(id)}` };
	return null;
}

/** Vrai si le sujet relié à `ref` fait partie de `filter` (la page elle-même, ou un dossier qui la contient). */
export const isWithin = (ref: string | null, filter: string) => ref !== null && (ref === filter || ref.startsWith(`${filter}/`));
