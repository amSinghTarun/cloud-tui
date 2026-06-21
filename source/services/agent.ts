import {
	getSessionHistory,
	createSessionHistory,
	setSessionHistory,
	verifyProviderAndLogin,
} from '../helpers/index.js';
import {geminiAgent} from '../providers/index.js';

import {Content} from '@google/genai';

export const chat = async (
	message: string,
	sessionId: string,
): Promise<{
	stream: AsyncGenerator<string>;
	finalHistoryPromise: Promise<Content[]>;
}> => {
	try {
		if (!verifyProviderAndLogin())
			throw new Error(
				'Login with a provider first to use the app. P.S if not set, also set a default model',
			);

		let history = await getSessionHistory(sessionId);
		if (!history) {
			history = await createSessionHistory(sessionId, message);
		}

		const {textStream, finalHistoryPromise} = await geminiAgent(
			message,
			history.history,
		);

		finalHistoryPromise
			.then(async finalHistory => {
				await setSessionHistory(finalHistory, sessionId);
			})
			.catch(error => {
				console.error('Error saving session history:', error);
			});

		return {stream: textStream, finalHistoryPromise};
	} catch (error: any) {
		throw error;
	}
};
