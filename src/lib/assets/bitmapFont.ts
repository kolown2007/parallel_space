export interface BitmapFontChar {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  xoffset: number;
  yoffset: number;
  xadvance: number;
  page: number;
  chnl: number;
}

export interface BitmapFont {
  lineHeight: number;
  base: number;
  scaleW: number;
  scaleH: number;
  pages: string[];
  chars: Record<number, BitmapFontChar>;
  kernings: Record<string, number>;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = url;
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error(`Failed to load bitmap font image: ${url}`));
  });
}

function parseIntAttr(node: Element, attr: string, fallback = 0): number {
  const value = node.getAttribute(attr);
  return value === null ? fallback : parseInt(value, 10) || fallback;
}

function parseBitmapFontXml(xmlText: string): BitmapFont {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const error = doc.querySelector('parsererror');
  if (error) {
    throw new Error('Failed to parse bitmap font XML: ' + error.textContent);
  }

  const common = doc.querySelector('common');
  if (!common) throw new Error('Bitmap font XML missing <common> element');

  const lineHeight = parseIntAttr(common, 'lineHeight');
  const base = parseIntAttr(common, 'base');
  const scaleW = parseIntAttr(common, 'scaleW');
  const scaleH = parseIntAttr(common, 'scaleH');

  const pages: string[] = [];
  doc.querySelectorAll('pages page').forEach((pageNode) => {
    const file = pageNode.getAttribute('file');
    if (file) pages.push(file);
  });

  const chars: Record<number, BitmapFontChar> = {};
  doc.querySelectorAll('chars char').forEach((charNode) => {
    const id = parseIntAttr(charNode, 'id');
    chars[id] = {
      id,
      x: parseIntAttr(charNode, 'x'),
      y: parseIntAttr(charNode, 'y'),
      width: parseIntAttr(charNode, 'width'),
      height: parseIntAttr(charNode, 'height'),
      xoffset: parseIntAttr(charNode, 'xoffset'),
      yoffset: parseIntAttr(charNode, 'yoffset'),
      xadvance: parseIntAttr(charNode, 'xadvance'),
      page: parseIntAttr(charNode, 'page'),
      chnl: parseIntAttr(charNode, 'chnl')
    };
  });

  const kernings: Record<string, number> = {};
  doc.querySelectorAll('kernings kerning').forEach((kerningNode) => {
    const first = parseIntAttr(kerningNode, 'first');
    const second = parseIntAttr(kerningNode, 'second');
    const amount = parseIntAttr(kerningNode, 'amount');
    kernings[`${first},${second}`] = amount;
  });

  return {
    lineHeight,
    base,
    scaleW,
    scaleH,
    pages,
    chars,
    kernings
  };
}

export async function loadBitmapFont(xmlUrl: string, imageUrl: string): Promise<{ font: BitmapFont; image: HTMLImageElement }> {
  const response = await fetch(xmlUrl);
  if (!response.ok) {
    throw new Error(`Failed to load bitmap font XML: ${response.status}`);
  }

  const xmlText = await response.text();
  const font = parseBitmapFontXml(xmlText);
  const image = await loadImage(imageUrl);
  return { font, image };
}

export function measureBitmapText(font: BitmapFont, text: string, letterSpacing = 0): { width: number; height: number } {
  const lines = text.split('\n');
  let maxWidth = 0;

  for (const line of lines) {
    let width = 0;
    for (let i = 0; i < line.length; i++) {
      const code = line.charCodeAt(i);
      const ch = font.chars[code];
      if (!ch) {
        width += font.chars[32]?.xadvance ?? 20;
        continue;
      }
      width += ch.xadvance + letterSpacing;
      if (i < line.length - 1) {
        const nextCode = line.charCodeAt(i + 1);
        width += font.kernings[`${code},${nextCode}`] ?? 0;
      }
    }
    maxWidth = Math.max(maxWidth, width);
  }

  return { width: Math.ceil(maxWidth), height: font.lineHeight * lines.length };
}

export function renderBitmapTextToCanvas(
  font: BitmapFont,
  image: HTMLImageElement,
  text: string,
  options: { scale?: number; letterSpacing?: number; lineSpacing?: number } = {}
): HTMLCanvasElement {
  const scale = options.scale ?? 1;
  const letterSpacing = options.letterSpacing ?? 0;
  const lineSpacing = options.lineSpacing ?? 0;

  const lines = text.split('\n');
  const measured = measureBitmapText(font, text, letterSpacing);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(measured.width * scale));
  canvas.height = Math.max(1, Math.ceil((font.lineHeight * lines.length + lineSpacing * (lines.length - 1)) * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create canvas context for bitmap font rendering');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    let x = 0;
    const yBase = lineIndex * (font.lineHeight + lineSpacing) * scale;

    for (let i = 0; i < line.length; i++) {
      const code = line.charCodeAt(i);
      const ch = font.chars[code];
      if (!ch) {
        x += (font.chars[32]?.xadvance ?? 20) * scale;
        continue;
      }

      const dx = x + ch.xoffset * scale;
      const dy = yBase + ch.yoffset * scale;
      ctx.drawImage(
        image,
        ch.x,
        ch.y,
        ch.width,
        ch.height,
        dx,
        dy,
        ch.width * scale,
        ch.height * scale
      );

      x += (ch.xadvance + letterSpacing) * scale;
      const nextCode = i < line.length - 1 ? line.charCodeAt(i + 1) : -1;
      if (nextCode >= 0) {
        x += (font.kernings[`${code},${nextCode}`] ?? 0) * scale;
      }
    }
  }

  return canvas;
}
