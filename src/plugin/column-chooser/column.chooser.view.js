import * as columnService from '../../core/column/column.service';
import { Command } from '../../core/command/command';
import { Aggregation } from '../../core/services/aggregation';
import { isFunction } from '../../core/utility/kit';
import { Event } from '../../core/infrastructure/event';
import { preOrderDFS, copy, find } from '../../core/node/node.service';

export class ColumnChooserView {
	constructor(model, context) {
		this.model = model;

		this.context = context;

		this.cancelEvent = new Event();
		this.submitEvent = new Event();
		this.dropEvent = new Event();

		const setup = () => {
			const { index } = model.columnList();

			this.columns = [];
			this.tree = preOrderDFS([index], (node, current, parent) => {
				const { model } = node.key;
				const column = {
					key: model.key,
					title: model.title,
					isVisible: model.isVisible,
					canMove: model.canMove,
					aggregation: model.aggregation
				};

				if (parent) {
					const newNode = copy(node);
					newNode.value = {
						column,
						isVisible: model.class === 'data' || model.class === 'cohort',
					};

					current.children.push(newNode);

					if (newNode.isVisible) {
						this.columns.push(column);
					}

					return newNode;
				}

				current.value = { column, isVisible: true };
				return current;
			}, copy(index));
		};

		setup();

		const toggle = (node, value) => {
			const { children } = node;
			const { column } = node.value;
			column.isVisible = value;
			if (children.length) {
				children.forEach(n => toggle(n, value));
			}
		};

		this.toggle = new Command({
			source: 'column.chooser',
			canExecute: node => node.value.isVisible,
			execute: node => toggle(node, !this.state(node))
		});

		this.toggleAll = new Command({
			source: 'column.chooser',
			execute: () => {
				const state = !this.stateAll();
				for (let column of this.columns) {
					column.isVisible = state;
				}
			}
		});

		this.defaults = new Command({
			source: 'column.chooser',
			execute: () => {
				for (let column of this.columns) {
					column.isVisible = column.isDefault !== false;
				}
			}
		});

		this.toggleAggregation = new Command({ source: 'column.chooser' });

		this.drop = new Command({
			source: 'column.chooser',
			canExecute: e => {
				const node = e.dropData;
				return node && node.value.column.canMove;

			},
			execute: e => {
				switch (e.action) {
					case 'over': {
						const src = e.dragData;
						const trg = e.dropData;
						if (src !== trg) {
							const tree = this.tree;

							const oldPos = find(tree, node => node === src);
							const newPos = find(tree, node => node === trg);
							if (oldPos && newPos && newPos.path.indexOf(oldPos.node) < 0) {
								const queue = oldPos.path.reverse();
								const hostIndex = queue.findIndex(node => node.children.length > 1);
								if (hostIndex >= 0) {
									const host = queue[hostIndex];
									const target = queue[hostIndex - 1] || oldPos.node;
									const index = host.children.indexOf(target);

									host.children.splice(index, 1);
									newPos.parent.children.splice(newPos.index, 0, target);

									target.level = newPos.parent.level + 1;
									preOrderDFS(
										target.children,
										(node, root, parent) => {
											node.level = (root || parent).level + 1;
										},
										target
									);

									this.dropEvent.emit();
								}
							}
						}
						break;
					}
				}
			}
		});

		this.drag = new Command({
			source: 'column.chooser',
			canExecute: e => {
				const node = e.data;
				return node && node.value.column.canMove;
			}
		});

		this.submit = new Command({
			source: 'column.chooser',
			execute: () => {
				const { model } = this;

				const columnMap = columnService.map(model.columnList().line);
				this.columns.forEach(c => {
					const column = columnMap[c.key];
					if (column) {
						column.isVisible = c.isVisible;
						column.aggregation = c.aggregation;
					}
				});

				const index = preOrderDFS([this.tree], (node, current, parent) => {
					if (parent) {
						const newNode = copy(node);
						current.children.push(newNode);

						if (node.isVisible) {
							const { column } = node.value;
							const { model } = newNode.key;
							model.isVisible = column.isVisible;
							model.aggregation = column.aggregation;
						}

						newNode.value = null;
						return newNode;
					}

					current.value = null;
					return current;
				}, copy(this.tree));

				model.columnList({ index }, {
					source: 'column.chooser.view'
				});

				this.submitEvent.emit();
			}
		});

		this.cancel = new Command({
			source: 'column.chooser',
			execute: () => this.cancelEvent.emit()
		});

		this.reset = new Command({
			source: 'column.chooser',
			execute: () => setup()
		});

		this.aggregations = Object
			.getOwnPropertyNames(Aggregation)
			.filter(key => isFunction(Aggregation[key]));

		model.dataChanged.watch(e => {
			if (e.tag.source === 'column.chooser') {
				return;
			}

			if (e.hasChanges('columns')) {
				setup();
			}
		});

		model.columnListChanged.watch(e => {
			if (e.tag.source === 'column.chooser') {
				return;
			}

			if (e.hasChanges('index')) {
				setup();
			}
		});
	}

	state(node) {
		const { children } = node;
		const { column } = node.value;
		if (children.length) {
			return children.some(n => n.value.column.isVisible);
		}

		return column.isVisible !== false;
	}

	stateAll() {
		return this.columns.every(c => c.isVisible);
	}

	stateDefault() {
		return this.columns.every(c => (c.isDefault !== false && c.isVisible !== false) || (c.isDefault === false && c.isVisible === false));
	}

	isIndeterminate() {
		return !this.stateAll() && this.columns.some(c => c.isVisible);
	}

	get canAggregate() {
		return this.columnChooserCanAggregate;
	}

	get resource() {
		return this.model.columnChooser().resource;
	}
}
