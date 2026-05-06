import { describe, test, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/svelte';
import Page from './+page.svelte';

describe('/+page.svelte', () => {
	test('should render the babylon canvas', () => {
		render(Page);
		const canvas = document.querySelector('canvas');
		expect(canvas).toBeInTheDocument();
	});
});
