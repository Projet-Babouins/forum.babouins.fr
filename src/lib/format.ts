/** Petites mises en forme partagées par les pages. */

const relative = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
const full = new Intl.DateTimeFormat('fr', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
	['year', 365 * 86_400],
	['month', 30 * 86_400],
	['week', 7 * 86_400],
	['day', 86_400],
	['hour', 3_600],
	['minute', 60],
];

/** « il y a 3 jours », « hier », « à l'instant ». */
export function ago(iso: string): string {
	const seconds = (Date.parse(iso) - Date.now()) / 1000;
	for (const [unit, size] of STEPS) {
		if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
	}
	return "à l'instant";
}

/** « 20 octobre 2026 à 14:05 », pour l'infobulle d'une date relative. */
export const fullDate = (iso: string) => full.format(new Date(iso));

/** « 1 réponse », « 3 réponses ». */
export const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;
