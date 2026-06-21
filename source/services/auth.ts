import fs from 'node:fs/promises';
import {getConfigPath} from '../helpers/index.js';
import path from 'node:path';
import {setDefaultModel, getDefaultModel} from '../db/index.js';
import {PROVIDERS_MODELS} from '../app.js';

export const login = async (provider: string, apiKey: string) => {
	let config;

	try {
		let configFileContent = await fs.readFile(getConfigPath(), 'utf-8');
		config = configFileContent != '' ? JSON.parse(configFileContent) : {};
	} catch (error: any) {
		if (error.code != 'ENOENT') throw error;
	}

	config = {
		...config,
		[provider]: {
			type: 'api',
			apiKey: apiKey,
		},
	};

	await fs.mkdir(path.dirname(getConfigPath()), {recursive: true});
	await fs.writeFile(getConfigPath(), JSON.stringify(config));

	let defaultModel = getDefaultModel();
	if (!defaultModel) {
		let newDefaultProvider = '';
		PROVIDERS_MODELS.entries().find(([existingProvider], _index) => {
			if (existingProvider == provider) {
				newDefaultProvider =
					PROVIDERS_MODELS.get(existingProvider)?.find(
						([priority, _model], _index) => {
							if (priority.match('0')) return true;
							return false;
						},
					)?.[1] ?? '';
				return true;
			}
			return false;
		});
		setDefaultModel(newDefaultProvider);
	}

	return;
};

export const logout = async (provider: string) => {
	let config;

	try {
		let configFileContent = await fs.readFile(getConfigPath(), 'utf-8');
		config = configFileContent != '' ? JSON.parse(configFileContent) : {};
	} catch (error: any) {
		if (error.code != 'ENOENT') throw error;
		return;
	}

	delete config[provider];

	await fs.writeFile(getConfigPath(), JSON.stringify(config));

	return;
};
