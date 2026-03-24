/**
 * verify-conversion.mjs
 *
 * Verifies image conversion using Firefox + canvas, then magick identify.
 * Also specifically tests the inline-image (data: URL source) bug that the
 * `dataurl === srcUrl` bypass in processImageSave introduced.
 *
 * Usage:  node tests/verify-conversion.mjs
 *   or:   bun tests/verify-conversion.mjs
 */

import { firefox } from "@playwright/test";
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// ─── Injected browser helpers ─────────────────────────────────────────────────

const INJECT = `
  // Verbatim from src/offscreen/offscreen.js — this is what the extension runs.
  window._convert = function(srcDataUrl, type) {
    return new Promise(function(resolve, reject) {
      var mimeType = 'image/' + (type === 'jpg' ? 'jpeg' : type);
      var img = new Image();
      img.onerror = function() { reject(new Error('load failed')); };
      img.onload  = function() {
        var canvas = document.createElement('canvas');
        canvas.width  = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        resolve(canvas.toDataURL(mimeType));
      };
      img.src = srcDataUrl;
    });
  };

  // Build a 200×200 source image with gradient + noise.
  window._makeSource = function(type) {
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = 200;
    var ctx = canvas.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 200, 200);
    g.addColorStop(0,   '#ff6347');
    g.addColorStop(0.5, '#4169e1');
    g.addColorStop(1,   '#32cd32');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 200, 200);
    for (var i = 0; i < 500; i++) {
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.fillRect(Math.random()*200, Math.random()*200, 2, 2);
    }
    return canvas.toDataURL('image/' + (type === 'jpg' ? 'jpeg' : type));
  };

  // Verbatim from src/background.js — the real fetchAsDataURL the extension uses.
  // For data: URLs it returns src as-is; the caller must still run conversion.
  window._fetchAsDataURL = function(src, callback) {
    if (src.startsWith('data:')) { callback(null, src); return; }
    fetch(src).then(r => r.blob()).then(function(blob) {
      if (!blob.size) throw 'Fetch failed of 0 size';
      var buffer = blob.arrayBuffer();
      return buffer.then(function(buf) {
        var bytes = new Uint8Array(buf), binary = '', chunk = 8192;
        for (var i = 0; i < bytes.length; i += chunk)
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        callback(null, 'data:' + blob.type + ';base64,' + btoa(binary));
      });
    }).catch(function(err) { callback(err.message || String(err)); });
  };

  // Full pipeline: fetchAsDataURL → noChange check → convert if needed.
  // Mirrors what processImageSave does in background.js.
  window._pipeline = function(srcUrl, type) {
    return new Promise(function(resolve, reject) {
      var noChange = srcUrl.startsWith('data:image/' + (type === 'jpg' ? 'jpeg' : type) + ';');
      window._fetchAsDataURL(srcUrl, function(error, dataurl) {
        if (error) { reject(new Error(error)); return; }
        if (noChange) { resolve(dataurl); return; }   // already right format
        window._convert(dataurl, type).then(resolve).catch(reject);
      });
    });
  };
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dataUrlToBuffer(dataUrl) {
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

function magickFormat(filePath) {
  const out = execSync(`magick identify "${filePath}" 2>&1`).toString();
  // e.g. "/tmp/foo.jpg JPEG 200x200 …"
  return out.split(" ")[1]?.toUpperCase() ?? "UNKNOWN";
}

function write(buf, ext) {
  const p = join(tmpdir(), `siat-verify-${Date.now()}.${ext}`);
  writeFileSync(p, buf);
  return p;
}

// ─── Test runner ──────────────────────────────────────────────────────────────

let passed = 0, failed = 0;

function ok(label, detail = "") {
  console.log(`  ✓  ${label}${detail ? `  —  ${detail}` : ""}`);
  passed++;
}

function fail(label, detail = "") {
  console.log(`  ✗  ${label}${detail ? `  —  ${detail}` : ""}`);
  failed++;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log("\nLaunching Firefox…\n");
const browser = await firefox.launch({ headless: true });
const page    = await browser.newPage();
await page.goto("about:blank");
await page.evaluate(INJECT);

// ── Section 1: Canvas conversion — all 6 pairs ────────────────────────────────
console.log("Section 1: Canvas conversion (magick verify)");
console.log("─".repeat(50));

const PAIRS = [
  { from: "png",  to: "jpg"  },
  { from: "png",  to: "webp" },
  { from: "jpg",  to: "png"  },
  { from: "jpg",  to: "webp" },
  { from: "webp", to: "png"  },
  { from: "webp", to: "jpg"  },
];

const EXPECTED = { jpg: "JPEG", png: "PNG", webp: "WEBP" };

for (const { from, to } of PAIRS) {
  const src    = await page.evaluate((f) => window._makeSource(f), from);
  const out    = await page.evaluate(([s, t]) => window._convert(s, t), [src, to]);
  const buf    = dataUrlToBuffer(out);
  const path   = write(buf, to === "jpg" ? "jpg" : to);
  const format = magickFormat(path);
  const kb     = (buf.length / 1024).toFixed(1);
  const label  = `${from.toUpperCase()} → ${to.toUpperCase()}  (${kb} KB, magick: ${format})`;

  format === EXPECTED[to] ? ok(label) : fail(label, `expected ${EXPECTED[to]}`);
}

// ── Section 2: Full pipeline with inline (data: URL) sources ─────────────────
// fetchAsDataURL returns a data: URL unchanged; the pipeline must still convert.
// This is the path the broken `dataurl === srcUrl` bypass short-circuited.
console.log();
console.log("Section 2: Full pipeline — inline image (data: URL) sources");
console.log("─".repeat(50));

for (const { from, to } of [
  { from: "webp", to: "png" },
  { from: "webp", to: "jpg" },
  { from: "png",  to: "jpg" },
  { from: "jpg",  to: "webp" },
]) {
  const srcDataUrl = await page.evaluate((f) => window._makeSource(f), from);
  const out        = await page.evaluate(([s, t]) => window._pipeline(s, t), [srcDataUrl, to]);
  const buf        = dataUrlToBuffer(out);
  const format     = magickFormat(write(buf, to === "jpg" ? "jpg" : to));
  const kb         = (buf.length / 1024).toFixed(1);
  const label      = `data:${from} → ${to.toUpperCase()}  (${kb} KB, magick: ${format})`;

  format === EXPECTED[to] ? ok(label) : fail(label, `expected ${EXPECTED[to]}`);
}

await browser.close();

// ── Summary ───────────────────────────────────────────────────────────────────
console.log();
console.log("─".repeat(50));
console.log(`Passed: ${passed}   Failed: ${failed}`);
console.log();
if (failed > 0) process.exit(1);
