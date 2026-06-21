import {
	GoogleGenAI,
	FunctionCallingConfigMode,
	SendMessageParameters,
	type Content,
} from '@google/genai';
import {fileTools} from '../tools/index.js';
import {getDefaultModel} from '../db/index.js';

export const geminiClient = new GoogleGenAI({
	vertexai: true,
	project: 'project-b955da7b-8f9e-4324-af2',
});

// for those using api-key
// const AI = new GoogleGenAI({
//   apiKey: getApiKey("gemini"),
// });

export const geminiAgent = async (
	prompt: string,
	initialHistory: Content[],
): Promise<{
	textStream: AsyncGenerator<string>;
	finalHistoryPromise: Promise<Content[]>;
}> => {
	const chatSession = geminiClient.chats.create({
		model: getDefaultModel(),
		history: initialHistory,
		config: {
			systemInstruction: `if you are asked to read a file, first use readDirDeclaration tool in recursive mode to find the location of that file and then use the found path 
            to read that file. Give a brief 1 line summary of the task once you are done to give to the user as a closing statment. `,
			toolConfig: {
				functionCallingConfig: {
					mode: FunctionCallingConfigMode.AUTO,
				},
			},
			tools: [
				{
					functionDeclarations: fileTools.map(tool => tool.declaration),
				},
			],
		},
	});

	let currentMessage: SendMessageParameters = {
		message: prompt,
	};
	let newFunctionCallTurn = true;
	let resolveFinalHistory!: (history: Content[]) => void;
	let finalHistoryPromise = new Promise<Content[]>(
		resolve => (resolveFinalHistory = resolve),
	);

	const textStream = (async function* () {
		try {
			while (newFunctionCallTurn) {
				let streamResponse;
				try {
					streamResponse = await chatSession.sendMessageStream(currentMessage);
				} catch (error: any) {
					const errorMessage =
						error.status === 429
							? 'Limit reached, try after a minute'
							: `Error: ${error.message || JSON.stringify(error)}`;
					yield errorMessage;
					newFunctionCallTurn = false;
					break;
				}

				let hasFunctionCallsInThisTurn = false;
				for await (const response of streamResponse!) {
					if (response.functionCalls && response.functionCalls.length > 0) {
						hasFunctionCallsInThisTurn = true;
						const functionCallResponses = response.functionCalls.map(
							functionCall => {
								const tool = fileTools.find(
									t => t.declaration.name === functionCall.name,
								);
								const output = tool
									? tool.executable(functionCall.args as any)
									: 'No such tool exist';
								return {
									functionResponse: {
										...(functionCall.id && {id: functionCall.id}),
										name: functionCall.name,
										response: {
											output,
										},
									},
								};
							},
						);
						currentMessage = {message: functionCallResponses};
						break;
					} else if (response.text) {
						yield response.text;
					}
				}

				if (!hasFunctionCallsInThisTurn) {
					newFunctionCallTurn = false;
				}
			}
		} finally {
			resolveFinalHistory(chatSession.getHistory());
		}
	})();

	return {textStream, finalHistoryPromise};
};
