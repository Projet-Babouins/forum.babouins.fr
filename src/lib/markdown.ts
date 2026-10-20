import { Marked } from 'marked';
import { withoutMarker } from './docs';

/**
 * Rendu Markdown du stockage local (développement). En production, c'est GitHub qui rend
 * et nettoie les messages : ce fichier ne sert jamais aux vraies Discussions.
 * Par prudence, le HTML écrit dans un message est affiché comme du texte, et seuls les liens
 * http(s), mailto et relatifs sont gardés.
 */

const escape = (text: string) =>
	text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

const SAFE_URL = /^(https?:|mailto:|\/|#)/i;

const marked = new Marked({
	gfm: true,
	breaks: true,
	renderer: {
		html: ({ text }) => escape(text),
		link({ href, tokens }) {
			const label = this.parser.parseInline(tokens);
			return SAFE_URL.test(href) ? `<a href="${escape(href)}">${label}</a>` : label;
		},
		image: ({ href, text }) => (SAFE_URL.test(href) ? `<img src="${escape(href)}" alt="${escape(text)}">` : escape(text)),
	},
});

export const renderMarkdown = (markdown: string) => marked.parse(withoutMarker(markdown), { async: false });
