import React from 'react';
import {Box, Spacer, Text} from 'ink';
import {theme} from '../theme';

type ComposerProperties = {
	readonly cursor: number;
	readonly isBusy: boolean;
	readonly value: string;
};

export function Composer({cursor, isBusy, value}: ComposerProperties) {
	return (
		<Box flexDirection="column">
			<Box paddingX={1}>
				<Text bold color={theme.accent}>
					MESSAGE
				</Text>
			</Box>
			<Box
				borderColor={isBusy ? theme.muted : theme.accent}
				borderStyle="round"
				paddingX={1}
			>
				<Text bold color={theme.accent}>
					❯{' '}
				</Text>
				{isBusy || value.length === 0 ? (
					<>
						{!isBusy && <Text inverse> </Text>}
						<Text color={theme.muted}> Type a message or /help</Text>
					</>
				) : (
					<>
						<Text>{value.slice(0, cursor)}</Text>
						<Text inverse>{value.slice(cursor, cursor + 1) || ' '}</Text>
						<Text>{value.slice(cursor + 1)}</Text>
					</>
				)}
				{isBusy && (
					<>
						<Spacer />
						<Text bold backgroundColor={theme.danger} color={theme.ink}>
							■ STOP
						</Text>
						<Text dimColor> Ctrl+C</Text>
					</>
				)}
			</Box>
		</Box>
	);
}

type SecretInputProperties = {
	readonly cursor: number;
	readonly provider?: string;
	readonly value: string;
};

export function SecretInput({cursor, provider, value}: SecretInputProperties) {
	const maskedValue = '•'.repeat(value.length);

	return (
		<Box
			borderColor={theme.accent}
			borderStyle="round"
			flexDirection="column"
			paddingX={2}
			paddingY={1}
		>
			<Box>
				<Text bold backgroundColor={theme.accent} color={theme.ink}>
					🔒 SECURE CONNECTION{' '}
				</Text>
			</Box>
			<Text bold color={theme.text}>
				Connect {provider ?? 'provider'}
			</Text>
			<Text color={theme.muted}>
				Your API key is stored locally and hidden while typing.
			</Text>

			<Box marginTop={1}>
				<Text bold color={theme.accent}>
					key ❯{' '}
				</Text>
				<Text>{maskedValue.slice(0, cursor)}</Text>
				<Text inverse>{maskedValue.slice(cursor, cursor + 1) || ' '}</Text>
				<Text>{maskedValue.slice(cursor + 1)}</Text>
			</Box>

			<Box marginTop={1}>
				<Text dimColor>enter save · esc back</Text>
			</Box>
		</Box>
	);
}

type ApprovalPromptProperties = {
	readonly command: string;
};

export function ApprovalPrompt({command}: ApprovalPromptProperties) {
	return (
		<Box
			borderColor={theme.warning}
			borderStyle="round"
			flexDirection="column"
			paddingX={2}
			paddingY={1}
		>
			<Text bold color={theme.warning}>
				APPROVAL REQUIRED
			</Text>
			<Text>{command}</Text>
			<Text dimColor>y / enter approve · n / esc reject</Text>
		</Box>
	);
}

type AgentInputPromptProperties = {
	readonly answer: string;
	readonly question: string;
	readonly questionNumber: number;
	readonly totalQuestions: number;
};

export function AgentInputPrompt({
	answer,
	question,
	questionNumber,
	totalQuestions,
}: AgentInputPromptProperties) {
	return (
		<Box
			borderColor={theme.assistant}
			borderStyle="round"
			flexDirection="column"
			paddingX={2}
			paddingY={1}
		>
			<Text bold color={theme.assistant}>
				QUESTION {questionNumber}/{totalQuestions}
			</Text>
			<Text>{question}</Text>
			<Box marginTop={1}>
				<Text bold color={theme.accent}>
					❯{' '}
				</Text>
				<Text>{answer}</Text>
				<Text inverse> </Text>
			</Box>
			<Text dimColor>enter continue · esc submit collected answers</Text>
		</Box>
	);
}
