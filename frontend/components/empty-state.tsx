import React from 'react';
import {Box, Text} from 'ink';
import {theme} from '../theme';

type CommandProperties = {
	readonly command: string;
	readonly description: string;
};

function Command({command, description}: CommandProperties) {
	return (
		<Box>
			<Text bold color={theme.accentSoft}>
				{command.padEnd(10)}
			</Text>
			<Text dimColor>{description}</Text>
		</Box>
	);
}

export function EmptyState() {
	return (
		<Box flexDirection="column" marginY={1} paddingX={2}>
			<Text bold color={theme.assistant}>
				WELCOME TO YOUR AI WORKSPACE
			</Text>
			<Text bold color={theme.text}>
				Build with clarity. Ship with confidence.
			</Text>
			<Text color={theme.muted}>
				Ask a coding question, debug an issue, or explore the current project.
			</Text>

			<Box
				borderLeft
				borderBottom={false}
				borderColor={theme.surface}
				borderRight={false}
				borderStyle="single"
				borderTop={false}
				flexDirection="column"
				marginTop={1}
				paddingLeft={1}
			>
				<Text bold color={theme.muted}>
					TRY ASKING
				</Text>
				<Text>
					<Text color={theme.accent}>01</Text>
					<Text color={theme.muted}> · </Text>Review this code for bugs and
					risks
				</Text>
				<Text>
					<Text color={theme.assistant}>02</Text>
					<Text color={theme.muted}> · </Text>Help me plan and build a new
					feature
				</Text>
				<Text>
					<Text color={theme.success}>03</Text>
					<Text color={theme.muted}> · </Text>Explain how this project is
					structured
				</Text>
			</Box>

			<Box flexDirection="column" marginTop={1}>
				<Command command="/model" description="choose model" />
				<Command command="/login" description="connect provider" />
				<Command command="/session" description="open saved session" />
				<Command command="/help" description="show all commands" />
			</Box>
		</Box>
	);
}
