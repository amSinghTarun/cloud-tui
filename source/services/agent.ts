import {getDefaultModel, type ProjectSession} from '../db';
import {GeminiAgent} from '../providers';
import {answerApproval, answerInput} from '../helpers';
import {getSessionHistory} from '../helpers/session';
import {AgentChunk} from '../types';
import {getActiveProvider, getApiKey, getVertexConnection} from './auth';
import {
	createWorkspaceSession,
	listWorkspaceSessions,
	restoreWorkspaceSession,
	WorkspaceSession,
} from './project';

type ChatOptions = {
	cwd: string;
	prompt: string;
	sessionId: string;
	signal: AbortSignal;
};

export type RestoredChatMessage = {
	message: string;
	role: 'assistant' | 'user';
};

const isGeminiModel = (model: string): boolean =>
	model.toLowerCase().startsWith('gemini-');

export const openChatSession = async (
	cwd: string,
	sessionId?: string,
): Promise<WorkspaceSession> => restoreWorkspaceSession(cwd, sessionId);

export const createChatSession = async (
	cwd: string,
	previousSessionId?: string,
): Promise<WorkspaceSession> => {
	if (previousSessionId) GeminiAgent.close(previousSessionId);
	return createWorkspaceSession(cwd);
};

export const listChatSessions = async (
	cwd: string,
): Promise<ProjectSession[]> => listWorkspaceSessions(cwd);

export const selectChatSession = async (
	cwd: string,
	sessionId: string,
	previousSessionId?: string,
): Promise<WorkspaceSession> => {
	const workspace = await restoreWorkspaceSession(cwd, sessionId);
	if (previousSessionId && previousSessionId !== workspace.sessionId) {
		GeminiAgent.close(previousSessionId);
	}
	return workspace;
};

export const getChatTranscript = async (
	sessionId: string,
): Promise<RestoredChatMessage[]> => {
	const history = (await getSessionHistory(sessionId)) ?? [];

	return history.flatMap(content => {
		const message =
			content.parts
				?.flatMap(part => (typeof part.text === 'string' ? [part.text] : []))
				.join('')
				.trim() ?? '';

		if (!message || message.startsWith('Conversation summary from earlier')) {
			return [];
		}

		return [
			{
				message,
				role: content.role === 'model' ? 'assistant' : 'user',
			},
		];
	});
};

export const chat = async ({
	cwd,
	prompt,
	sessionId,
	signal,
}: ChatOptions): Promise<AsyncGenerator<AgentChunk>> => {
	const workspace = await openChatSession(cwd, sessionId);
	const model = getDefaultModel();
	if (!model) {
		throw new Error(
			'Select a Gemini model and connect Gemini before starting a chat.',
		);
	}
	if (!isGeminiModel(model)) {
		throw new Error(
			`The selected model ${model} is not supported yet. Only Gemini is available.`,
		);
	}

	const provider = await getActiveProvider();
	if (!provider) {
		throw new Error('Connect Gemini or Vertex AI before starting a chat.');
	}

	const auth =
		provider === 'Vertex AI'
			? {type: 'vertex' as const, ...(await getVertexConnection())}
			: {type: 'api-key' as const, apiKey: await getApiKey(provider)};
	const agent = await GeminiAgent.open({
		projectId: workspace.projectId,
		sessionId: workspace.sessionId,
		cwd: workspace.canonicalPath,
		model,
		auth,
	});

	return agent.agentAsync(prompt, signal);
};

export const respondToApproval = (
	requestId: string,
	approved: boolean,
): void => {
	answerApproval(requestId, approved);
};

export const respondToInput = (
	requestId: string,
	answers: Record<string, string>,
): void => {
	answerInput(requestId, answers);
};
