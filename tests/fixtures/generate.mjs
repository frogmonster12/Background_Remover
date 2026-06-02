/**
 * Generates minimal test fixture images using Node's built-in capabilities.
 * Run once: node tests/fixtures/generate.mjs
 * Outputs: sample.png, sample.jpg, sample.webp, hair-sample.png
 */
import { writeFileSync } from 'fs';

// Minimal 1x1 valid PNG (red pixel)
function tiny1x1PNG(r, g, b) {
  // Hand-crafted valid PNG bytes for a 1x1 RGB image
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR length + type
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // width=1, height=1
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // bit depth=8, colortype=2(RGB), crc
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, // IDAT length + type
    0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, // zlib compressed pixel
    0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, // crc
    0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, // IEND
    0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  return png;
}

// Use a known-good 2x2 PNG with RGBA
function make2x2PNG() {
  // 2x2 RGBA PNG — pre-encoded (verified valid)
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAADklEQVQI12P4' +
    'z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
}

writeFileSync('tests/fixtures/sample.png', make2x2PNG());
// JPEG: use same base64 trick — minimal valid 1x1 JPEG
writeFileSync('tests/fixtures/sample.jpg', Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U' +
  'HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN' +
  'DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy' +
  'MjL/wAARCAABAAEDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABgUE/8QAIhAAAQME' +
  'AgMAAAAAAAAAAAAAAQIDBBEhMQUSQVH/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAA' +
  'AAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKqaiqY6mnjqIHh8UjQ5rhyCD3BH8pSlAf/Z',
  'base64'
));
// WEBP: minimal valid WebP
writeFileSync('tests/fixtures/sample.webp', Buffer.from(
  'UklGRlYAAABXRUJQVlA4IEoAAADQAQCdASoBAAEAAkA4JZQCdAEO/gHOAAD++P/h' +
  'f6v/yf/g/8n/5v/K/8P/1v/K/8D/1v/I/8T/1f/K/8P/1v/I/8T/1f/K/8T/1f/I' +
  '/8T/1f/I/8T/1gA=',
  'base64'
));
// hair-sample.png — same 2x2 PNG; real hair fixture added manually
writeFileSync('tests/fixtures/hair-sample.png', make2x2PNG());

console.log('Fixtures written: sample.png, sample.jpg, sample.webp, hair-sample.png');
