export type AppMode =
	| 'input'
	| 'model'
	| 'session'
	| 'login-provider'
	| 'login-key'
	| 'logout';

export type MessageRole = 'user' | 'assistant' | 'system' | 'error';

export type ChatMessage = {
	id: string;
	message: string;
	role: MessageRole;
};

export type SelectOption = {
	badge?: string;
	id: string;
	label: string;
	meta?: string;
};
