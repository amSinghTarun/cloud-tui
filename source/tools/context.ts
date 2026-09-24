import {type FunctionDeclaration} from '@google/genai';
import {AgentTool, type ToolContext, type ToolResult} from '../types/tools';
import {getSessionContextFilePath} from '../helpers';
import {readFileSync} from 'node:fs';

export const contextTools = {
	readContextArtifact: {
		activity: {
			started: 'Reviewing earlier implementation context',
			completed: 'Reviewed earlier implementation context',
		},
		declaration: {
			name: 'readContextArtifact',
			description:
				"Read historical updateFile content archived on the project volume. Accepts only an artifact ID previously included in conversation history. Use readFileContent instead when you need a file's current contents.",
			parametersJsonSchema: {
				type: 'object',
				properties: {
					artifactId: {
						type: 'string',
						description:
							'The 64-character SHA-256 artifact filename ending in .txt.',
					},
				},
				required: ['artifactId'],
			},
		} as FunctionDeclaration,
		// Reads one archived historical payload for the current project only.
		// It derives archive configuration from tool context, validates the artifact ID, then reads its text.
		// Errors are returned as tool responses so Gemini can recover without terminating the agent loop.
		executable: (
			args: {artifactId: string},
			context: ToolContext,
		): ToolResult => {
			try {
				if (!args.artifactId)
					return {
						status: 'error',
						response: 'artifectId is empty',
					};

				const ARTIFACT_ID_PATTERN = /^[a-f0-9]{64}\.txt$/;

				if (!ARTIFACT_ID_PATTERN.test(args.artifactId)) {
					throw new Error('Invalid context artifact ID');
				}

				// get the location and check if file exists
				const artifectPath = getSessionContextFilePath(
					context.sessionId,
					args.artifactId,
				);

				const artifectContent = readFileSync(artifectPath, {encoding: 'utf-8'});
				if (artifectContent == '')
					return {
						status: 'error',
						response: 'The file at artidfectId path is empty',
					};

				// if it does return it
				return {
					status: 'success',
					response: artifectContent,
				};
			} catch (error) {
				return {
					status: 'error',
					response: error,
				};
			}
		},
	},
} satisfies Record<string, AgentTool<any>>;
