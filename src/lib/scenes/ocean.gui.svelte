<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { completedStations, totalStations } from '$lib/stores/stationProgress';
  import { loadBitmapFont, measureBitmapText, renderBitmapTextToCanvas } from '$lib/bitmapFont';
  import type { BitmapFont } from '$lib/bitmapFont';

  interface Props {
    result?: 'success' | 'failure';
    onNewMission?: () => void;
  }

  const { result = 'failure', onNewMission = () => {} }: Props = $props();

  const fontXmlUrl = '/td.xml';
  const fontImageUrl = '/td6.png';

  let bitmapFont = $state<BitmapFont | null>(null);
  let bitmapFontImage = $state<HTMLImageElement | null>(null);
  let bitmapCanvas = $state<HTMLCanvasElement | null>(null);
  let buttonArea = $state({ x: 0, y: 0, width: 0, height: 0 });
  let fontLoadError = $state(false);

  const getTitleText = () => result === 'success' ? 'Mission Complete' : 'Mission Failed';
  const getBodyText = () => result === 'success'
    ? 'Great job! Progress secured. Ready for a new mission?'
    : 'Progress deducted 1. Ready for a new mission?';
  const getButtonLabel = () => result === 'success' ? 'Next Mission' : 'New Mission';
  const getStatsLabel = () => 'Completed stations';

  const wrapBitmapText = (text: string, maxWidth: number, font: BitmapFont, letterSpacing = 2) => {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      const width = measureBitmapText(font, candidate, letterSpacing).width;
      if (currentLine && width > maxWidth) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = candidate;
      }
    }

    if (currentLine) lines.push(currentLine);
    return lines;
  };

  const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  };

  const updateBitmapCanvas = () => {
    if (!bitmapFont || !bitmapFontImage || !bitmapCanvas) return;

    try {
      const padding = 28;
      const maxTextWidth = 420;
      const lineSpacing = 10;
      const titleScale = 1.05;
      const bodyScale = 1.0;
      const metadataScale = 0.8;
      const buttonScale = 1.0;
      const buttonPaddingX = 24;
      const buttonPaddingY = 16;

      const bodyLines = wrapBitmapText(getBodyText(), maxTextWidth, bitmapFont, 2);
      const entries = [
        { text: getTitleText(), options: { scale: titleScale, letterSpacing: 3, lineSpacing: 0 }, isButton: false },
        { text: '', options: { scale: bodyScale, letterSpacing: 0, lineSpacing: 0 }, isButton: false },
        ...bodyLines.map((line) => ({ text: line, options: { scale: bodyScale, letterSpacing: 2, lineSpacing: 0 }, isButton: false })),
        { text: '', options: { scale: bodyScale, letterSpacing: 0, lineSpacing: 0 }, isButton: false },
        { text: getStatsLabel(), options: { scale: metadataScale, letterSpacing: 2, lineSpacing: 0 }, isButton: false },
        { text: `${$completedStations} / ${$totalStations}`, options: { scale: bodyScale, letterSpacing: 2, lineSpacing: 0 }, isButton: false },
        { text: '', options: { scale: bodyScale, letterSpacing: 0, lineSpacing: 0 }, isButton: false },
        { text: getButtonLabel(), options: { scale: buttonScale, letterSpacing: 3, lineSpacing: 0 }, isButton: true }
      ];

      const activeFont = bitmapFont;
      const activeImage = bitmapFontImage;
      if (!activeFont || !activeImage) return;

      const canvases = entries.map((entry) => entry.text
        ? renderBitmapTextToCanvas(activeFont, activeImage, entry.text, entry.options)
        : null);

      let contentWidth = 0;
      const lineHeights: number[] = [];
      canvases.forEach((canvas, index) => {
        if (canvas) {
          contentWidth = Math.max(contentWidth, canvas.width);
          lineHeights.push(canvas.height);
        } else {
          lineHeights.push(activeFont.lineHeight * entries[index].options.scale);
        }
      });

      const buttonCanvas = canvases[canvases.length - 1];
      const buttonLineWidth = buttonCanvas?.width ?? 0;
      const buttonWidth = buttonLineWidth + buttonPaddingX * 2;
      contentWidth = Math.max(contentWidth, buttonWidth);

      const canvasWidth = Math.ceil(contentWidth + padding * 2);
      const canvasHeight = Math.ceil(
        lineHeights.reduce((sum, height) => sum + height, 0) +
        lineSpacing * (entries.length - 1) +
        padding * 2
      );

      bitmapCanvas.width = canvasWidth;
      bitmapCanvas.height = canvasHeight;
      const ctx = bitmapCanvas.getContext('2d');
      if (!ctx) throw new Error('Unable to draw bitmap ocean overlay');

      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.96)';
      drawRoundedRect(ctx, 0, 0, canvasWidth, canvasHeight, 28);
      ctx.fill();

      let y = padding;
      let buttonX = 0;
      let buttonY = 0;
      let buttonHeight = 0;

      entries.forEach((entry, index) => {
        const lineCanvas = canvases[index];
        const lineHeight = lineHeights[index];
        const lineWidth = lineCanvas?.width ?? 0;
        const x = Math.round(padding + (contentWidth - lineWidth) / 2);

        if (entry.isButton && lineCanvas) {
          buttonX = Math.round(padding + (contentWidth - buttonWidth) / 2);
          buttonY = Math.round(y - buttonPaddingY / 2);
          buttonHeight = Math.round(lineHeight + buttonPaddingY);

          ctx.fillStyle = result === 'success' ? 'rgba(16, 185, 129, 0.16)' : 'rgba(249, 115, 22, 0.16)';
          drawRoundedRect(ctx, buttonX, buttonY, buttonWidth, buttonHeight, 24);
          ctx.fill();

          ctx.strokeStyle = result === 'success' ? 'rgba(16, 185, 129, 0.32)' : 'rgba(249, 115, 22, 0.32)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        if (lineCanvas) {
          ctx.drawImage(lineCanvas, x, y);
        }

        y += lineHeight + lineSpacing;
      });

      buttonArea = {
        x: buttonX,
        y: buttonY,
        width: buttonWidth,
        height: buttonHeight
      };
    } catch (error) {
      console.warn('Failed to render ocean GUI bitmap canvas:', error);
      fontLoadError = true;
    }
  };

  const handleCanvasClick = (event: MouseEvent) => {
    if (!bitmapCanvas) return;
    const rect = bitmapCanvas.getBoundingClientRect();
    const scaleX = bitmapCanvas.width / rect.width;
    const scaleY = bitmapCanvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    if (
      x >= buttonArea.x && x <= buttonArea.x + buttonArea.width &&
      y >= buttonArea.y && y <= buttonArea.y + buttonArea.height
    ) {
      onNewMission();
    }
  };

  onMount(async () => {
    try {
      const { font, image } = await loadBitmapFont(fontXmlUrl, fontImageUrl);
      bitmapFont = font;
      bitmapFontImage = image;
      updateBitmapCanvas();
    } catch (error) {
      console.warn('Failed to load bitmap font for ocean GUI:', error);
      fontLoadError = true;
    }
  });

  $effect(() => {
    if (bitmapFont && bitmapFontImage && bitmapCanvas) {
      updateBitmapCanvas();
    }
  });

  onDestroy(() => {
    // No cleanup required for canvas rendering.
  });
</script>

<div class="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
  <div class="relative pointer-events-auto max-w-md text-center shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
    {#if bitmapFont && !fontLoadError}
      <canvas bind:this={bitmapCanvas} class="mx-auto block max-w-full rounded-[28px]" onclick={handleCanvasClick}></canvas>
    {:else}
      <div class="pointer-events-auto max-w-md rounded-[28px] border border-slate-700 bg-slate-950/30 p-8 text-center">
        <div class="mb-4 text-3xl font-bold {result === 'success' ? 'text-emerald-300' : 'text-orange-300'}">{getTitleText()}</div>
        <p class="mb-6 text-sm leading-relaxed text-slate-300">{getBodyText()}</p>
        <div class="mb-6 rounded-3xl border border-slate-700 bg-slate-900/80 p-4 text-slate-200">
          <div class="text-[10px] uppercase tracking-[0.3em] text-slate-400 mb-2">{getStatsLabel()}</div>
          <div class="text-3xl font-bold">{$completedStations} / {$totalStations}</div>
        </div>
        <button class="rounded-full px-8 py-3 text-sm font-semibold text-white transition {result === 'success' ? 'bg-emerald-500 hover:bg-emerald-400' : 'bg-orange-500 hover:bg-orange-400'}" type="button" onclick={onNewMission}>
          {getButtonLabel()}
        </button>
      </div>
    {/if}
  </div>
</div>
