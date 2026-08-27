<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { completedStations, totalStations } from '$lib/stores/stationProgress';
  import { getLoadingBgTextureUrl } from '$lib/assets/assetsConfig';

export let initialCountdown = 99;
  export let onStart: () => void;
  export let backgroundUrl = '';

  const STORY_URL = 'https://kolown.net/api/chrono-escapes/story';

  let storyText = '';
  let storyParagraphs: string[] = [];
  let storyLoading = true;
  let storyError = '';
  let slide = 1;
  let autoAdvanceTimer: number | null = null;
  const autoAdvanceDelay = 5000;
  let countdown = initialCountdown;
  let countdownInterval: number | null = null;
  let hasStarted = false;

  let totalSlides = 3;
  let rafId: number | null = null;
  let lastCirclePressed = false;

  const normalizeStoryText = (data: any): string => {
    if (typeof data === 'string') return data;
    if (Array.isArray(data)) return data.map((item) => normalizeStoryText(item)).join('\n\n');
    if (data && typeof data === 'object') {
      if (typeof data.story === 'string') return data.story;
      if (typeof data.text === 'string') return data.text;
      if (typeof data.content === 'string') return data.content;
      if (typeof data.message === 'string') return data.message;
      if (Object.keys(data).length === 0) return '';
      return Object.values(data)
        .map((value) => normalizeStoryText(value))
        .filter(Boolean)
        .join('\n\n');
    }
    return String(data);
  };

  const wrapText = (text: string, maxChars = 42): string => {
    return text
      .split('\n')
      .flatMap((line) => {
        const words = line.split(' ');
        const wrappedLines: string[] = [];
        let current = '';

        for (const word of words) {
          const candidate = current ? `${current} ${word}` : word;
          if (candidate.length > maxChars) {
            if (current) wrappedLines.push(current);
            current = word;
          } else {
            current = candidate;
          }
        }

        if (current) wrappedLines.push(current);
        return wrappedLines;
      })
      .join('\n');
  };

  const formatStoryText = (text: string): string => {
    const normalized = text.trim().replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
    const paragraphs = normalized
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);

    if (paragraphs.length > 0) {
      return paragraphs.map((paragraph) => wrapText(paragraph, 38)).join('\n\n');
    }

    const sentenceMatches = normalized.match(/[^.!?]+[.!?]+(?:\s|$)/g) || [normalized];
    const paragraphChunks: string[] = [];
    for (let i = 0; i < sentenceMatches.length; i += 2) {
      paragraphChunks.push(sentenceMatches.slice(i, i + 2).join(' ').trim());
    }

    return paragraphChunks.map((paragraph) => wrapText(paragraph, 38)).join('\n\n');
  };

  const buildStoryParagraphs = (text: string): string[] => {
    const normalized = text.trim().replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
    const paragraphs = normalized
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => wrapText(paragraph, 38));

    if (paragraphs.length > 0) {
      return paragraphs;
    }

    const sentenceMatches = normalized.match(/[^.!?]+[.!?]+(?:\s|$)/g) || [normalized];
    const paragraphChunks: string[] = [];
    for (let i = 0; i < sentenceMatches.length; i += 2) {
      paragraphChunks.push(sentenceMatches.slice(i, i + 2).join(' ').trim());
    }

    return paragraphChunks.map((paragraph) => wrapText(paragraph, 38));
  };

  const computeSlideText = (
    currentSlide: number,
    slidesTotal: number,
    loading: boolean,
    error: string,
    paragraphs: string[],
    remaining: number,
    completed: number,
    total: number
  ): string => {
    if (currentSlide === 1) {
      return loading
        ? ['CHRONO ESCAPE 2050', '', 'Loading story...'].join('\n')
        : error
        ? ['CHRONO ESCAPE 2050', '', 'Story failed to load.', error].join('\n')
        : ['CHRONO ESCAPE 2050', '', 'Tap next to continue.'].join('\n');
    }

    if (currentSlide >= 2 && currentSlide < slidesTotal) {
      const storySlideIndex = currentSlide - 2;
      if (loading) return 'Loading story...';
      if (error) return `Story failed to load. ${error}`;
      return paragraphs[storySlideIndex] ?? 'No story text returned.';
    }

    return [
     
     
      'Completed stations',
      `${completed} / ${total}`,
      '',
     
           '',
      `Starting in ${remaining}...`
    ].join('\n');
  };

  $: displayText = computeSlideText(
    slide,
    totalSlides,
    storyLoading,
    storyError,
    storyParagraphs,
    countdown,
    $completedStations,
    $totalStations
  );

  const getButtonLabel = (): string => (slide < totalSlides ? 'O' : 'O to start');

  const updateTotalSlides = () => {
    totalSlides = 2 + Math.max(0, storyParagraphs.length);
  };

  const loadStory = async () => {
    try {
      const response = await fetch(STORY_URL);
      if (!response.ok) throw new Error(`${response.status}`);
      const data = await response.json();
      storyText = normalizeStoryText(data);
      storyParagraphs = buildStoryParagraphs(storyText);
    } catch (e) {
      console.warn('Failed to load story:', e);
      storyError = 'Unable to load story.';
    } finally {
      storyLoading = false;
      updateTotalSlides();
    }
  };

  const beginGame = () => {
    if (hasStarted) return;
    hasStarted = true;
    clearCountdown();
    clearAutoAdvance();
    onStart();
  };

  const startCountdown = () => {
    if (hasStarted || countdownInterval) return;
    countdownInterval = window.setInterval(() => {
      if (countdown <= 1) {
        beginGame();
      } else {
        countdown -= 1;
      }
    }, 1000);
  };

  const clearCountdown = () => {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  };

  const handleButton = () => {
    clearAutoAdvance();
    if (slide < totalSlides) {
      slide += 1;
      return;
    }

    beginGame();
  };

  const startAutoAdvance = () => {
    clearAutoAdvance();
    autoAdvanceTimer = window.setTimeout(() => {
      if (slide < totalSlides) {
        slide += 1;
      }
    }, autoAdvanceDelay);
  };

  const clearAutoAdvance = () => {
    if (autoAdvanceTimer) {
      clearTimeout(autoAdvanceTimer);
      autoAdvanceTimer = null;
    }
  };

  const skipToMission = () => {
    if (hasStarted) return;
    clearAutoAdvance();
    slide = totalSlides;
  };

  const handleKeydown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (key === 'escape') {
      skipToMission();
    } else if (key === 'o') {
      handleButton();
    }
  };

  const getCircleButton = (gp: Gamepad) => {
    if (!gp.buttons || gp.buttons.length === 0) return null;
    return gp.buttons[1] ?? gp.buttons[0] ?? null;
  };

  const pollGamepads = () => {
    const gamepads = typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function'
      ? navigator.getGamepads()
      : null;

    if (gamepads) {
      for (const gp of gamepads) {
        if (!gp) continue;
        const circle = getCircleButton(gp);
        if (circle) {
          if (circle.pressed) {
            if (!lastCirclePressed) {
              handleButton();
            }
            lastCirclePressed = true;
            break;
          }
        }
      }
    }

    if (gamepads) {
      const anyPressed = Array.from(gamepads).some((gp) => gp?.buttons?.[1]?.pressed);
      if (!anyPressed) {
        lastCirclePressed = false;
      }
    } else {
      lastCirclePressed = false;
    }

    rafId = requestAnimationFrame(pollGamepads);
  };

  $: {
    if (slide === totalSlides) {
      startCountdown();
    } else {
      clearCountdown();
    }

    if (slide < totalSlides) {
      startAutoAdvance();
    }
  }

  onMount(async () => {
    window.addEventListener('keydown', handleKeydown);
    rafId = requestAnimationFrame(pollGamepads);

    if (!backgroundUrl) {
      try {
        backgroundUrl = await getLoadingBgTextureUrl();
      } catch (e) {
        console.warn('Failed to resolve intro background texture:', e);
      }
    }

    await loadStory();
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
    clearCountdown();
    clearAutoAdvance();
    hasStarted = true;
  });
</script>

<div class="absolute inset-0 z-20 overflow-hidden">
  {#if backgroundUrl}
    <div class="absolute inset-0 bg-cover bg-center" style="background-image: url('{backgroundUrl}')"></div>
  {/if}
  <div class="relative flex min-h-full flex-col items-center justify-between px-4 py-8 sm:px-6">
    <div class="flex h-full w-full flex-1 items-center justify-center text-center text-slate-100 sm:px-8">
      {#if displayText}
        <p
          class="mx-auto max-w-[88vw] whitespace-pre-wrap text-sm leading-relaxed tracking-wide text-cyan-100 sm:text-base md:text-lg"
          style="font-family: 'Comic Sans MS', 'Comic Sans', cursive;"
        >
          {displayText}
        </p>
      {:else}
        <h1 class="text-xl font-semibold tracking-[0.03em] sm:text-3xl">Loading...</h1>
      {/if}
    </div>
    <div class="w-full px-4 pb-8 sm:px-8">
      <button
        class="mx-auto block rounded-full border border-white/70 bg-transparent px-6 py-2.5 text-sm font-bold uppercase tracking-[0.08em] text-white transition hover:bg-red-600 sm:px-8 sm:py-3 sm:text-base"
        type="button"
        on:click={handleButton}
      >
        {getButtonLabel()}
      </button>
    </div>
  </div>
</div>
