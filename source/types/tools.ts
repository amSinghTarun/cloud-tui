import {FunctionDeclaration} from '@google/genai';
import {SubAgentManager, TaskPlan} from '../helpers';
import {AgentChunk} from './agent';
import {StartSubAgentArgs} from './subAgentRegistry';

export type StartSubAgentContext = Omit<
	StartSubAgentArgs,
	'id' | 'initialPrompt' | 'systemPrompt' | 'worktree'
>;

export type ToolContext = {
	cwd: string;
	agentId: string;
	taskList: TaskPlan;
	agentRunId: string;
	sessionId: string;
	sendToUser: (message: AgentChunk) => void;
	signal?: AbortSignal;
	subAgentManager?: SubAgentManager;
	startSubAgentArgs?: StartSubAgentContext;
};

export type ToolResult = {
	status: 'success' | 'error';
	response: unknown;
	yield?: {
		output: AgentChunk;
		resolver?: Promise<unknown>;
	};
};

export type AgentTool<TArgs = Record<string, unknown>> = {
	activity: {
		started: string | ((args: TArgs) => string);
		completed: string | ((args: TArgs) => string);
	};
	declaration: FunctionDeclaration;
	executable: (
		args: TArgs,
		context: ToolContext,
	) => ToolResult | Promise<ToolResult>;
};
