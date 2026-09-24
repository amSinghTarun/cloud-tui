export type UserQuestion = {
	id: string;
	question: string;
};

export type AgentChunk =
	| {type: 'message'; response: string}
	| {type: 'activity'; response: string}
	| {type: 'approval'; response: string; uuid: string}
	| {type: 'input'; response: UserQuestion[]; uuid: string}
	| {type: 'taskList'; response: Array<{id: string; task: string}>}
	| {type: 'taskComplete'; response: string}
	| {type: 'error'; response: string};
