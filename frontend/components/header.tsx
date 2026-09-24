import React from 'react';
import {Box, Spacer, Text} from 'ink';
import {theme} from '../theme';

type HeaderProperties = {
	readonly configured: boolean;
	readonly model?: string;
	readonly provider?: string;
};

export function Header({configured, model, provider}: HeaderProperties) {
	return (
		<Box
			borderColor={theme.accent}
			borderStyle="round"
			flexDirection="column"
			paddingX={2}
			paddingY={0}
		>
			<Box marginY={1}>
				<Text bold backgroundColor={theme.accent} color={theme.ink}>
					◈ CLOUD TUI{' '}
				</Text>
				<Text dimColor> developer copilot</Text>
				<Spacer />
				<Text
					bold
					backgroundColor={configured ? theme.success : theme.warning}
					color={theme.ink}
				>
					{configured ? ' ● READY ' : ' ○ SETUP REQUIRED '}
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text color={theme.muted}>◇ provider </Text>
				<Text color={provider ? theme.text : theme.warning}>
					{provider ?? 'Not configured'}
				</Text>
				<Text color={theme.muted}> · model </Text>
				<Text color={model ? theme.accentSoft : theme.warning}>
					{model ?? 'Select a model'}
				</Text>
				<Spacer />
				<Text dimColor>local workspace</Text>
			</Box>
		</Box>
	);
}
