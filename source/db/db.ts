import {randomUUID} from 'node:crypto';
import {existsSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {getDbFilePath} from '../helpers/path';

type ProjectRow = {
	canonicalPath: string;
	createdAt: number;
	id: string;
	lastOpenedAt: number;
};

type SessionRow = {
	createdAt: number;
	id: string;
	lastOpenedAt: number;
	projectId: string;
};

type Store = {
	defaultModel: string | null;
	projects: Record<string, ProjectRow>;
	sessions: Record<string, SessionRow>;
	version: 1;
};

export type ProjectSession = Pick<
	SessionRow,
	'createdAt' | 'id' | 'lastOpenedAt'
>;

const emptyStore = (): Store => ({
	defaultModel: null,
	projects: {},
	sessions: {},
	version: 1,
});

const getStoreFilePath = () => getDbFilePath().replace(/\.db$/, '.json');

const isStore = (value: unknown): value is Store => {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<Store>;
	return (
		candidate.version === 1 &&
		(candidate.defaultModel === null ||
			typeof candidate.defaultModel === 'string') &&
		typeof candidate.projects === 'object' &&
		candidate.projects !== null &&
		typeof candidate.sessions === 'object' &&
		candidate.sessions !== null
	);
};

const saveStore = (store: Store) => {
	const storeFilePath = getStoreFilePath();
	const temporaryPath = storeFilePath + '.tmp';
	writeFileSync(temporaryPath, JSON.stringify(store));
	renameSync(temporaryPath, storeFilePath);
};

const toStore = (
	defaultModel: string | null,
	projects: ProjectRow[],
	sessions: SessionRow[],
): Store => ({
	defaultModel,
	projects: Object.fromEntries(
		projects.map(project => [project.canonicalPath, project]),
	),
	sessions: Object.fromEntries(sessions.map(session => [session.id, session])),
	version: 1,
});

const migrateFromBunDatabase = async (
	legacyDatabasePath: string,
): Promise<Store> => {
	const {Database} = await import('bun:sqlite');
	const database = new Database(legacyDatabasePath);

	try {
		const defaultModel = database
			.query<{model: string}, never[]>(
				'SELECT model FROM info WHERE defaultModel = 1 LIMIT 1',
			)
			.get()?.model;
		const projects = database
			.query<ProjectRow, never[]>(
				'SELECT id, canonical_path AS canonicalPath, created_at AS createdAt, last_opened_at AS lastOpenedAt FROM projects',
			)
			.all();
		const sessions = database
			.query<SessionRow, never[]>(
				'SELECT id, project_id AS projectId, created_at AS createdAt, last_opened_at AS lastOpenedAt FROM sessions',
			)
			.all();

		return toStore(defaultModel ?? null, projects, sessions);
	} finally {
		database.close();
	}
};

const migrateFromNodeDatabase = async (
	legacyDatabasePath: string,
): Promise<Store> => {
	const {DatabaseSync} = await import('node:sqlite');
	const database = new DatabaseSync(legacyDatabasePath, {readOnly: true});

	try {
		const defaultModel = database
			.prepare('SELECT model FROM info WHERE defaultModel = 1 LIMIT 1')
			.get() as {model: string} | undefined;
		const projects = database
			.prepare(
				'SELECT id, canonical_path AS canonicalPath, created_at AS createdAt, last_opened_at AS lastOpenedAt FROM projects',
			)
			.all() as ProjectRow[];
		const sessions = database
			.prepare(
				'SELECT id, project_id AS projectId, created_at AS createdAt, last_opened_at AS lastOpenedAt FROM sessions',
			)
			.all() as SessionRow[];

		return toStore(defaultModel?.model ?? null, projects, sessions);
	} finally {
		database.close();
	}
};

const loadStore = async (): Promise<Store> => {
	const storeFilePath = getStoreFilePath();
	if (existsSync(storeFilePath)) {
		const parsed: unknown = JSON.parse(readFileSync(storeFilePath, 'utf8'));
		if (!isStore(parsed)) {
			throw new Error('Cloud TUI local data has an unsupported format.');
		}
		return parsed;
	}

	const legacyDatabasePath = getDbFilePath();
	if (!existsSync(legacyDatabasePath)) return emptyStore();

	const migrated = process.versions.bun
		? await migrateFromBunDatabase(legacyDatabasePath)
		: await migrateFromNodeDatabase(legacyDatabasePath);

	saveStore(migrated);
	return migrated;
};

const store = await loadStore();

export const getDefaultModel = () => store.defaultModel;

export const setDefaultModel = (model: string) => {
	store.defaultModel = model;
	saveStore(store);
};

export const getOrCreateProject = (canonicalPath: string): string => {
	const now = Date.now();
	const existing = store.projects[canonicalPath];
	if (existing) {
		existing.lastOpenedAt = now;
		saveStore(store);
		return existing.id;
	}

	const id = randomUUID();
	store.projects[canonicalPath] = {
		canonicalPath,
		createdAt: now,
		id,
		lastOpenedAt: now,
	};
	saveStore(store);
	return id;
};

export const createSession = (projectId: string): string => {
	const id = randomUUID();
	const now = Date.now();
	store.sessions[id] = {createdAt: now, id, lastOpenedAt: now, projectId};
	saveStore(store);
	return id;
};

export const listProjectSessions = (projectId: string): ProjectSession[] =>
	Object.values(store.sessions)
		.filter(session => session.projectId === projectId)
		.sort((first, second) => second.lastOpenedAt - first.lastOpenedAt)
		.map(({createdAt, id, lastOpenedAt}) => ({createdAt, id, lastOpenedAt}));

export const getOrCreateSession = (
	projectId: string,
	requestedSessionId?: string,
): string => {
	const now = Date.now();
	if (requestedSessionId) {
		const existing = store.sessions[requestedSessionId];
		if (existing && existing.projectId !== projectId) {
			throw new Error('The requested session belongs to a different project.');
		}
		if (existing) {
			existing.lastOpenedAt = now;
			saveStore(store);
			return existing.id;
		}

		store.sessions[requestedSessionId] = {
			createdAt: now,
			id: requestedSessionId,
			lastOpenedAt: now,
			projectId,
		};
		saveStore(store);
		return requestedSessionId;
	}

	const latest = Object.values(store.sessions)
		.filter(session => session.projectId === projectId)
		.sort((first, second) => second.lastOpenedAt - first.lastOpenedAt)[0];
	if (latest) {
		latest.lastOpenedAt = now;
		saveStore(store);
		return latest.id;
	}

	return createSession(projectId);
};
