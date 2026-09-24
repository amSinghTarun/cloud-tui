import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import {promisify} from 'node:util';
import {getConfigPath} from '../helpers';
import path from 'node:path';
import {setDefaultModel} from '../db';
import {PROVIDERS_MODELS} from '../config/models';

type VertexConnection = {
	location: string;
	project: string;
};

type StoredConnection =
	| {apiKey: string; type: 'api'}
	| ({type: 'vertex'} & VertexConnection);

type AuthConfig = Record<string, StoredConnection | string | undefined> & {
	activeProvider?: string;
};

const execFileAsync = promisify(execFile);

const gcloudProject = async (): Promise<string | undefined> => {
	try {
		const {stdout} = await execFileAsync(
			'gcloud',
			['config', 'get-value', 'project'],
			{timeout: 5_000},
		);
		const project = stdout.trim();
		return project && project !== '(unset)' ? project : undefined;
	} catch {
		return undefined;
	}
};

const readConfig = async (): Promise<AuthConfig> => {
	try {
		const content = await fs.readFile(getConfigPath(), 'utf-8');
		return content ? (JSON.parse(content) as AuthConfig) : {};
	} catch (error: unknown) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
		throw error;
	}
};

const saveConfig = async (config: AuthConfig): Promise<void> => {
	await fs.mkdir(path.dirname(getConfigPath()), {recursive: true});
	await fs.writeFile(getConfigPath(), JSON.stringify(config));
};

const defaultModelFor = (provider: string): string =>
	PROVIDERS_MODELS.get(provider)?.find(([priority]) => priority === '0')?.[1] ??
	'';

export const login = async (provider: string, apiKey?: string) => {
	let config;
	config = await readConfig();

	let connection: StoredConnection;
	if (provider === 'Vertex AI') {
		const project =
			process.env['GOOGLE_CLOUD_PROJECT'] ?? (await gcloudProject());
		if (!project) {
			throw new Error(
				'Set GOOGLE_CLOUD_PROJECT or choose a project with gcloud config set project, then run gcloud auth application-default login.',
			);
		}

		connection = {
			type: 'vertex',
			project,
			location: process.env['GOOGLE_CLOUD_LOCATION'] ?? 'global',
		};
	} else {
		if (!apiKey?.trim()) throw new Error(`Enter a ${provider} API key.`);
		connection = {type: 'api', apiKey: apiKey.trim()};
	}

	config = {
		...config,
		[provider]: connection,
		activeProvider: provider,
	};

	await saveConfig(config);

	const defaultModel = defaultModelFor(provider);
	if (defaultModel) setDefaultModel(defaultModel);

	return;
};

export const logout = async (provider: string) => {
	const config = await readConfig();

	delete config[provider];
	if (config.activeProvider === provider) delete config.activeProvider;

	await saveConfig(config);

	return;
};

export const getVertexConnection = async (): Promise<VertexConnection> => {
	const config = await readConfig();
	const connection = config['Vertex AI'];
	if (
		!connection ||
		typeof connection === 'string' ||
		connection.type !== 'vertex'
	) {
		throw new Error('Connect Vertex AI before starting a chat.');
	}
	return {location: connection.location, project: connection.project};
};

export const getActiveProvider = async (): Promise<string | undefined> => {
	const config = await readConfig();
	if (Object.hasOwn(config, 'activeProvider')) {
		return typeof config.activeProvider === 'string'
			? config.activeProvider
			: undefined;
	}

	// Preserve the behaviour of configs saved before activeProvider existed.
	const gemini = config['Gemini'];
	if (gemini && typeof gemini !== 'string' && gemini.type === 'api') {
		return 'Gemini';
	}

	return undefined;
};

export const getApiKey = async (provider: string): Promise<string> => {
	try {
		const config = await readConfig();
		const connection = config[provider];
		const apiKey =
			connection && typeof connection !== 'string' && connection.type === 'api'
				? connection.apiKey
				: undefined;
		if (typeof apiKey !== 'string' || apiKey.length === 0) {
			throw new Error(`Connect ${provider} before starting a chat.`);
		}
		return apiKey;
	} catch (error: any) {
		if (error.code === 'ENOENT')
			throw new Error(`Connect ${provider} before starting a chat.`);
		throw error;
	}
};

export const getConnectedProviders = async (): Promise<
	Record<string, boolean>
> => {
	const config = await readConfig();
	return Object.fromEntries(
		Object.entries(config)
			.filter(([provider]) => provider !== 'activeProvider')
			.map(([provider, value]) => [
				provider,
				Boolean(
					value &&
						typeof value !== 'string' &&
						(value.type === 'api' || value.type === 'vertex'),
				),
			]),
	);
};
