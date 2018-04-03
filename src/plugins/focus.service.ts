import {Injectable, Optional} from '@angular/core';
import { DisposableView } from 'ng2-qgrid/core/view/disposable.view';
import { RootService } from 'ng2-qgrid/infrastructure/component/root.service';

@Injectable()
export class FocusService extends DisposableView {
	constructor(@Optional() private root: RootService) {
		super();

		this.model = root.model;
	}

	private model;

	private focus() {
		this.root.table.view.focus();
	}

	activateAfterRender(state: string, ...args) {
		this.using(this.model[`${state}Changed`].on(e => {
			switch (args.length) {
				case 0: {
					this.focus();
					break;
				}
				case 1: {
					if (e.tag.source === args[0]) {
						this.focus();
					}
					break;
				}
				case 2: {
					if (e.tag.source === args[0] && e.state.status === args[1]) {
						this.focus();
					}
					break;
				}
			}
		}));
	}
}
