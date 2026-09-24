import {createGeminiGenerationConfig} from './';
import {GoogleGenAI, type Chat, type Content, type Part} from '@google/genai';
import {
	AgentRunCancelledError,
	abortable,
	throwIfRunCancelled,
	CONTEXT_ARTIFACT_PREFIX,
	TaskPlan,
	SubAgentManager,
	checkpointWorktree,
	getSessionHistory,
	appendSessionHistory,
	replaceSessionHistory,
	storeContextContent,
	storeSessionSummary,
	getSessionSummary,
} from '../helpers';
import {
	type AgentChunk,
	type AgentTool,
	type SubAgentResult,
	type SubAgentRunResult,
} from '../types';
import {toolNames, tools} from '../tools';
import {randomUUID} from 'node:crypto';
import {summariseAgentPrompt, systemPrompt} from '../systemPrompts';

const CONTEXT_COMPACTION_TOKEN_THRESHOLD = 20_000;
const MAX_AGENT_TURNS = 50;
const MAX_TOOL_RESPONSE_CHARACTERS = 24_000;
const MAX_HISTORY_ITEM_CHARACTERS = 64_000;
const MAX_HISTORY_CHARACTERS = 400_000;
const RATE_LIMIT_RETRY_DELAYS_MS = [15_000, 30_000];
const functionDeclarations = Object.values(tools).map(tool => tool.declaration);

type AgentLoopResult = Pick<SubAgentRunResult, 'status' | 'summary'>;

const activityMessage = <T>(
	activity: string | ((args: T) => string),
	args: T,
): string => (typeof activity === 'function' ? activity(args) : activity);

const truncateText = (text: string, maximumLength: number): string =>
	text.length > maximumLength
		? `${text.slice(0, maximumLength)}\n\n[Output truncated after ${maximumLength} characters.]`
		: text;

const serialiseToolResponse = (value: unknown): unknown => {
	const serialisableValue =
		value instanceof Error
			? {name: value.name, message: value.message}
			: value;

	if (typeof serialisableValue === 'string') {
		return truncateText(serialisableValue, MAX_TOOL_RESPONSE_CHARACTERS);
	}

	try {
		const json = JSON.stringify(serialisableValue);
		if (json.length > MAX_TOOL_RESPONSE_CHARACTERS) {
			return {
				truncated: true,
				preview: truncateText(json, MAX_TOOL_RESPONSE_CHARACTERS),
				message:
					'Tool output was truncated before it was added to the conversation. Use a narrower tool request if more detail is needed.',
			};
		}

		return JSON.parse(json);
	} catch {
		return truncateText(String(serialisableValue), MAX_TOOL_RESPONSE_CHARACTERS);
	}
};

const contentSize = (content: Content): number => {
	try {
		return JSON.stringify(content).length;
	} catch {
		return MAX_HISTORY_ITEM_CHARACTERS + 1;
	}
};

const omittedHistoryContent = (content: Content): Content => ({
	role: content.role,
	parts: [
		{
			text: '[This oversized earlier conversation turn was omitted to keep the session within the model context limit.]',
		},
	],
});

const normaliseHistory = (
	history: Content[],
): {changed: boolean; history: Content[]} => {
	let changed = false;
	let usableHistory = history.map(content => {
		if (contentSize(content) <= MAX_HISTORY_ITEM_CHARACTERS) return content;
		changed = true;
		return omittedHistoryContent(content);
	});

	let totalSize = usableHistory.reduce(
		(total, content) => total + contentSize(content),
		0,
	);
	let startIndex = 0;
	while (totalSize > MAX_HISTORY_CHARACTERS && startIndex < usableHistory.length) {
		totalSize -= contentSize(usableHistory[startIndex]!);
		startIndex++;
		changed = true;
	}

	// Gemini chat histories should begin with a user turn. Drop one additional
	// leading model turn if trimming split a user/model pair.
	if (startIndex > 0 && usableHistory[startIndex]?.role === 'model') {
		startIndex++;
		changed = true;
	}

	if (startIndex > 0) usableHistory = usableHistory.slice(startIndex);
	return {changed, history: usableHistory};
};

const isRateLimitError = (error: unknown): boolean => {
	if (typeof error !== 'object' || error === null) return false;
	const candidate = error as {message?: unknown; status?: unknown; code?: unknown};
	return (
		candidate.status === 429 ||
		candidate.code === 429 ||
		(typeof candidate.message === 'string' &&
			candidate.message.toLowerCase().includes('rate limit'))
	);
};

const subAgentResultsMessage = (results: SubAgentResult[]): string =>
	JSON.stringify({subAgentResults: results});

type GeminiSessionState = {
	chat: Chat;
	genAI: GoogleGenAI;
	systemPrompt: string;
	contextCount: number;
	summary: string;
	model: string;
	auth: GeminiAuth;
	cwd: string;
	projectId: string;
	persistedHistoryLength: number;
};

export type GeminiAuth =
	| {apiKey: string; type: 'api-key'}
	| {location: string; project: string; type: 'vertex'};

export type OpenGeminiSessionOptions = {
	projectId: string;
	sessionId: string;
	cwd: string;
	model: string;
	auth: GeminiAuth;
	customSystemPrompt?: string;
	summary?: string;
	history?: Content[];
	contextCount?: number;
};

export class GeminiAgent {
	private static session: Record<string, GeminiSessionState> = {};
	private sessionId: string;

	private constructor(sessionId: string) {
		this.sessionId = sessionId;
	}

	public static open = async (
		options: OpenGeminiSessionOptions,
	): Promise<GeminiAgent> => {
		const existing = GeminiAgent.session[options.sessionId];
		const replacesHistory = options.history !== undefined;

		if (existing && !replacesHistory) {
			if (existing.projectId !== options.projectId) {
				throw new Error('Gemini session belongs to a different project.');
			}
			return new GeminiAgent(options.sessionId);
		}

		const storedHistory =
			options.history ?? (await getSessionHistory(options.sessionId)) ?? [];
		const {history, changed: historyWasRepaired} =
			normaliseHistory(storedHistory);
		if (replacesHistory || historyWasRepaired) {
			await replaceSessionHistory(history, options.sessionId);
		}

		const summary =
			options.summary ?? (await getSessionSummary(options.sessionId));
		const activeSystemPrompt = options.customSystemPrompt ?? systemPrompt;
		const genAI =
			options.auth.type === 'vertex'
				? new GoogleGenAI({
						vertexai: true,
						project: options.auth.project,
						location: options.auth.location,
				  })
				: new GoogleGenAI({apiKey: options.auth.apiKey});

		GeminiAgent.session[options.sessionId] = {
			genAI,
			chat: genAI.chats.create({
				model: options.model,
				history,
				config: createGeminiGenerationConfig(
					activeSystemPrompt,
					functionDeclarations,
				),
			}),
			systemPrompt: activeSystemPrompt,
			cwd: options.cwd,
			contextCount: options.contextCount ?? 0,
			summary,
			model: options.model,
			auth: options.auth,
			projectId: options.projectId,
			persistedHistoryLength: history.length,
		};

		return new GeminiAgent(options.sessionId);
	};

	public static close = (sessionId: string): void => {
		delete GeminiAgent.session[sessionId];
	};

	private getSession = () => {
		const session = GeminiAgent.session[this.sessionId];
		if (!session) throw new Error('Gemini session is unavailable');
		return session;
	};

	private repairSessionHistoryIfNeeded = async (): Promise<void> => {
		const session = this.getSession();
		const currentHistory = session.chat.getHistory(true);
		const {history, changed} = normaliseHistory(currentHistory);
		if (!changed) return;

		await replaceSessionHistory(history, this.sessionId);
		session.chat = session.genAI.chats.create({
			model: session.model,
			history,
			config: createGeminiGenerationConfig(
				session.systemPrompt,
				functionDeclarations,
			),
		});
		session.persistedHistoryLength = history.length;
	};

	private sendMessageWithRateLimitRetry = async (
		message: Part[],
		forceWorkspaceMutation: boolean,
		signal: AbortSignal | undefined,
		onRetry: (message: string) => void,
	) => {
		const session = this.getSession();
		for (const [attempt, delay] of RATE_LIMIT_RETRY_DELAYS_MS.entries()) {
			try {
				return await abortable(
					session.chat.sendMessage({
						message,
						config: createGeminiGenerationConfig(
							session.systemPrompt,
							functionDeclarations,
							forceWorkspaceMutation,
						),
					}),
					signal,
				);
			} catch (error) {
				if (!isRateLimitError(error)) throw error;
				onRetry(
					`Vertex AI rate limit reached. Retrying in ${delay / 1000} seconds (${attempt + 1}/${RATE_LIMIT_RETRY_DELAYS_MS.length})…`,
				);
				await abortable(
					new Promise<void>(resolve => setTimeout(resolve, delay)),
					signal,
				);
			}
		}

		return abortable(
			session.chat.sendMessage({
				message,
				config: createGeminiGenerationConfig(
					session.systemPrompt,
					functionDeclarations,
					forceWorkspaceMutation,
				),
			}),
			signal,
		);
	};

	private compactSessionIfNeeded = async (history: Content[]) => {
		let summary = undefined;
		let contextualisedHistory = undefined;

		try {
			const session = this.getSession();
			if (history.length == 0) return;

			const sessionTokens = await session.genAI.models.countTokens({
				model: session.model,
				contents: history,
			});

			const tokenCount = sessionTokens.totalTokens ?? 0;

			if (tokenCount <= CONTEXT_COMPACTION_TOKEN_THRESHOLD) {
				return;
			}

			// if >=3 summarise
			// if <3 contextualise - store the context files in session context path
			if (session.contextCount >= 3) {
				summary = await this.summariseChat(history);
				contextualisedHistory = [
					{
						role: 'user',
						parts: [
							{
								text: `Conversation summary from earlier in this session:\n${summary}`,
							},
						],
					},
				];
			} else contextualisedHistory = await this.contextualiseChat(history);

			// create and update new session based on context/summary
			await GeminiAgent.open({
				projectId: session.projectId,
				sessionId: this.sessionId,
				cwd: session.cwd,
				model: session.model,
				auth: session.auth,
				customSystemPrompt: session.systemPrompt,
				summary,
				history: contextualisedHistory,
				contextCount: session.contextCount,
			});
		} catch (error) {
			throw error;
		}
	};

	private persistNewHistory = async (): Promise<void> => {
		const session = this.getSession();
		const history = session.chat.getHistory(true);
		const newContents = history.slice(session.persistedHistoryLength);

		await appendSessionHistory(newContents, this.sessionId);
		session.persistedHistoryLength = history.length;
	};

	private summariseChat = async (history: Content[]) => {
		try {
			const session = this.getSession();
			const summariseAgent = session.genAI.chats.create({
				model: session.model,
				config: {
					systemInstruction: summariseAgentPrompt,
				},
			});

			const response = await summariseAgent.sendMessage({
				message: JSON.stringify({
					previousSummary: session.summary || null,
					recentHistory: history,
				}),
			});

			const summary = response.text ?? 'Unable to summarize previous context.';

			if (response.text) {
				await storeSessionSummary(this.sessionId, response.text);
			}

			return summary;
		} catch (error) {
			throw error;
		}
	};

	private contextualiseChat = async (history: Content[]) => {
		try {
			const session = this.getSession();
			session.contextCount++;
			let maxLength: number = 150;
			let historyClone = structuredClone(history);
			let fileUniqueIdentifier = 0;
			for (let message of historyClone) {
				if (message.role == 'user' || !message.parts) continue;

				for (let part of message.parts) {
					if (part.functionCall?.name !== 'updateFile') continue;

					const args = part.functionCall.args;
					let content = args?.['content'];
					if (
						typeof content !== 'string' ||
						content.length <= maxLength ||
						content.includes(CONTEXT_ARTIFACT_PREFIX)
					)
						continue;

					const filename = `${Date.now()}_${++fileUniqueIdentifier}`;
					const filePath =
						typeof args?.['filePath'] === 'string'
							? args?.['filePath']
							: 'the target file';

					args![
						'content'
					] = `{CONTEXT_ARTIFACT_PREFIX}:${filename}] The previous full updateFile content for ${filePath} is archived on the project volume. Call readContextArtifact with this artifactId only if the historical content is needed. Call readFileContent for the file's current contents. Never use this reference as file content.`;

					// store the context on session - context path
					await storeContextContent(this.sessionId, `${filename}.txt`, content);
				}
			}
			return historyClone;
		} catch (error) {
			throw error;
		}
	};

	public async agentSync() {}

	public async *agentAsync(
		prompt: string,
		signal: AbortSignal,
	): AsyncGenerator<AgentChunk> {
		let controller!: ReadableStreamDefaultController<AgentChunk>;
		let stream = new ReadableStream<AgentChunk>({
			start(value) {
				controller = value;
			},
		});

		let reader = stream.getReader();

		const onChunk = (message: AgentChunk) => {
			controller.enqueue(message);
		};
		const onClose = () => {
			controller.close();
		};

		void this.agentLoop('1', prompt, {onChunk, onClose}, signal).catch(
			error => {
				controller.error(error);
			},
		);

		while (true) {
			const {done, value} = await reader.read();
			if (done) {
				return;
			}
			yield value;
		}
	}

	private agentLoop = async (
		id: string,
		prompt: string,
		handler: {onChunk: (message: AgentChunk) => void; onClose: () => void},
		signal?: AbortSignal,
	): Promise<AgentLoopResult> => {
		let shouldContinue = true;
		const forceWorkspaceMutation = false;
		let taskPlan = new TaskPlan();
		let agentNewMessage: Part[] = [{text: prompt}];
		let modelResponseText = '';
		const session = this.getSession();
		const runId = randomUUID();
		const subAgentManager = new SubAgentManager();
		let turns = 0;
		let promptedForRemainingTasks = false;
		let promptedForFinalResponse = false;

		const checkpointBeforeIntegration = async () => {
			await checkpointWorktree({
				worktreePath: session.cwd,
				message: `Main agent checkpoint before merging sub-agent work for run ${runId}`,
				signal,
			});
		};

		const startSubAgentArgs = {
			projectId: session.projectId,
			parentRunId: runId,
			parentAgentId: id,
			signal,
			run: async (
				args: {
					id: string;
					prompt: string;
					cwd: string;
					systemPrompt?: string;
				},
				childSignal?: AbortSignal,
			): Promise<SubAgentRunResult> => {
				const subAgentSessionId = randomUUID();
				const subAgent = await GeminiAgent.open({
					projectId: session.projectId,
					sessionId: subAgentSessionId,
					cwd: args.cwd,
					model: session.model,
					auth: session.auth,
					customSystemPrompt: args.systemPrompt,
					history: [],
				});

				try {
					const result = await subAgent.agentLoop(
						args.id,
						args.prompt,
						{
							onChunk: handler.onChunk,
							onClose: () => undefined,
						},
						childSignal,
					);
					return {id: args.id, ...result};
				} finally {
					delete GeminiAgent.session[subAgentSessionId];
				}
			},
			dispose: () => undefined,
			onConflict: ({
				id: subAgentId,
				attempt,
				conflictingFiles,
			}: {
				id: string;
				attempt: number;
				conflictingFiles: string[];
			}) => {
				handler.onChunk({
					type: 'activity',
					response: `Sub-agent ${subAgentId} is resolving merge conflicts (attempt ${attempt}): ${
						conflictingFiles.join(', ') || 'unknown files'
					}`,
				});
			},
		};

		try {
			while (shouldContinue) {
				throwIfRunCancelled(signal);
				await this.repairSessionHistoryIfNeeded();
				if (++turns > MAX_AGENT_TURNS) {
					throw new Error(
						`Stopped after ${MAX_AGENT_TURNS} model turns to prevent an agent loop.`,
					);
				}

				const modelResponse = await this.sendMessageWithRateLimitRetry(
					agentNewMessage,
					forceWorkspaceMutation,
					signal,
					message => handler.onChunk({type: 'activity', response: message}),
				);

				const functionCalls = modelResponse.functionCalls ?? [];
				const inlineResponseText = (modelResponse.candidates ?? [])
					.flatMap(candidate => candidate.content?.parts ?? [])
					.map(part => part.text ?? '')
					.join('')
					.trim();
				if (inlineResponseText) {
					modelResponseText = inlineResponseText;
				} else if (functionCalls.length === 0) {
					modelResponseText = modelResponse.text ?? modelResponseText;
				}
				await this.persistNewHistory();

				let toolCallResponse: Part[] = [];

				for (const functionCall of functionCalls) {
					throwIfRunCancelled(signal);
					const fncToolName = functionCall.name;
					const toolArgs = functionCall.args ?? {};
					if (!fncToolName || !toolNames.has(fncToolName)) {
						toolCallResponse.push({
							functionResponse: {
								id: functionCall.id,
								name: fncToolName ?? 'unknown',
								response: {
									error: !fncToolName
										? 'Tool name was not provided.'
										: `No tool exists with the name ${fncToolName}.`,
								},
							},
						});
						continue;
					}

					const tool = tools[
						fncToolName as keyof typeof tools
					] as AgentTool<any>;
					handler.onChunk({
						type: 'activity',
						response: activityMessage(tool.activity.started, toolArgs),
					});

					let toolResult;
					try {
						toolResult = await tool.executable(toolArgs, {
							agentId: id,
							agentRunId: runId,
							cwd: session.cwd,
							sendToUser: handler.onChunk,
							sessionId: this.sessionId,
							taskList: taskPlan,
							signal,
							subAgentManager,
							startSubAgentArgs,
						});

						if (toolResult.yield) {
							handler.onChunk(toolResult.yield.output);
							if (toolResult.yield.resolver) {
								toolResult.response = await toolResult.yield.resolver;
							}
						}
					} catch (error) {
						if (signal?.aborted) throw new AgentRunCancelledError();
						toolResult = {
							status: 'error' as const,
							response: serialiseToolResponse(error),
						};
					}

					handler.onChunk({
						type: 'activity',
						response: activityMessage(tool.activity.completed, toolArgs),
					});

					toolCallResponse.push({
						functionResponse: {
							id: functionCall.id,
							name: fncToolName,
							response: {
								output: {
									status: toolResult.status,
									response: serialiseToolResponse(toolResult.response),
								},
							},
						},
					});
				}

				if (toolCallResponse.length > 0) {
					const completedSubAgents = await subAgentManager.collectRun(
						'ready',
						checkpointBeforeIntegration,
					);
					agentNewMessage = [
						...toolCallResponse,
						...(completedSubAgents.length > 0
							? [{text: subAgentResultsMessage(completedSubAgents)}]
							: []),
					];
					shouldContinue = true;
					continue;
				}

				const completedSubAgents = await subAgentManager.collectRun(
					'all',
					checkpointBeforeIntegration,
				);
				const followUpParts: Part[] = [];

				if (completedSubAgents.length > 0) {
					followUpParts.push({
						text: subAgentResultsMessage(completedSubAgents),
					});
				}

				if (taskPlan.hasIncompleteTasks() && !promptedForRemainingTasks) {
					promptedForRemainingTasks = true;
					followUpParts.push({
						text: `The active plan still has incomplete task IDs: ${taskPlan
							.remainingTaskIds()
							.join(
								', ',
							)}. Continue the work or mark completed tasks with informCompletedTaskFromTaskPlan before giving the final answer.`,
					});
				}

				if (followUpParts.length > 0) {
					agentNewMessage = followUpParts;
					shouldContinue = true;
					continue;
				}

				if (
					taskPlan.taskList.size > 0 &&
					!modelResponseText.trim() &&
					!promptedForFinalResponse
				) {
					promptedForFinalResponse = true;
					agentNewMessage = [
						{
							text: 'The plan is complete. Now provide the user-facing final response in plain text, based only on the tool results you collected. Do not call any more tools.',
						},
					];
					shouldContinue = true;
					continue;
				}

				shouldContinue = false;
			}

			const finalResponse = modelResponseText.trim();
			if (finalResponse) {
				handler.onChunk({type: 'message', response: finalResponse});
			}

			await this.compactSessionIfNeeded(session.chat.getHistory(true));
			return {status: 'SUCCEEDED', summary: finalResponse};
		} catch (error: any) {
			await subAgentManager.clearRun();
			if (error instanceof AgentRunCancelledError || signal?.aborted) {
				handler.onChunk({
					type: 'message',
					response: 'Generation stopped by user.',
				});
				return {status: 'CANCELLED', summary: 'Generation stopped by user.'};
			}

			const errorMessage =
				error?.status === 429
					? 'Limit reached, try again in a minute.'
					: `Error: ${error?.message ?? String(error)}`;
			handler.onChunk({type: 'error', response: errorMessage});
			return {status: 'FAILED', summary: errorMessage};
		} finally {
			handler.onClose();
		}
	};
}
