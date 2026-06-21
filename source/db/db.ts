import database, {Transaction} from 'better-sqlite3';
import {getDbFilePath} from '../helpers/index.js';

const db = new database(getDbFilePath());

const initDatabase = `
    CREATE TABLE IF NOT EXISTS info (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model TEXT NOT NULL,
        defaultModel BOOLEAN,
        effort TEXT 
    )
`;

db.exec(initDatabase);

export const getDefaultModel = () => {
	let defaultModel = db
		.prepare(` SELECT model FROM info WHERE defaultModel = 1 `)
		.get() as {model: string};
	return defaultModel?.model ?? null;
};

export const setDefaultModel: Transaction<(model: string) => {model: string}> =
	db.transaction((model: string) => {
		db.prepare(`UPDATE info SET defaultModel = 0 WHERE defaultModel = 1`).run();

		db.prepare(
			`INSERT INTO info (model, defaultModel) VALUES (?, 1) RETURNING model`,
		).get(model);
	});
