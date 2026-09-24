export type PlanTask = {id: string; task: string};

type AddTasksResult = {
	tasks: PlanTask[];
	message: string;
};

type CompleteTaskResult =
	| {completed: true; id: string; message: string}
	| {completed: false; message: string};

export class TaskPlan {
	public taskList = new Map<string, PlanTask>();

	private readonly completedTaskIds = new Set<string>();

	public add(tasks: unknown): AddTasksResult {
		let added: PlanTask[] = [];
		let rejected: string[] = [];
		// validate tasks and id - task
		if (!Array.isArray(tasks)) {
			return {
				tasks: added,
				message: 'The task list must be an array',
			};
		} else if (tasks.length == 0) {
			return {
				tasks: [],
				message: 'Empty list of tasks received',
			};
		} else {
			for (const [index, entry] of tasks.entries()) {
				const id = typeof entry?.id == 'string' ? entry.id.trim() : '';
				const task = typeof entry?.task == 'string' ? entry.task : '';

				if (!id || !task) {
					const invalidFields = [!id && 'id', !task && 'task']
						.filter(Boolean)
						.join(' and ');
					rejected.push(
						`${id || `item at ${index - 1}`}, has invalid ${invalidFields}`,
					);
					continue;
				}

				if (this.taskList.has(task.id)) {
					rejected.push(
						`Task with id: ${id}, is already proposed, so it's a duplicate id`,
					);
				}

				let newTask = {id, task};

				this.taskList.set(id, newTask);
				added.push(newTask);
			}
			if (added.length === 0) {
				return {
					tasks: [],
					message: `No tasks added. Skipped: ${rejected.join(', ')}.`,
				};
			}

			return {
				tasks: added,
				message: `Added: ${added.map(task => task.id).join(', ')}.${
					rejected.length ? ` Skipped: ${rejected.join(', ')}.` : ''
				}`,
			};
		}
	}
	public markComplete(taskId: unknown): CompleteTaskResult {
		const id = typeof taskId === 'string' ? taskId.trim() : '';
		if (!id || !this.taskList.has(id)) {
			return {
				completed: false,
				message: 'That task ID does not exist in the active plan.',
			};
		}

		this.completedTaskIds.add(id);
		return {completed: true, id, message: 'DONE'};
	}

	public hasIncompleteTasks(): boolean {
		return this.completedTaskIds.size < this.taskList.size;
	}

	public remainingTaskIds(): string[] {
		return [...this.taskList.keys()].filter(
			id => !this.completedTaskIds.has(id),
		);
	}
}
