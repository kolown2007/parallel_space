import { writable, derived } from 'svelte/store';

// Tracks cumulative rotation of the drone around its local up axis.
// - totalAngle: accumulated radians (may exceed 2π)
// - revolutions: totalAngle / (2π)
// - lastAngle: last absolute orientation (radians) seen; used to compute delta
// - angularVelocity: recent angular velocity (rad/s) estimated from last update

export interface RevolutionState {
	// path-based tracking (0..1 fraction -> full loop)
	lastPathFraction?: number; // in [0,1)
	totalProgressLoops: number; // fractional number of loops (signed)
	revolutionsLoops: number; // integer floor(abs(totalProgressLoops))
	loopsCompletedCount: number; // simple integer count of full loops (can be negative if moving backwards)
}

const initial: RevolutionState = {
	lastPathFraction: undefined,
	totalProgressLoops: 0,
	revolutionsLoops: 0,
	loopsCompletedCount: 0
};

function createRevolutionStore() {
	const { subscribe, set, update } = writable<RevolutionState>({ ...initial });

	return {
		subscribe,

		// Path-based revolution tracking
		// Accepts a normalized fraction [0,1) representing the drone's position along the torus path.
		// Each time the fraction increases across the 1.0 -> 0.0 boundary, totalProgressLoops increments by ~1.
		updateFromPathFraction: (fraction: number) => {
			if (!isFinite(fraction)) return;
			// normalize to [0,1)
			fraction = ((fraction % 1) + 1) % 1;

			update((s) => {
				if (s.lastPathFraction === undefined) {
					s.lastPathFraction = fraction;
					return s;
				}

				let delta = fraction - (s.lastPathFraction as number);
				// handle wrap-around: if delta is large magnitude, adjust
				if (delta < -0.5) delta += 1; // wrapped forward past 1.0
				else if (delta > 0.5) delta -= 1; // wrapped backward past 0.0
				const prevTotal = s.totalProgressLoops;
				s.totalProgressLoops += delta; // can be fractional (signed)
				// count completed integer loop boundaries crossed
				const loopDelta = Math.floor(s.totalProgressLoops) - Math.floor(prevTotal);
				if (loopDelta !== 0) s.loopsCompletedCount += loopDelta;
				// revolutionsLoops is absolute count of full loops (magnitude)
				s.revolutionsLoops = Math.floor(Math.abs(s.totalProgressLoops));
				s.lastPathFraction = fraction;
				return s;
			});
		},

		// Convenience when you have an index and path length
		updateFromPathIndex: (index: number, pathLength: number) => {
			if (!isFinite(index) || !isFinite(pathLength) || pathLength <= 0) return;
			const frac = ((index % pathLength) + pathLength) % pathLength / pathLength;
			// directly update using same logic as updateFromPathFraction
			update((s) => {
				if (s.lastPathFraction === undefined) {
					s.lastPathFraction = frac;
					return s;
				}

				let delta = frac - (s.lastPathFraction as number);
				if (delta < -0.5) delta += 1;
				else if (delta > 0.5) delta -= 1;

				const prevTotal = s.totalProgressLoops;
				s.totalProgressLoops += delta;
				const loopDelta = Math.floor(s.totalProgressLoops) - Math.floor(prevTotal);
				if (loopDelta !== 0) s.loopsCompletedCount += loopDelta;
				s.revolutionsLoops = Math.floor(Math.abs(s.totalProgressLoops));
				s.lastPathFraction = frac;
				return s;
			});
		},

		// Reset all counters
		reset: () => set({ ...initial })
	};
}

export const revolutionStore = createRevolutionStore();

// Derived helpers
export const totalProgressLoops = derived(revolutionStore, ($r) => $r.totalProgressLoops);
export const revolutionsLoops = derived(revolutionStore, ($r) => $r.revolutionsLoops);
export const loopsCompleted = derived(revolutionStore, ($r) => $r.loopsCompletedCount);
