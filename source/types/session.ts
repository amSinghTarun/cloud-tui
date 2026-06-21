import {type Content} from '@google/genai';
export type SessionHistory = {
	initialPrompt: string;
	history: Content[];
	sessionId: string;
};
