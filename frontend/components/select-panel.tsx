import React from 'react';
import {Box, Spacer, Text} from 'ink';
import {theme} from '../theme';
import {type SelectOption} from '../types';

type SelectPanelProperties = {
	readonly cursor: number;
	readonly description: string;
	readonly options: SelectOption[];
	readonly title: string;
};

export function SelectPanel({
	cursor,
	description,
	options,
	title,
}: SelectPanelProperties) {
	return (
		<Box
			borderColor={theme.assistant}
			borderStyle="round"
			flexDirection="column"
			paddingX={2}
			paddingY={1}
		>
			<Text bold color={theme.assistant}>
				{title}
			</Text>
			<Text color={theme.muted}>{description}</Text>

			<Box flexDirection="column" marginTop={1}>
				{options.map((option, index) => {
					const active = index === cursor;

					return (
						<Box key={option.id}>
							<Text
								bold={active}
								backgroundColor={active ? theme.accent : undefined}
								color={active ? theme.ink : theme.text}
							>
								{active ? ` ❯ ${option.label} ` : `   ${option.label}`}
							</Text>
							<Spacer />
							{option.meta && <Text color={theme.muted}>{option.meta} </Text>}
							{option.badge && (
								<Text bold backgroundColor={theme.success} color={theme.ink}>
									{option.badge}{' '}
								</Text>
							)}
						</Box>
					);
				})}
			</Box>

			<Box marginTop={1}>
				<Text bold color={theme.accentSoft}>
					↑↓
				</Text>
				<Text dimColor> navigate · </Text>
				<Text bold color={theme.accentSoft}>
					ENTER
				</Text>
				<Text dimColor> select · </Text>
				<Text bold color={theme.accentSoft}>
					ESC
				</Text>
				<Text dimColor> cancel</Text>
			</Box>
		</Box>
	);
}
