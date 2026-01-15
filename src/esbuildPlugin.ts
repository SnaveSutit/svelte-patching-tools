// A MODIFIED VERSION OF THE SVELTE PLUGIN FOR ESBUILD (esbuild-plugin-svelte)

// CHANGELOG:
// made it so that css can be emmitted directly as js instead of as an import

import type { Plugin, TransformOptions } from 'esbuild'
import { readFile } from 'fs/promises'
import { parse } from 'path'
import { sveltePreprocess } from 'svelte-preprocess'
import { typescript } from 'svelte-preprocess-esbuild'
import type { PreprocessorGroup } from 'svelte-preprocess/dist/types'
import type { CompileOptions, CompileResult, ModuleCompileOptions } from 'svelte/compiler'
import { compile, preprocess } from 'svelte/compiler'

type Warning = CompileResult['warnings'][number]
export interface PluginOptions {
	/**
	 * Svelte compiler options
	 */
	compilerOptions?: CompileOptions
	/**
	 * Svelte compiler options for module files (*.svelte.js and *.svelte.ts)
	 */
	moduleCompilerOptions?: ModuleCompileOptions
	/**
	 * A function that transforms CSS into JS.
	 */
	transformCssToJs: (css: string) => string
	/**
	 * esbuild transform options for ts module files (.svelte.ts)
	 */
	esbuildTsTransformOptions?: TransformOptions
	/**
	 * The preprocessor(s) to run the Svelte code through before compiling
	 */
	preprocess?: PreprocessorGroup | PreprocessorGroup[]
	/**
	 * Attempts to cache compiled files if the mtime of the file hasn't changed since last run.
	 *
	 */
	cache?: boolean
	/**
	 * The regex filter to use when filtering files to compile
	 * Defaults to `/\.svelte$/`
	 */
	include?: RegExp
	/**
	 * A function to filter out warnings
	 * Defaults to a constant function that returns `true`
	 */
	filterWarnings?: (warning: Warning) => boolean
}

/**
 * Convert a warning or error emitted from the svelte compiler for esbuild.
 */
function convertWarning(source: any, { message, filename, start, end }: any) {
	if (!start || !end) {
		return { text: message }
	}
	const lines = source.split(/\r\n|\r|\n/)
	const lineText = lines[start.line - 1]
	const location = {
		file: filename,
		line: start.line,
		column: start.column,
		length: (start.line === end.line ? end.column : lineText.length) - start.column,
		lineText,
	}
	return { text: message, location }
}

export function esbuildPluginSvelte(pluginOptions: PluginOptions): Plugin {
	return {
		name: 'esbuild-plugin-svelte-patching-tools',
		setup(build) {
			/** A cache of the compiled CSS. */
			const cache = new Map()

			const stringifySvelteCompileResult = (
				{ js, css }: CompileResult,
				path: string,
				compilerOptions: CompileOptions
			) => {
				let contents = `${js.code}\n//# sourceMappingURL=${js.map.toUrl()}`
				// Emit CSS, otherwise it will be included in the JS and injected at runtime.
				if (css?.code && pluginOptions.transformCssToJs) {
					contents = `${contents}\n${pluginOptions.transformCssToJs(css.code)}`
				} else if (css?.code && !compilerOptions.css) {
					const cssPath = `${path}.css`
					cache.set(cssPath, `${css.code}/*# sourceMappingURL=${css.map.toUrl()}*/`)
					contents = `${contents}\nimport ${JSON.stringify(cssPath)}`
				}
				return contents
			}

			// Register loader for the 'fake' CSS files that we import from
			// the compiled Javascript.
			build.onLoad({ filter: /\.svelte\.css$/ }, ({ path }) => {
				const contents = cache.get(path)
				return contents ? { contents, loader: 'css' } : null
			})
			// Register loader for all .svelte files.
			//
			build.onLoad({ filter: /\.svelte$/ }, async ({ path }) => {
				let source = await readFile(path, 'utf-8')
				let sourcemap: any
				const filename = parse(path).base
				if (pluginOptions.preprocess) {
					const processed = await preprocess(source, pluginOptions.preprocess, {
						filename,
					})
					source = processed.code
					sourcemap = processed.map
				}
				const compilerOptions: CompileOptions = {
					...pluginOptions.compilerOptions,
					filename,
					sourcemap,
					css: 'external',
					generate: 'client',
				}
				let res: CompileResult
				try {
					res = compile(source, compilerOptions)
				} catch (err: any) {
					return { errors: [convertWarning(source, err)] }
				}
				const contents = stringifySvelteCompileResult(res, path, compilerOptions)

				return {
					contents,
					warnings: res.warnings.map(w => convertWarning(source, w)),
				}
			})
		},
	}
}

function removeWhitespaceFromJs(code: string) {
	return code.replace(/(?:\n|^\t+)/gm, '')
}

/**
 * Create a Svelte ESBuild plugin configuration tailored for Blockbench plugins.
 * @param pluginId - The unique identifier of the Blockbench plugin.
 * @param pluginOptions - The base Svelte ESBuild plugin options.
 */
export function createBlockbenchSvelteConfig(
	pluginId: string,
	pluginOptions: Omit<PluginOptions, 'transformCssToJs'>
): PluginOptions {
	pluginOptions.compilerOptions ??= {}
	pluginOptions.compilerOptions.dev ??= process.env.NODE_ENV === 'development'
	pluginOptions.compilerOptions.runes ??= true

	pluginOptions.preprocess ??= []
	if (!Array.isArray(pluginOptions.preprocess)) {
		pluginOptions.preprocess = [pluginOptions.preprocess]
	}
	pluginOptions.preprocess.unshift(
		typescript({
			target: 'es2022',
			define: {
				'process.browser': 'true',
			},
		}),
		sveltePreprocess({
			typescript: false,
			sourceMap: process.env.NODE_ENV === 'development',
		})
	)

	return {
		...pluginOptions,
		transformCssToJs: (css: string) =>
			// Automatically add and remove CSS when the plugin is loaded and unloaded
			removeWhitespaceFromJs(`(() => {
				Blockbench.on('loaded_plugin', data => {
					if (data?.plugin?.id === '${pluginId}') {
						const css = Blockbench.addCSS(${JSON.stringify(css)});
						Blockbench.once('unloaded_plugin', data => {
							if (data?.plugin?.id === '${pluginId}') {
								css?.delete();
							}
						});
					};
				});
			})()`),
	}
}
