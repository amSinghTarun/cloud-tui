import {FunctionCallingConfigMode, FunctionDeclaration} from '@google/genai';

export const createGeminiGenerationConfig = (
	systemPrompt: string,
	functionDeclarations: FunctionDeclaration[],
	forceWorkspaceMutation?: boolean,
) => {
	return {
		systemInstruction: systemPrompt,
		tools: [{functionDeclarations}],
		toolConfig: {
			functionCallingConfig: {
				mode: forceWorkspaceMutation
					? FunctionCallingConfigMode.ANY
					: FunctionCallingConfigMode.AUTO,
			},
		},
	};
};
