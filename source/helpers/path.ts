import {mkdirSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const getDefaultDirPath = () => {
	const configuredDataPath = process.env['CLOUD_TUI_HOME'];
	return configuredDataPath
		? path.resolve(configuredDataPath)
		: path.join(os.homedir(), '.cloud_tui');
};

export const getConfigPath = () =>
	path.join(getDefaultDirPath(), 'info/config.json');

export const getDbFilePath = () => {
	let dbPath = path.join(getDefaultDirPath(), 'db');
	mkdirSync(dbPath, {recursive: true});
	return path.join(dbPath, 'main.db');
};

export const getSessionDirPath = () =>
	path.join(getDefaultDirPath(), 'project/sessions');

export const getSessionContextPath = (sessionId: string) =>
	path.join(getDefaultDirPath(), 'project/sessions', sessionId, 'context');

export const getSessionContextFilePath = (
	sessionId: string,
	fileName: string,
) => path.join(getSessionContextPath(sessionId), fileName);

export const getSessionSummaryFilePath = (sessionId: string) =>
	path.join(getSessionDirPath(), `${sessionId}-summary.txt`);

export const getSessionConversationFilePath = (sessionId: string) =>
	path.join(getSessionDirPath(), `${sessionId}-conversation.jsonl`);

export const getLegacySessionConversationFilePath = (sessionId: string) =>
	path.join(getSessionDirPath(), `${sessionId}-conversation.json`);
