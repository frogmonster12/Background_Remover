/**
 * Minimal OffscreenCanvas + ImageData polyfill for happy-dom.
 * happy-dom v20 does not expose these globals; this file is loaded
 * via vitest setupFiles so compose.ts tests can run headless.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

function parseHexColor(color: string): [number, number, number] {
  const m6 = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (m6) return [parseInt(m6[1]!, 16), parseInt(m6[2]!, 16), parseInt(m6[3]!, 16)];
  const m3 = color.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (m3)
    return [
      parseInt(m3[1]! + m3[1]!, 16),
      parseInt(m3[2]! + m3[2]!, 16),
      parseInt(m3[3]! + m3[3]!, 16),
    ];
  return [0, 0, 0];
}

class MockImageData {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;

  constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, h?: number) {
    if (typeof dataOrWidth === 'number') {
      this.width = dataOrWidth;
      this.height = widthOrHeight;
      this.data = new Uint8ClampedArray(dataOrWidth * widthOrHeight * 4);
    } else {
      this.data = new Uint8ClampedArray(dataOrWidth);
      this.width = widthOrHeight;
      this.height = h ?? dataOrWidth.length / 4 / widthOrHeight;
    }
  }
}

class MockCanvasContext {
  fillStyle = '#000000';
  private readonly px: Uint8ClampedArray;
  private readonly cw: number;

  constructor(px: Uint8ClampedArray, cw: number) {
    this.px = px;
    this.cw = cw;
  }

  putImageData(data: MockImageData, ox: number, oy: number): void {
    for (let row = 0; row < data.height; row++) {
      for (let col = 0; col < data.width; col++) {
        const si = (row * data.width + col) * 4;
        const di = ((oy + row) * this.cw + (ox + col)) * 4;
        if (di + 3 < this.px.length) {
          this.px[di] = data.data[si]!;
          this.px[di + 1] = data.data[si + 1]!;
          this.px[di + 2] = data.data[si + 2]!;
          this.px[di + 3] = data.data[si + 3]!;
        }
      }
    }
  }

  getImageData(ox: number, oy: number, w: number, h: number): MockImageData {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const si = ((oy + row) * this.cw + (ox + col)) * 4;
        const di = (row * w + col) * 4;
        out[di] = this.px[si]!;
        out[di + 1] = this.px[si + 1]!;
        out[di + 2] = this.px[si + 2]!;
        out[di + 3] = this.px[si + 3]!;
      }
    }
    return new MockImageData(out, w, h);
  }

  fillRect(x: number, y: number, fw: number, fh: number): void {
    const [r, g, b] = parseHexColor(this.fillStyle);
    for (let row = y; row < y + fh; row++) {
      for (let col = x; col < x + fw; col++) {
        const i = (row * this.cw + col) * 4;
        this.px[i] = r;
        this.px[i + 1] = g;
        this.px[i + 2] = b;
        this.px[i + 3] = 255;
      }
    }
  }

  drawImage(src: unknown, dx: number, dy: number, dw?: number, dh?: number): void {
    if (!(src instanceof MockOffscreenCanvas)) return;
    const srcData = src.getContext('2d').getImageData(0, 0, src.width, src.height);
    const actualDw = dw ?? src.width;
    const actualDh = dh ?? src.height;
    for (let row = 0; row < actualDh; row++) {
      for (let col = 0; col < actualDw; col++) {
        const sr = Math.min(src.height - 1, Math.floor((row / actualDh) * src.height));
        const sc = Math.min(src.width - 1, Math.floor((col / actualDw) * src.width));
        const si = (sr * src.width + sc) * 4;
        const di = ((dy + row) * this.cw + (dx + col)) * 4;
        if (di + 3 < this.px.length && di >= 0) {
          this.px[di] = srcData.data[si]!;
          this.px[di + 1] = srcData.data[si + 1]!;
          this.px[di + 2] = srcData.data[si + 2]!;
          this.px[di + 3] = srcData.data[si + 3]!;
        }
      }
    }
  }
}

class MockOffscreenCanvas {
  readonly width: number;
  readonly height: number;
  private readonly px: Uint8ClampedArray;
  private ctx: MockCanvasContext | null = null;

  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.px = new Uint8ClampedArray(w * h * 4);
  }

  getContext(_type: string): MockCanvasContext {
    if (!this.ctx) this.ctx = new MockCanvasContext(this.px, this.width);
    return this.ctx;
  }

  async convertToBlob(opts?: { type?: string; quality?: number }): Promise<Blob> {
    void opts?.quality;
    return new Blob([new Uint8Array(this.px)], { type: opts?.type ?? 'image/png' });
  }
}

(globalThis as any).OffscreenCanvas = MockOffscreenCanvas;
(globalThis as any).ImageData = MockImageData;
