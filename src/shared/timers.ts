/** Timers behind an interface, so tests drive time themselves. */
export interface Timers { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void }
export const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>) };
