import React, {useEffect, useState} from 'react';
import {Box, Text} from 'ink';
import {theme} from '../theme';
import {type ChatMessage, type MessageRole} from '../types';

const rolePresentation: Record<
	MessageRole,
	{color: string; label: string; marker: string}
> = {
	assistant: {color: theme.assistant, label: 'CLOUD', marker: '◆'},
	error: {color: theme.danger, label: 'ERROR', marker: '!'},
	system: {color: theme.success, label: 'SYSTEM', marker: '●'},
	user: {color: theme.accentSoft, label: 'YOU', marker: '›'},
};

type MessageListProperties = {
	readonly activity?: string;
	readonly isBusy: boolean;
	readonly messages: ChatMessage[];
};

function ProcessingIndicator({activity}: {readonly activity?: string}) {
	const frames = ['◐', '◓', '◑', '◒'];
	const [frame, setFrame] = useState(0);

	useEffect(() => {
		const interval = setInterval(
			() => setFrame(current => (current + 1) % frames.length),
			120,
		);
		return () => clearInterval(interval);
	}, [frames.length]);

	return (
		<Box
			borderColor={theme.assistant}
			borderStyle="round"
			flexDirection="column"
			marginBottom={1}
			paddingX={1}
		>
			<Text bold color={theme.assistant}>
				{frames[frame]} PROCESSING
			</Text>
			<Text color={theme.text}>{activity ?? 'Working through the request…'}</Text>
			<Text dimColor>Ctrl+C to stop</Text>
		</Box>
	);
}

export function MessageList({
	activity,
	isBusy,
	messages,
}: MessageListProperties) {
	return (
		<Box flexDirection="column" marginTop={1} paddingX={1}>
			{messages.map(entry => {
				const presentation = rolePresentation[entry.role];
				const isCallout = entry.role === 'system' || entry.role === 'error';
				const waiting = isBusy && entry.role === 'assistant' && entry.message.length === 0;

				if (waiting) return null;

				if (isCallout) {
					return (
						<Box
							key={entry.id}
							borderColor={presentation.color}
							borderStyle="round"
							flexDirection="column"
							marginBottom={1}
							paddingX={1}
						>
							<Text bold color={presentation.color}>
								{presentation.marker} {presentation.label}
							</Text>
							<Text color={entry.role === 'error' ? theme.danger : theme.text}>
								{entry.message}
							</Text>
						</Box>
					);
				}

				return (
					<Box key={entry.id} flexDirection="column" marginBottom={1}>
						<Text bold backgroundColor={presentation.color} color={theme.ink}>
							{presentation.marker} {presentation.label}{' '}
						</Text>
						<Box
							borderLeft
							borderColor={presentation.color}
							borderRight={false}
							borderStyle="single"
							borderTop={false}
							borderBottom={false}
							paddingLeft={1}
						>
							<Text color={entry.role === 'error' ? theme.danger : undefined}>
								{entry.message}
							</Text>
						</Box>
					</Box>
				);
			})}
			{isBusy && <ProcessingIndicator activity={activity} />}
		</Box>
	);
}
