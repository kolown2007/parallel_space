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
	target.moveX = Number(keysPressed.d) - Number(keysPressed.a);
	target.moveY = Number(keysPressed.w);
	target.throttle = 0;
	target.brake = Number(keysPressed.s);
	target.yaw = 0;
	target.boost = false;
	return target;
}
