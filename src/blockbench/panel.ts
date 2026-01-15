// FIXME - remove this ts nocheck once blockbench-types update
// @ts-nocheck

/// <reference types="blockbench-types" />

import { pollUntilResult } from '../polling'
import { mount, unmount } from 'svelte'
import type { ComponentMountOptions, GenericComponent } from '../svelteHelperTypes'

type SveltePanelOptions<C extends GenericComponent> = {
	id: string
} & Omit<PanelOptions, 'component'> &
	Omit<ComponentMountOptions<C>, 'outro'>

export class SveltePanel<C extends GenericComponent> extends Panel {
	instance?: ReturnType<typeof mount> | undefined

	protected deleted = false

	constructor(options: SveltePanelOptions<C>) {
		const mountId = `svelte-panel-` + options.id

		super(options.id, {
			...options,
			component: {
				name: options.id,
				template: `<div id="${mountId}"></div>`,
			},
		})

		void pollUntilResult(
			() => {
				return document.querySelector(`#${mountId}`)
			},
			() => this.deleted
		).then(el => {
			this.instance = mount(options.component, {
				target: el!,
				props: options.props,
				intro: options.intro,
				context: options.context,
			})
		})
	}

	delete(): void {
		if (this.instance) {
			this.deleted = true
			void unmount(this.instance).then(() => {
				this.instance = undefined
			})
		}
		super.delete()
	}
}
