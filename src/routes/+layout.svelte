<script lang="ts">
// Layout is now minimal - realtime control is handled at the scene level
</script>

<slot />

<style>
	:global(html, body, #svelte) {
		height: 100%;
		margin: 0;
		padding: 0;
		overflow: hidden; /* prevent scrollbars */
		background: #000; /* dark background behind canvas */
	}
	:global(canvas) {
		display: block;
		box-sizing: border-box;
		border: none !important;
		outline: none !important;
	}
</style>
