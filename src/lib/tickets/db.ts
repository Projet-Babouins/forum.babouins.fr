import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { TICKETS_DB } from 'astro:env/server';

/**
 * La base de l'entraide : un fichier SQLite (TICKETS_DB), créé au premier usage.
 * `node:sqlite` est livré avec Node : aucune dépendance. Les appels sont synchrones, ce qui
 * rend chaque action atomique dans l'unique processus du forum.
 */

const SCHEMA = `
	CREATE TABLE IF NOT EXISTS tickets (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		title TEXT NOT NULL,
		body TEXT NOT NULL,
		doc TEXT,
		author_login TEXT NOT NULL,
		author_avatar TEXT NOT NULL DEFAULT '',
		helper_login TEXT,
		status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'taken', 'resolved')),
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL,
		resolved_at TEXT,
		discussion_number INTEGER
	);
	CREATE TABLE IF NOT EXISTS messages (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
		author_login TEXT NOT NULL,
		author_avatar TEXT NOT NULL DEFAULT '',
		body TEXT NOT NULL,
		created_at TEXT NOT NULL
	);
	CREATE INDEX IF NOT EXISTS messages_ticket ON messages (ticket_id);
	CREATE INDEX IF NOT EXISTS tickets_status ON tickets (status, created_at);
`;

let db: DatabaseSync | undefined;

export function database(): DatabaseSync {
	if (!db) {
		mkdirSync(dirname(TICKETS_DB), { recursive: true });
		db = new DatabaseSync(TICKETS_DB);
		db.exec(`PRAGMA busy_timeout = 3000; ${SCHEMA}`);
	}
	return db;
}
