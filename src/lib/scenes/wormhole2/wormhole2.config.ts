/**
 * Configuration constants for WormHoleScene2
 * Centralized to avoid magic numbers and enable easy tuning
 */

export const WORMHOLE2_CONFIG = {
	/** Torus world geometry */
	torus: {
		diameter: 300,
		thickness: 50,
		tessellation: 100,
		positionY: 1,
		lineRadiusFactor: 0.0,
		turns: 1,
		spiralTurns: 3,
		segments: 128,
		pointsPerCircle: 360
	},

	/** Drone physics and starting state */
	drone: {
		mass: 2,
		restitution: 0.6,
		friction: 0.1,
		glowIntensity: 0,
		startPathPoint: 0,
		initialRotation: { x: 0, y: 0, z: -Math.PI / 2 },
		emissiveColor: { r: 0, g: 0, b: 1 }, // Blue
		diffuseColor: { r: 0.5, g: 0.5, b: 0.5 }
	},

	/** Follow camera behavior */
	camera: {
		followDistance: 8,
		followHeight: 2,
		positionSmooth: 0.08,
		rotationSmooth: 0.12,
		lookAheadDistance: 5,
		initialOffsetY: 2,
		initialOffsetZ: -8
	},

	/** Obstacle placement defaults */
	obstacles: {
		cubeAheadOffset: 10,
		portalAheadOffset: 10,
		cubeSize: 2,
		cubeAutoDispose: 60000, // ms
		cubeThrustMs: 2000,
		cubeThrustSpeed: -10,
		portalWidth: 6,
		portalHeight: 8
	},

	/** Collision detection */
	collision: {
		debounceMs: 500,
		speedPenaltyPercent: 0.2,
		droneAabbRadius: 0.5
	},

	/** Path tracking */
	path: {
		maxSafeDistance: 3.0,
		offTrackProgressMultiplier: 0.1
	},

	/** Particle effects */
	particles: {
		revolutionAheadOffset: 5,
		revolutionSpawnOffset: 20,
		revolutionCount: 700,
		revolutionSize: 1.0,
		revolutionAutoDispose: 30000 // ms
	},

	/** Debug */
	debug: {
		enableDroneDebug: false,
		pathVisualization: {
			showLine: false,
			showLabels: false,
			labelInterval: 10,
			showStats: true
		},
		droneLogIntervalMs: 10000
	}
} as const;
