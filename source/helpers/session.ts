import fs from 'node:fs/promises';
import {getSessionHistoryDirPath, getSessionHistoryFilePath} from './path.js';
import {SessionHistory} from '../types/index.js';
import {type Content} from '@google/genai';

export const getSessionHistory = async (
	sessionId: string,
): Promise<SessionHistory | null> => {
	try {
		let sessionHistoryContent = await fs.readFile(
			getSessionHistoryFilePath(sessionId),
			'utf-8',
		);
		let sessionHistory =
			sessionHistoryContent == '' ? null : JSON.parse(sessionHistoryContent);

		return sessionHistory;
	} catch (error: any) {
		if (error.code == 'ENOENT') return null;
		throw error;
	}
};

export const createSessionHistory = async (
	sessionId: string,
	initialPrompt: string,
): Promise<SessionHistory> => {
	await fs.mkdir(getSessionHistoryDirPath(), {recursive: true});

	let sessionHistory: SessionHistory = {
		sessionId: sessionId,
		initialPrompt: initialPrompt,
		history: [],
	};

	await fs.writeFile(
		getSessionHistoryFilePath(sessionId),
		JSON.stringify(sessionHistory),
	);

	return sessionHistory;
};

export const setSessionHistory = async (
	history: Content[],
	sessionId: string,
) => {
	let sessionHistory;
	try {
		let sessionHistoryContent = await fs.readFile(
			getSessionHistoryFilePath(sessionId),
			'utf-8',
		);
		sessionHistory =
			sessionHistoryContent == ''
				? null
				: (JSON.parse(sessionHistoryContent) as SessionHistory);
	} catch (error: any) {
		if (error.code == 'ENOENT') {
			fs.mkdir(getSessionHistoryDirPath(), {recursive: true});
		}
		throw error;
	}

	await fs.writeFile(
		getSessionHistoryFilePath(sessionId),
		JSON.stringify({
			sessionId: sessionId,
			initialPrompt: sessionHistory ? sessionHistory.initialPrompt : '',
			history: history,
		} as SessionHistory),
	);

	return;
};
