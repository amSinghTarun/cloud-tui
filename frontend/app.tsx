import {randomUUID} from 'node:crypto';
import React, {useEffect, useRef, useState} from 'react';
import {Box, useApp, useInput} from 'ink';
import {PROVIDERS_MODELS} from '../source/config/models';
import {getDefaultModel, type ProjectSession} from '../source/db';
import {
	chat,
	createChatSession,
	getChatTranscript,
	getActiveProvider,
	getConnectedProviders,
	listChatSessions,
	login,
	logout,
	respondToApproval,
	respondToInput,
	selectChatSession,
	setDefault,
} from '../source/services';
import {type UserQuestion} from '../source/types';
import {
	AgentInputPrompt,
	ApprovalPrompt,
	Composer,
	EmptyState,
	Header,
	MessageList,
	SecretInput,
	SelectPanel,
	StatusBar,
} from './components';
import {type AppMode, type ChatMessage, type SelectOption} from './types';

const supportedProviders = ['Gemini', 'Vertex AI'];
const providers = supportedProviders.filter(provider =>
	PROVIDERS_MODELS.has(provider),
);
function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function insertAt(value: string, cursor: number, addition: string) {
	return value.slice(0, cursor) + addition + value.slice(cursor);
}

function removeBefore(value: string, cursor: number) {
	return cursor === 0
		? value
		: value.slice(0, cursor - 1) + value.slice(cursor);
}

function sessionTimestamp(timestamp: number): string {
	return new Date(timestamp).toLocaleString();
}

const helpMessage = `Available commands

/model    Switch the active model
/login    Connect an AI provider
/logout   Remove a saved provider
/status   Show the current session setup
/session  Open a saved session
/clear    Clear the conversation view
/new      Start a fresh local session
/help     Show this command reference`;

type AppProperties = {
	readonly cwd: string;
	readonly projectId: string;
	readonly sessionId: string;
};

type PendingApproval = {command: string; uuid: string};
type PendingInput = {
	answers: Record<string, string>;
	index: number;
	questions: UserQuestion[];
	uuid: string;
};

type MenuKey = {
	downArrow: boolean;
	escape: boolean;
	return: boolean;
	upArrow: boolean;
};

type InputKey = MenuKey & {
	backspace: boolean;
	ctrl: boolean;
	delete: boolean;
	leftArrow: boolean;
	meta: boolean;
	rightArrow: boolean;
};

export default function App({cwd, projectId, sessionId}: AppProperties) {
	const {exit} = useApp();
	const activeRun = useRef<AbortController>();
	const [activeSessionId, setActiveSessionId] = useState(sessionId);
	const [input, setInput] = useState('');
	const [textCursor, setTextCursor] = useState(0);
	const [model, setModel] = useState<string | undefined>(
		() => getDefaultModel() ?? undefined,
	);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [mode, setMode] = useState<AppMode>('input');
	const [menuCursor, setMenuCursor] = useState(0);
	const [apiKey, setApiKey] = useState('');
	const [provider, setProvider] = useState<string>();
	const [activeProvider, setActiveProvider] = useState<string>();
	const [connectedProviders, setConnectedProviders] = useState<
		Record<string, boolean>
	>({});
	const [busy, setBusy] = useState(false);
	const [activity, setActivity] = useState<string>();
	const [pendingApproval, setPendingApproval] = useState<PendingApproval>();
	const [pendingInput, setPendingInput] = useState<PendingInput>();
	const [inputAnswer, setInputAnswer] = useState('');
	const [availableSessions, setAvailableSessions] = useState<ProjectSession[]>(
		[],
	);

	useEffect(() => {
		void Promise.all([
			getConnectedProviders(),
			getActiveProvider(),
			getChatTranscript(sessionId),
		])
			.then(([connections, active, transcript]) => {
				setConnectedProviders(connections);
				setActiveProvider(active);
				setMessages(current =>
					current.length === 0
						? transcript.map(entry => ({...entry, id: randomUUID()}))
						: current,
				);
			})
			.catch(error => {
				setMessages(current => [
					...current,
					{id: randomUUID(), message: errorMessage(error), role: 'error'},
				]);
			});
	}, [sessionId]);

	const modelOptions = (
		PROVIDERS_MODELS.get(activeProvider ?? 'Gemini') ?? []
	).map(([, model]) => ({model, provider: activeProvider ?? 'Gemini'}));
	const configured = Boolean(
		activeProvider && connectedProviders[activeProvider],
	);

	const addMessage = (role: ChatMessage['role'], message: string) => {
		setMessages(current => [...current, {id: randomUUID(), message, role}]);
	};

	const resetInput = () => {
		setInput('');
		setTextCursor(0);
	};

	const returnToInput = () => {
		setMode('input');
		setMenuCursor(0);
	};

	const appendAssistantMessage = (assistantId: string, message: string) => {
		setMessages(current =>
			current.map(entry =>
				entry.id === assistantId
					? {...entry, message: entry.message + message}
					: entry,
			),
		);
	};

	const stopActiveRun = () => {
		const controller = activeRun.current;
		if (!controller || controller.signal.aborted) return;

		setActivity('Stopping…');
		controller.abort();
	};

	const submitPrompt = async (prompt: string) => {
		const assistantId = randomUUID();
		const controller = new AbortController();
		let planMessageId: string | undefined;
		let planTasks: Array<{id: string; task: string}> = [];
		const completedPlanTaskIds = new Set<string>();

		const renderPlan = () =>
			`Plan:\n${planTasks
				.map(
					task =>
						`- ${
							completedPlanTaskIds.has(task.id) ? '[x]' : '[ ]'
						} ${task.id}: ${task.task}`,
				)
				.join('\n')}`;

		const updatePlanMessage = () => {
			if (!planMessageId) return;
			setMessages(current =>
				current.map(entry =>
					entry.id === planMessageId
						? {...entry, message: renderPlan()}
						: entry,
				),
			);
		};

		activeRun.current = controller;
		addMessage('user', prompt);
		setMessages(current => [
			...current,
			{id: assistantId, message: '', role: 'assistant'},
		]);
		setBusy(true);
		setActivity(undefined);

		try {
			const stream = await chat({
				cwd,
				prompt,
				sessionId: activeSessionId,
				signal: controller.signal,
			});

			for await (const chunk of stream) {
				switch (chunk.type) {
					case 'message': {
						appendAssistantMessage(assistantId, chunk.response);
						break;
					}
					case 'activity': {
						setActivity(chunk.response);
						break;
					}
					case 'approval': {
						setActivity('Waiting for your approval');
						setPendingApproval({command: chunk.response, uuid: chunk.uuid});
						break;
					}
					case 'input': {
						setActivity('Waiting for your answer');
						setInputAnswer('');
						setPendingInput({
							answers: {},
							index: 0,
							questions: chunk.response,
							uuid: chunk.uuid,
						});
						break;
					}
					case 'taskList': {
						planTasks = chunk.response;
						const planId = randomUUID();
						planMessageId = planId;
						setMessages(current => {
							const planMessage: ChatMessage = {
								id: planId,
								message: renderPlan(),
								role: 'system',
							};
							const assistantIndex = current.findIndex(
								entry => entry.id === assistantId,
							);
							if (assistantIndex === -1) return [...current, planMessage];
							return [
								...current.slice(0, assistantIndex),
								planMessage,
								...current.slice(assistantIndex),
							];
						});
						break;
					}
					case 'taskComplete': {
						completedPlanTaskIds.add(chunk.response);
						updatePlanMessage();
						break;
					}
					case 'error': {
						setMessages(current =>
							current.filter(entry => entry.id !== assistantId),
						);
						addMessage('error', chunk.response);
						break;
					}
				}
			}
		} catch (error: unknown) {
			setMessages(current => current.filter(entry => entry.id !== assistantId));
			addMessage('error', errorMessage(error));
		} finally {
			setMessages(current =>
				current.filter(
					entry => entry.id !== assistantId || entry.message.length > 0,
				),
			);
			setPendingApproval(undefined);
			setPendingInput(undefined);
			setInputAnswer('');
			if (activeRun.current === controller) activeRun.current = undefined;
			setBusy(false);
			setActivity(undefined);
		}
	};

	const handleCommand = async (command: string): Promise<boolean> => {
		switch (command.toLowerCase()) {
			case '/model': {
				const activeIndex = modelOptions.findIndex(
					option => option.model === model,
				);
				setMenuCursor(Math.max(0, activeIndex));
				setMode('model');
				return true;
			}

			case '/login': {
				setMenuCursor(0);
				setMode('login-provider');
				return true;
			}

			case '/logout': {
				setMenuCursor(0);
				setMode('logout');
				return true;
			}

			case '/help': {
				addMessage('system', helpMessage);
				return true;
			}

			case '/status': {
				addMessage(
					'system',
					`Project ${projectId.slice(0, 8)}\nSession ${activeSessionId.slice(
						0,
						8,
					)}\nProvider: ${activeProvider ?? 'Not configured'}\nModel: ${
						model ?? 'Not configured'
					}\nStorage: Local`,
				);
				return true;
			}

			case '/session': {
				try {
					const sessions = await listChatSessions(cwd);
					if (sessions.length === 0) {
						addMessage(
							'system',
							'There are no saved sessions for this workspace.',
						);
						return true;
					}

					setAvailableSessions(sessions);
					setMenuCursor(
						Math.max(
							0,
							sessions.findIndex(session => session.id === activeSessionId),
						),
					);
					setMode('session');
				} catch (error: unknown) {
					addMessage('error', errorMessage(error));
				}
				return true;
			}

			case '/clear': {
				setMessages([]);
				return true;
			}

			case '/new': {
				const workspace = await createChatSession(cwd, activeSessionId);
				setActiveSessionId(workspace.sessionId);
				setMessages([
					{
						id: randomUUID(),
						message: `Started session ${workspace.sessionId.slice(0, 8)}`,
						role: 'system',
					},
				]);
				return true;
			}

			default: {
				return false;
			}
		}
	};

	const submitInput = async () => {
		const value = input.trim();
		resetInput();

		if (value.length === 0) return;

		if (value.startsWith('/')) {
			if (!(await handleCommand(value))) {
				addMessage(
					'error',
					`Unknown command: ${value}. Use /help to continue.`,
				);
			}
			return;
		}

		await submitPrompt(value);
	};

	const moveMenu = (direction: -1 | 1, length: number) => {
		setMenuCursor(current => (current + direction + length) % length);
	};

	const handleModelMenu = (key: MenuKey) => {
		if (key.upArrow) moveMenu(-1, modelOptions.length);
		else if (key.downArrow) moveMenu(1, modelOptions.length);
		else if (key.return) {
			const selected = modelOptions[menuCursor];
			if (selected) {
				setDefault(selected.model);
				setModel(selected.model);
				addMessage('system', `Model changed to ${selected.model}`);
			}
			returnToInput();
		} else if (key.escape) returnToInput();
	};

	const handleSessionMenu = async (key: MenuKey) => {
		if (key.upArrow) moveMenu(-1, availableSessions.length);
		else if (key.downArrow) moveMenu(1, availableSessions.length);
		else if (key.return) {
			const selected = availableSessions[menuCursor];
			if (!selected) return;

			try {
				const workspace = await selectChatSession(
					cwd,
					selected.id,
					activeSessionId,
				);
				const transcript = await getChatTranscript(workspace.sessionId);
				setActiveSessionId(workspace.sessionId);
				setMessages([
					...transcript.map(entry => ({...entry, id: randomUUID()})),
					{
						id: randomUUID(),
						message: `Opened session ${workspace.sessionId.slice(0, 8)}`,
						role: 'system',
					},
				]);
			} catch (error: unknown) {
				addMessage('error', errorMessage(error));
			}
			returnToInput();
		} else if (key.escape) returnToInput();
	};

	const handleProviderMenu = async (key: MenuKey) => {
		if (key.upArrow) moveMenu(-1, providers.length);
		else if (key.downArrow) moveMenu(1, providers.length);
		else if (key.return) {
			const selected = providers[menuCursor];
			if (!selected) return;
			setProvider(selected);
			if (selected === 'Vertex AI') {
				try {
					await login(selected);
					setActiveProvider(selected);
					setConnectedProviders(current => ({...current, [selected]: true}));
					setModel(PROVIDERS_MODELS.get(selected)?.[0]?.[1]);
					addMessage(
						'system',
						'Vertex AI connected through gcloud credentials',
					);
				} catch (error: unknown) {
					addMessage('error', errorMessage(error));
				}
				returnToInput();
				return;
			}
			setApiKey('');
			setTextCursor(0);
			setMode('login-key');
		} else if (key.escape) returnToInput();
	};

	const handleLogoutMenu = async (key: MenuKey) => {
		if (key.upArrow) moveMenu(-1, providers.length);
		else if (key.downArrow) moveMenu(1, providers.length);
		else if (key.return) {
			const selected = providers[menuCursor];
			if (selected) {
				try {
					await logout(selected);
					setConnectedProviders(current => ({...current, [selected]: false}));
					if (selected === activeProvider) setActiveProvider(undefined);
					addMessage('system', `Disconnected ${selected}`);
				} catch (error: unknown) {
					addMessage('error', errorMessage(error));
				}
			}
			returnToInput();
		} else if (key.escape) returnToInput();
	};

	const handleSecretInput = async (character: string, key: InputKey) => {
		if (key.return) {
			if (provider && apiKey.trim().length > 0) {
				try {
					await login(provider, apiKey);
					setActiveProvider(provider);
					setConnectedProviders(current => ({...current, [provider]: true}));
					addMessage('system', `${provider} connected successfully`);
				} catch (error: unknown) {
					addMessage('error', errorMessage(error));
				}
			}
			setApiKey('');
			setProvider(undefined);
			setTextCursor(0);
			returnToInput();
		} else if (key.escape) {
			setApiKey('');
			setTextCursor(0);
			setMode('login-provider');
		} else if (key.leftArrow) {
			setTextCursor(current => Math.max(0, current - 1));
		} else if (key.rightArrow) {
			setTextCursor(current => Math.min(apiKey.length, current + 1));
		} else if (key.backspace || key.delete) {
			setApiKey(current => removeBefore(current, textCursor));
			setTextCursor(current => Math.max(0, current - 1));
		} else if (character && !key.ctrl && !key.meta) {
			setApiKey(current => insertAt(current, textCursor, character));
			setTextCursor(current => current + character.length);
		}
	};

	const handleApprovalInput = (character: string, key: InputKey) => {
		if (!pendingApproval) return;
		if (key.escape || character.toLowerCase() === 'n') {
			respondToApproval(pendingApproval.uuid, false);
			setPendingApproval(undefined);
			return;
		}
		if (key.return || character.toLowerCase() === 'y') {
			respondToApproval(pendingApproval.uuid, true);
			setPendingApproval(undefined);
		}
	};

	const handleAgentInput = (character: string, key: InputKey) => {
		if (!pendingInput) return;
		if (key.escape) {
			respondToInput(pendingInput.uuid, pendingInput.answers);
			setPendingInput(undefined);
			setInputAnswer('');
			return;
		}
		if (key.return) {
			const question = pendingInput.questions[pendingInput.index];
			if (!question) return;
			const answers = {...pendingInput.answers, [question.id]: inputAnswer};
			if (pendingInput.index + 1 === pendingInput.questions.length) {
				respondToInput(pendingInput.uuid, answers);
				setPendingInput(undefined);
				setInputAnswer('');
				return;
			}
			setPendingInput(current =>
				current ? {...current, answers, index: current.index + 1} : current,
			);
			setInputAnswer('');
			return;
		}
		if (key.backspace || key.delete) {
			setInputAnswer(current => current.slice(0, -1));
		} else if (character && !key.ctrl && !key.meta) {
			setInputAnswer(current => current + character);
		}
	};

	useInput(async (character, key) => {
		if (key.ctrl && character === 'c') {
			if (busy) {
				stopActiveRun();
				return;
			}
			exit();
			return;
		}

		if (pendingApproval) {
			handleApprovalInput(character, key);
			return;
		}
		if (pendingInput) {
			handleAgentInput(character, key);
			return;
		}
		if (mode === 'model') {
			handleModelMenu(key);
			return;
		}
		if (mode === 'session') {
			await handleSessionMenu(key);
			return;
		}
		if (mode === 'login-provider') {
			await handleProviderMenu(key);
			return;
		}
		if (mode === 'logout') {
			await handleLogoutMenu(key);
			return;
		}
		if (mode === 'login-key') {
			await handleSecretInput(character, key);
			return;
		}
		if (busy) return;

		if (key.ctrl && character === 'l') {
			setMessages([]);
			return;
		}
		if (key.return) await submitInput();
		else if (key.leftArrow) setTextCursor(current => Math.max(0, current - 1));
		else if (key.rightArrow)
			setTextCursor(current => Math.min(input.length, current + 1));
		else if (key.backspace || key.delete) {
			setInput(current => removeBefore(current, textCursor));
			setTextCursor(current => Math.max(0, current - 1));
		} else if (character && !key.ctrl && !key.meta) {
			setInput(current => insertAt(current, textCursor, character));
			setTextCursor(current => current + character.length);
		}
	});

	const modelSelectOptions: SelectOption[] = modelOptions.map(option => ({
		badge: option.model === model ? 'ACTIVE' : undefined,
		id: option.model,
		label: option.model,
		meta: option.provider,
	}));
	const providerSelectOptions: SelectOption[] = providers.map(item => ({
		badge: connectedProviders[item] ? 'CONNECTED' : undefined,
		id: item,
		label: item,
		meta: `${PROVIDERS_MODELS.get(item)?.length ?? 0} models`,
	}));
	const sessionSelectOptions: SelectOption[] = availableSessions.map(
		session => ({
			badge: session.id === activeSessionId ? 'ACTIVE' : undefined,
			id: session.id,
			label: session.id,
			meta: `last opened ${sessionTimestamp(session.lastOpenedAt)}`,
		}),
	);

	return (
		<Box flexDirection="column" paddingX={1}>
			<Header configured={configured} model={model} provider={activeProvider} />
			{messages.length === 0 ? (
				<EmptyState />
			) : (
				<MessageList activity={activity} isBusy={busy} messages={messages} />
			)}

			{mode === 'model' && (
				<SelectPanel
					cursor={menuCursor}
					description="Choose the model used for new messages."
					options={modelSelectOptions}
					title="Select model"
				/>
			)}
			{mode === 'session' && (
				<SelectPanel
					cursor={menuCursor}
					description="Choose a saved conversation for this workspace."
					options={sessionSelectOptions}
					title="Open session"
				/>
			)}
			{mode === 'login-provider' && (
				<SelectPanel
					cursor={menuCursor}
					description="Gemini uses an API key. Vertex AI uses your local gcloud Application Default Credentials."
					options={providerSelectOptions}
					title="Connect provider"
				/>
			)}
			{mode === 'logout' && (
				<SelectPanel
					cursor={menuCursor}
					description="Remove locally stored credentials for a provider."
					options={providerSelectOptions}
					title="Disconnect provider"
				/>
			)}
			{mode === 'login-key' && (
				<SecretInput cursor={textCursor} provider={provider} value={apiKey} />
			)}
			{pendingApproval && <ApprovalPrompt command={pendingApproval.command} />}
			{pendingInput && (
				<AgentInputPrompt
					answer={inputAnswer}
					question={pendingInput.questions[pendingInput.index]?.question ?? ''}
					questionNumber={pendingInput.index + 1}
					totalQuestions={pendingInput.questions.length}
				/>
			)}
			{mode === 'input' && !pendingApproval && !pendingInput && (
				<Composer isBusy={busy} cursor={textCursor} value={input} />
			)}
			<StatusBar isBusy={busy} mode={mode} sessionId={activeSessionId} />
		</Box>
	);
}
