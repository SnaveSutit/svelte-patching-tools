// FIXME - remove this ts nocheck once blockbench-types update
// @ts-nocheck

/// <reference types="blockbench-types" />

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
		const scope = this

		super(options.id, {
			...options,
			component: {
				name: options.id,
				mounted(this: Vue) {
					scope.instance = mount(options.component, {
						target: this.$el.parentElement!,
						props: options.props,
						intro: options.intro,
						context: options.context,
					})
				},
				destroyed(this: Vue) {
					if (scope.instance) {
						void unmount(scope.instance).then(() => {
							scope.instance = undefined
						})
					}
				},
			} satisfies Vue.ComponentOptions,
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
