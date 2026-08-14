export interface KeysPressed {
	w: boolean;
	a: boolean;
	s: boolean;
	d: boolean;
	[key: string]: boolean;
}

export interface DroneInputState {
	moveX: number;
	moveY: number;
	throttle: number;
	brake: number;
	yaw: number;
	boost: boolean;
}

export function createDroneInputState(): DroneInputState {
	return {
		moveX: 0,
		moveY: 0,
		throttle: 0,
		brake: 0,
		yaw: 0,
		boost: false
	};
}

export function inputFromKeys(keysPressed: KeysPressed, target = createDroneInputState()): DroneInputState {
	target.moveX = 0;
	target.moveY = 0;
	target.throttle = Number(keysPressed.w);
	target.brake = Number(keysPressed.s);
	target.yaw = Number(keysPressed.d) - Number(keysPressed.a);
	target.boost = false;
	return target;
}
