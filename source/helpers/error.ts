export class AgentRunCancelledError extends Error {
	public constructor() {
		super('Generation stopped by user');
		this.name = 'AgentRunCancelledError';
	}
}

export class AgentToolError extends Error {
	public constructor(error: string) {
		super(error);
		this.name = 'AgentToolError';
	}
}
