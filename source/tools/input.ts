import {type FunctionDeclaration} from '@google/genai';
import {randomUUID} from 'node:crypto';
import {AgentTool, ToolContext, ToolResult, UserQuestion} from '../types';
import {seekInput} from '../helpers';

export const inputTools = {
	takeUserInput: {
		activity: {
			started: 'Preparing a question for you',
			completed: 'Prepared a question for you',
		},
		declaration: {
			name: 'takeUserInput',
			description:
				'Ask for a missing material product decision or required secret only. Never use this for browser, console, build, log, toolchain, or other diagnostics the agent can inspect itself.',
			parametersJsonSchema: {
				type: 'object',
				properties: {
					questions: {
						type: 'array',
						description: 'array of id and question maps',
						items: {
							type: 'object',
							properties: {
								id: {
									type: 'string',
									description: 'Id of the question you want to ask to the user',
								},
								question: {
									type: 'string',
									description:
										'The actual question you want to ask to the user',
								},
							},
							required: ['id', 'question'],
						},
					},
				},
				required: ['questions'],
			},
		} as FunctionDeclaration,
		executable: async (
			args: {questions: UserQuestion[]},
			context: ToolContext,
		): Promise<ToolResult> => {
			if (!Array.isArray(args.questions) || args.questions.length === 0)
				return {status: 'error', response: 'Question is not provided'};
			try {
				const uuid = randomUUID();
				return {
					status: 'success',
					response: 'Asking question from the user',
					yield: {
						output: {
							type: 'input',
							uuid: uuid,
							response: args.questions,
						},
						resolver: seekInput<Record<string, string>>(uuid, context.signal),
					},
				};
			} catch (error) {
				return {status: 'error', response: error};
			}
		},
	},
} satisfies Record<string, AgentTool<any>>;
