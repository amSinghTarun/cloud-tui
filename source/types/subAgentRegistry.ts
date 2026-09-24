export type SubAgentResult =
	| {
			id: string;
			status: 'MERGED';
			summary: string;
			cleanupWarning?: string;
	  }
	| {
			id: string;
			status: 'ERROR';
			error: string;
	  }
	| {
			id: string;
			status: 'MERGE_CONFLICT';
			error: string;
			branchName: string;
			worktreePath: string;
			conflictingFiles: string[];
			gitStatus: string;
	  };

export type PreparedSubAgent = {
	id: string;
	status: 'READY';
	integrate: () => Promise<SubAgentResult>;
	discard: () => Promise<void>;
};

export type SubAgentErrorResult = Extract<SubAgentResult, {status: 'ERROR'}>;

export type SubAgentPreparation = PreparedSubAgent | SubAgentResult;

type ConversationRunStatus =
	| 'BLOCKED'
	| 'CANCELLED'
	| 'FAILED'
	| 'RUNNING'
	| 'SUCCEEDED';

export type SubAgentRunResult = {
	id: string;
	status: ConversationRunStatus;
	summary: string;
};

export type SubAgentEntry = {
	id: string;
	preparation: Promise<SubAgentPreparation>;
	prepared?: SubAgentPreparation;
	completion?: Promise<SubAgentResult>;
	result?: SubAgentResult;
	notified: boolean;
	onSettled?: (result: SubAgentResult) => void;
};

export type StartSubAgentArgs = {
	id: string;
	projectId: string;
	parentRunId: string;
	parentAgentId: string;
	initialPrompt: string;
	systemPrompt?: string;
	worktree: SubAgentWorktree;
	signal?: AbortSignal;
	run: (
		args: {
			id: string;
			prompt: string;
			cwd: string;
			systemPrompt?: string;
		},
		signal?: AbortSignal,
	) => Promise<SubAgentRunResult>;
	dispose: () => void;
	onConflict: (args: {
		id: string;
		attempt: number;
		conflictingFiles: string[];
	}) => void;
	onSettled?: (result: SubAgentResult) => void;
};

export type SubAgentWorktree = {
	branchName: string;
	worktreePath: string;
	targetBranch: string;
	mainWorktreePath: string;
};

export type MergeResult =
	| {status: 'MERGED'; cleanupWarning?: string}
	| {
			status: 'MERGE_CONFLICT';
			error: string;
			branchName: string;
			worktreePath: string;
			conflictingFiles: string[];
			gitStatus: string;
	  };

export type MergeConflictResult = Extract<
	MergeResult,
	{status: 'MERGE_CONFLICT'}
>;
