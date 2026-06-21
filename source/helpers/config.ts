import fs from 'node:fs/promises';
import {PROVIDERS_MODELS} from '../app.js';
import {getDefaultModel} from '../db/index.js';
import {getConfigPath} from './path.js';

export const verifyProviderAndLogin = () => {
	try {
		const defaultModel = getDefaultModel();

		if (!defaultModel) {
			throw new Error('Login to use agent');
		}

		let provderOfModelExist = PROVIDERS_MODELS.entries().find(
			([provider], _index) => {
				return PROVIDERS_MODELS.get(provider)?.find(
					([_priority, model], _index) => {
						if (model == defaultModel) {
							return true;
						}
						return false;
					},
				);
			},
		);

		if (provderOfModelExist) return true;
		throw new Error('Login again to use agent');
	} catch (error) {
		throw error;
	}
};

export const getApiKey = async (providerOfModel: string) => {
	try {
		let configFileContent = await fs.readFile(getConfigPath(), 'utf-8');
		let config = configFileContent != '' ? JSON.parse(configFileContent) : {};
		let loggedInProvider = config[providerOfModel];

		return loggedInProvider['apiKey'];
	} catch (error: any) {
		if (error.code == 'ENOENT') return new Error('Login to use agent ');
		throw error;
	}
};
