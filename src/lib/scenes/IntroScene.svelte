<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { completedStations, totalStations } from '$lib/stores/stationProgress';
  import { getTextureUrl } from '$lib/assetsConfig';
  import { loadBitmapFont, renderBitmapTextToCanvas } from '$lib/bitmapFont';

  export let initialCountdown = 60;
  export let onStart: () => void;

  const STORY_URL = 'https://kolown.net/api/chrono-escapes/story';

  let backgroundUrl = '';
  let storyText = '';
  let storyParagraphs: string[] = [];
  let storyLoading = true;
  let storyError = '';
  let slide = 1;
  let typedText = '';
  let typewriterIndex = 0;
  let typewriterTimer: number | null = null;
  const typewriterSpeed = 50;
  const typewriterAdvanceDelay = 800;
  let autoAdvanceTimer: number | null = null;
  let bitmapTextUrl = '';
  let buttonTextUrl = '';
  let countdown = initialCountdown;
  let countdownInterval: number | null = null;
  let bitmapFont: any = null;
  let bitmapFontImage: HTMLImageElement | null = null;

  const fontXmlUrl = '/td.xml';
  const fontImageUrl = '/td6.png';
  let totalSlides = 3;

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

  const getCurrentSlideText = (): string => {
    if (slide === 1) {
      return storyLoading
        ? ['loading', '', 'Loading story...'].join('\n')
        : storyError
        ? ['CHRONO ESCAPE', '', 'Story failed to load.', storyError].join('\n')
        : ['CHRONO ESCAPE', '', 'Tap to continue.'].join('\n');
    }

    const storySlideIndex = slide - 2;
    if (slide >= 2 && slide < totalSlides) {
      if (storyLoading) return 'Loading story...';
      if (storyError) return `Story failed to load. ${storyError}`;
      return storyParagraphs[storySlideIndex] ?? 'No story text returned.';
    }

    return [
      'Your Mission',
      'Within 60 seconds, reach the USB to the next station.',
      'Tap the screen to add speed.',
      '',
      'Completed stations',
      `${$completedStations} / ${$totalStations}`,
      '',
      `Starting in ${countdown}...`
    ].join('\n');
  };

  const buildBitmapText = (): string => {
    if (slide === 1 || (slide >= 2 && slide < totalSlides)) {
      return typedText;
    }

    return [
      'Your Mission',
      'Within 99 seconds, reach the USB to the next station.',
      'Tap the screen to add speed.',
      '',
      'Completed stations',
      `${$completedStations} / ${$totalStations}`,
      '',
      `Starting in ${countdown}...`
    ].join('\n');
  };

  const getButtonLabel = (): string => (slide < totalSlides ? 'NEXT' : 'OK');

  const updateTotalSlides = () => {
    totalSlides = 2 + Math.max(0, storyParagraphs.length);
  };

  const startTypewriter = (text: string) => {
    clearTypewriter();
    clearAutoAdvance();
    typedText = '';
    typewriterIndex = 0;
    const fullText = text;

    const tick = () => {
      if (typewriterIndex < fullText.length) {
        typedText += fullText[typewriterIndex];
        typewriterIndex += 1;
        typewriterTimer = window.setTimeout(tick, typewriterSpeed);
      } else {
        typewriterTimer = null;
        if (slide >= 2 && slide < totalSlides) {
          autoAdvanceTimer = window.setTimeout(() => {
            if (slide < totalSlides) {
              slide += 1;
            }
          }, typewriterAdvanceDelay);
        }
      }
    };

    tick();
  };

  const clearTypewriter = () => {
    if (typewriterTimer) {
      clearTimeout(typewriterTimer);
      typewriterTimer = null;
    }
  };

  const loadStory = async () => {
    try {
      const response = await fetch(STORY_URL);
      if (!response.ok) throw new Error(`${response.status}`);
      const data = await response.json();
      storyText = normalizeStoryText(data);
      storyParagraphs = buildStoryParagraphs(storyText);
      updateTotalSlides();
    } catch (e) {
      console.warn('Failed to load story:', e);
      storyError = 'Unable to load story.';
    } finally {
      storyLoading = false;
    }
  };

  const startCountdown = () => {
    if (countdownInterval) return;
    countdownInterval = window.setInterval(() => {
      if (countdown <= 1) {
        clearCountdown();
        onStart();
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

    clearCountdown();
    onStart();
  };

  const startAutoAdvance = () => {
    clearAutoAdvance();
    autoAdvanceTimer = window.setTimeout(() => {
      if (slide === 1) {
        slide = 2;
      }
    }, 5000);
  };

  $: if (slide > 0 && slide < totalSlides) {
    clearTypewriter();
    startTypewriter(getCurrentSlideText());
  }

  $: if (slide === totalSlides && typewriterTimer) {
    clearTypewriter();
  }

  const clearAutoAdvance = () => {
    if (autoAdvanceTimer) {
      clearTimeout(autoAdvanceTimer);
      autoAdvanceTimer = null;
    }
  };

  const updateBitmapText = () => {
    if (!bitmapFont || !bitmapFontImage) return;
    try {
      const text = buildBitmapText();
      const canvas = renderBitmapTextToCanvas(bitmapFont, bitmapFontImage, text, {
        scale: 1.0,
        letterSpacing: 3,
        lineSpacing: 10
      });
      bitmapTextUrl = canvas.toDataURL('image/png');

      const buttonCanvas = renderBitmapTextToCanvas(bitmapFont, bitmapFontImage, getButtonLabel(), {
        scale: 1.0,
        letterSpacing: 3,
        lineSpacing: 0
      });
      buttonTextUrl = buttonCanvas.toDataURL('image/png');
    } catch (e) {
      console.warn('Failed to render bitmap text:', e);
    }
  };

  $: if (bitmapFont && bitmapFontImage) {
    slide;
    countdown;
    $completedStations;
    $totalStations;
    storyText;
    storyParagraphs;
    storyLoading;
    storyError;
    typedText;
    updateBitmapText();
  }

  $: {
    if (slide === totalSlides) {
      startCountdown();
    } else {
      clearCountdown();
    }

    if (slide === 1) {
      startAutoAdvance();
    }
  }

  onMount(async () => {
    try {
      backgroundUrl = await getTextureUrl('loading1');
    } catch (e) {
      console.warn('Failed to resolve intro background texture:', e);
    }

    try {
      const { font, image } = await loadBitmapFont(fontXmlUrl, fontImageUrl);
      bitmapFont = font;
      bitmapFontImage = image;
      updateBitmapText();
    } catch (e) {
      console.warn('Failed to create bitmap font texture:', e);
    }

    await loadStory();
  });

  onDestroy(() => {
    clearCountdown();
    clearAutoAdvance();
    clearTypewriter();
  });
</script>

<div class="absolute inset-0 z-20 overflow-hidden">
  {#if backgroundUrl}
    <div class="absolute inset-0 bg-cover bg-center" style="background-image: url('{backgroundUrl}')"></div>
  {/if}
  <div class="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),rgba(15,23,42,0.94))]"></div>
  <div class="relative flex min-h-full items-center justify-center px-4">
    <div class="w-full max-w-[80vw] p-8 rounded-[22px] bg-slate-950/5 text-slate-100 shadow-[0_18px_50px_rgba(0,0,0,0.25)] text-left backdrop-blur-sm">
      {#if bitmapTextUrl}
        <img src={bitmapTextUrl} alt="Intro text" class="mx-auto mb-6 max-w-full" />
      {:else}
        <h1 class="mb-4 text-3xl font-semibold tracking-[0.03em]">Loading...</h1>
      {/if}
      <button class="mx-auto mb-6 block rounded-full stroke-1 stroke-amber-50 px-8 py-3 font-bold text-white transition hover:bg-blue-500" type="button" on:click={handleButton}>
        {#if buttonTextUrl}
          <img src={buttonTextUrl} alt={getButtonLabel()} class="mx-auto h-6" />
        {:else}
          {getButtonLabel()}
        {/if}
      </button>
    </div>
  </div>
</div>
