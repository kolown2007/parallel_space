/**
 * Configuration constants for WormHoleScene2
 * Centralized to avoid magic numbers and enable easy tuning
 */

export const WORMHOLE2_CONFIG = {
	/** Torus world geometry */
	torus: {
		diameter: 300,
		thickness: 30,
		tessellation: 100,
		positionY: 1,
		lineRadiusFactor: 0.0,
		turns: 1,
		spiralTurns: 3,
		segments: 128,
		pointsPerCircle: 360,
		emissiveIntensity: .000001  // 0.1 = very dark (orb lights visible), 0.5 = balanced, 1.0 = full bright
		
	},

	/** Drone physics and starting state */

	drone: {
		mass: 25, 
		restitution: 0.6,
		friction: 0.001,
		glowIntensity: 0.1,
		startPathPoint: 0,
		initialRotation: { x: 0, y: 0, z: -Math.PI / 2 },
		emissiveColor: { r: 0, g: .02, b: 0 }, // Blue
		diffuseColor: { r: 0, g: 0.5, b: 0 }
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
		portalWidth: 30,
		portalHeight: 30
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
