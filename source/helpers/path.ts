import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const getDefaultDirPath = () => path.join(os.homedir(), '/.cloud_tui');

export const getConfigPath = () =>
	path.join(getDefaultDirPath(), '/info/config.json');

export const getDbFilePath = () => {
	let dbPath = path.join(getDefaultDirPath(), '/db');
	fs.mkdir(dbPath, {recursive: true});
	return path.join(dbPath, '/main.db');
};

export const getProjectDir = () => path.join(getDefaultDirPath(), '/project');

export const getSessionHistoryDirPath = () =>
	path.join(getDefaultDirPath(), '/project/sessions');

export const getSessionHistoryFilePath = (sessionId: string) =>
	path.join(getSessionHistoryDirPath(), `/${sessionId}.json`);
