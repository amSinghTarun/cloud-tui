import fs from 'node:fs/promises';
import path from 'node:path';
import {
	getSessionDirPath,
	getSessionConversationFilePath,
	getLegacySessionConversationFilePath,
	getSessionContextPath,
	getSessionSummaryFilePath,
} from './path';
import {AgentHistory} from '../types';
import {Content} from '@google/genai';

const sessionHistoryWriteQueues = new Map<string, Promise<void>>();

// export type Part = {[x: string]: string};

// append the history type of other agents to this agentHistory

export const creteAgentHistoryForSession = async (
	key: string,
): Promise<AgentHistory> => {
	const savedSession = await getSessionHistory(key);

	//transform the history we have as per that agent, get the agent by agentId as per default

	return savedSession ?? [];
};

export const getSessionHistory = async (
	sessionId: string,
): Promise<Content[] | null> => {
	try {
		const sessionHistoryContent = await fs.readFile(
			getSessionConversationFilePath(sessionId),
			'utf-8',
		);
		return parseSessionHistory(sessionHistoryContent);
	} catch (error: any) {
		if (error.code !== 'ENOENT') throw error;

		try {
			const legacyHistory = await fs.readFile(
				getLegacySessionConversationFilePath(sessionId),
				'utf8',
			);
			const history = parseSessionHistory(legacyHistory);
			if (history) await appendSessionHistory(history, sessionId);
			return history;
		} catch (legacyError: any) {
			if (legacyError.code === 'ENOENT') return null;
			throw legacyError;
		}
	}
};

export const appendSessionHistory = async (
	contents: Content[],
	sessionId: string,
): Promise<void> => {
	if (contents.length === 0) return;

	const sessionConversationPath = getSessionConversationFilePath(sessionId);
	const payload = `${contents
		.map(content => JSON.stringify(content))
		.join('\n')}\n`;
	const previousWrite =
		sessionHistoryWriteQueues.get(sessionId) ?? Promise.resolve();
	const write = previousWrite.then(async () => {
		await fs.mkdir(getSessionDirPath(), {recursive: true});
		await fs.appendFile(sessionConversationPath, payload, 'utf8');
	});

	// Continue later appends even when one write fails, while returning this
	// write's failure to the current agent run.
	sessionHistoryWriteQueues.set(
		sessionId,
		write.catch(() => undefined),
	);
	await write;
};

export const replaceSessionHistory = async (
	history: Content[],
	sessionId: string,
): Promise<void> => {
	const sessionConversationPath = getSessionConversationFilePath(sessionId);
	const payload = history.map(content => JSON.stringify(content)).join('\n');
	const previousWrite =
		sessionHistoryWriteQueues.get(sessionId) ?? Promise.resolve();
	const write = previousWrite.then(async () => {
		await fs.mkdir(getSessionDirPath(), {recursive: true});
		await fs.writeFile(
			sessionConversationPath,
			payload.length > 0 ? `${payload}\n` : '',
			'utf8',
		);
	});

	sessionHistoryWriteQueues.set(
		sessionId,
		write.catch(() => undefined),
	);
	await write;
};

const parseSessionHistory = (content: string): Content[] | null => {
	const trimmed = content.trim();
	if (!trimmed) return null;

	if (trimmed.startsWith('[')) {
		const legacyHistory: unknown = JSON.parse(trimmed);
		if (!Array.isArray(legacyHistory)) {
			throw new Error(
				'Session history must be an array of Gemini Content items.',
			);
		}
		return legacyHistory as Content[];
	}

	if (trimmed.startsWith('{') && !trimmed.includes('\n')) {
		const legacySession: unknown = JSON.parse(trimmed);
		if (
			typeof legacySession === 'object' &&
			legacySession !== null &&
			'history' in legacySession &&
			Array.isArray(legacySession.history)
		) {
			return legacySession.history as Content[];
		}
	}

	return trimmed.split('\n').map((line, index) => {
		try {
			return JSON.parse(line) as Content;
		} catch (error) {
			throw new Error(
				`Session history contains invalid JSON on line ${index + 1}: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	});
};

export const storeContextContent = async (
	sessionId: string,
	filename: string,
	content: string,
	signal?: AbortSignal,
) => {
	const contextPath = getSessionContextPath(sessionId);
	await fs.mkdir(contextPath, {recursive: true});
	await fs.writeFile(path.join(contextPath, filename), content, {
		encoding: 'utf-8',
		signal,
	});
};

export const storeSessionSummary = async (
	sessionId: string,
	summary: string,
	signal?: AbortSignal,
) => {
	const summaryPath = getSessionSummaryFilePath(sessionId);
	await fs.mkdir(getSessionDirPath(), {recursive: true});
	await fs.writeFile(summaryPath, summary, {
		encoding: 'utf-8',
		signal,
	});
};

export const getSessionSummary = async (sessionId: string): Promise<string> => {
	const summaryPath = getSessionSummaryFilePath(sessionId);
	try {
		return await fs.readFile(summaryPath, 'utf-8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
		throw error;
	}
};
