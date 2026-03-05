/**
 * Polls {@link fn} until it returns a non-nullish value, then resolves the promise with that value.
 *
 * If {@link cancelCondition} returns true while polling, the promise is rejected.
 */
export function pollUntilResult<T>(
	fn: () => T | undefined | null,
	cancelCondition: () => boolean,
	interval = 100
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const earlyResult = fn()
		if (earlyResult != undefined) return resolve(earlyResult)

		const intervalId = setInterval(() => {
			if (cancelCondition()) {
				clearInterval(intervalId)
				return reject('pollUntilResult Cancelled')
			}
			const result = fn()
			if (result != undefined) {
				clearInterval(intervalId)
				return resolve(result)
			}
		}, interval)
	})
}
