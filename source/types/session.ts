import {Content} from '@google/genai';

export type AgentHistory = Content[];

export type SessionConversation = {
	message: Content;
};
