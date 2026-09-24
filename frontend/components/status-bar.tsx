import React from 'react';
import {Box, Spacer, Text} from 'ink';
import {theme} from '../theme';
import {type AppMode} from '../types';

type StatusBarProperties = {
	readonly isBusy: boolean;
	readonly mode: AppMode;
	readonly sessionId: string;
};

export function StatusBar({isBusy, mode, sessionId}: StatusBarProperties) {
	const isInput = mode === 'input';

	return (
		<Box marginTop={1} paddingX={1}>
			<Text bold backgroundColor={theme.surface} color={theme.success}>
				● LOCAL{' '}
			</Text>
			<Text color={theme.muted}> session {sessionId.slice(0, 8)}</Text>
			<Spacer />
			{isBusy ? (
				<>
					<Text bold color={theme.danger}>
						CTRL+C
					</Text>
					<Text dimColor> stop</Text>
				</>
			) : isInput ? (
				<>
					<Text bold color={theme.accentSoft}>
						ENTER
					</Text>
					<Text dimColor> send · </Text>
					<Text bold color={theme.accentSoft}>
						CTRL+L
					</Text>
					<Text dimColor> clear · </Text>
					<Text bold color={theme.accentSoft}>
						CTRL+C
					</Text>
					<Text dimColor> exit</Text>
				</>
			) : (
				<>
					<Text bold color={theme.accentSoft}>
						↑↓
					</Text>
					<Text dimColor> navigate · </Text>
					<Text bold color={theme.accentSoft}>
						ESC
					</Text>
					<Text dimColor> cancel</Text>
				</>
			)}
		</Box>
	);
}
