import { describe, it, expect } from 'vitest';
import * as BABYLON from '@babylonjs/core';
import { getPositionOnPath, getDirectionOnPath } from './PathUtils';

// Helpers
const v3 = (x: number, y: number, z: number) => new BABYLON.Vector3(x, y, z);

// A straight line from (0,0,0) to (10,0,0)
const straightLine = [v3(0, 0, 0), v3(5, 0, 0), v3(10, 0, 0)];

describe('getPositionOnPath', () => {
	it('returns zero when given an empty array', () => {
		const result = getPositionOnPath([], 0.5);
		expect(result.x).toBe(0);
		expect(result.y).toBe(0);
		expect(result.z).toBe(0);
	});

	it('returns the only point for a single-point array', () => {
		const result = getPositionOnPath([v3(3, 5, 7)], 0.5);
		expect(result.x).toBeCloseTo(3);
		expect(result.y).toBeCloseTo(5);
		expect(result.z).toBeCloseTo(7);
	});

	it('returns start at progress 0', () => {
		const result = getPositionOnPath(straightLine, 0);
		expect(result.x).toBeCloseTo(0);
	});

	it('returns end at progress 1', () => {
		const result = getPositionOnPath(straightLine, 1);
		expect(result.x).toBeCloseTo(10);
	});

	it('returns midpoint at progress 0.5', () => {
		const result = getPositionOnPath(straightLine, 0.5);
		expect(result.x).toBeCloseTo(5);
	});

	it('clamps progress below 0 to start', () => {
		const result = getPositionOnPath(straightLine, -1);
		expect(result.x).toBeCloseTo(0);
	});

	it('clamps progress above 1 to end', () => {
		const result = getPositionOnPath(straightLine, 99);
		expect(result.x).toBeCloseTo(10);
	});
});

describe('getDirectionOnPath', () => {
	it('returns forward (0,0,1) for undefined points', () => {
		const result = getDirectionOnPath(undefined, 0.5);
		expect(result.z).toBeCloseTo(1);
	});

	it('returns forward (0,0,1) for a single point', () => {
		const result = getDirectionOnPath([v3(0, 0, 0)], 0.5);
		expect(result.z).toBeCloseTo(1);
	});

	it('returns a unit vector (length ~1) on a straight path', () => {
		const result = getDirectionOnPath(straightLine, 0.5);
		expect(result.length()).toBeCloseTo(1, 4);
	});

	it('points in +X direction on a straight X-axis path', () => {
		const result = getDirectionOnPath(straightLine, 0.5);
		expect(result.x).toBeGreaterThan(0.9); // mostly X
	});
});
