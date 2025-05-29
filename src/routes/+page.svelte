<script lang="ts">
    import JOLLIBEE from "$lib/main.svelte";
</script>

<svelte:head>
  <title>Parallel_universe</title>
  <meta name="description" content=" ">
</svelte:head>

<main id="main-container">
  <JOLLIBEE />
</main>

<style>
  :global(html, body) {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
  }

  #main-container {
      height: 100vh;
      width: 100vw;
      display: flex;
      align-items: center;
      justify-content: center;
  }
</style>




