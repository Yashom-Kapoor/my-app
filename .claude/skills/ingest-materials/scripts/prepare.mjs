// Download one material, store the original, and render it for transcription.
// Usage: node .claude/skills/ingest-materials/scripts/prepare.mjs <material-id> [--page N]
//
// Writes .ingest/<id>/:
//   meta.json   what was rendered: sheets (slides, 16 per image) or pages, plus "sparse" pages
//   text.json   the PDF text layer per page: [{ page, text }]
//   sheet-NN.png (slides) or page-NNN.png (everything else); with --page N, single-NNN.png
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import * as mupdf from "mupdf";
import sharp from "sharp";
import { CANVAS_BASE, WORK_DIR, db, decrypt, fail, ownerId } from "./lib.mjs";

const [id, flag, pageArg] = process.argv.slice(2);
if (!id) fail("usage: prepare.mjs <material-id> [--page N]");

const COLS = 4;
const PER_SHEET = 16;
const SHEET_WIDTH = 2576; // largest image edge current Claude models read at full resolution
const GAP = 8;
const PAGE_EDGE = 2000; // long edge for one-page-per-image renders
const SPARSE_CHARS = 40; // less text than this: likely a diagram or image slide

const userId = await ownerId();
const { data: m, error } = await db
  .from("materials")
  .select("id, course_id, kind, format, title, status, source_url, content_hash, course:courses ( code, canvas_id )")
  .eq("id", id)
  .eq("user_id", userId)
  .single();
if (error) fail(`material ${id}: ${error.message}`);

async function canvasToken() {
  const { data } = await db.from("class_connections").select("secret").eq("user_id", userId).eq("provider", "canvas").single();
  if (!data) throw new Error("bCourses is not connected");
  return decrypt(data.secret);
}

async function download() {
  let url = m.source_url;
  let headers = {};
  if (m.format === "gslides") url = `${m.source_url}/export/pdf`;
  else if (url.startsWith(`${CANVAS_BASE}/courses/`)) {
    // bCourses file pages need the API for an authorized download URL.
    const token = await canvasToken();
    const [, course, file] = url.match(/courses\/(\d+)\/files\/(\d+)/);
    const res = await fetch(`${CANVAS_BASE}/api/v1/courses/${course}/files/${file}`, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`bCourses file lookup returned ${res.status}`);
    url = (await res.json()).url;
    headers = { authorization: `Bearer ${token}` };
  }
  const res = await fetch(url, { headers, redirect: "follow" });
  if (!res.ok) throw new Error(`download returned ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error(`not a PDF (${res.headers.get("content-type")})`);
  return bytes;
}

function renderPage(doc, index, longEdge) {
  const page = doc.loadPage(index);
  const [x0, y0, x1, y1] = page.getBounds();
  const scale = longEdge / Math.max(x1 - x0, y1 - y0);
  const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
  return Buffer.from(pixmap.asPNG());
}

/** Slide number badge in the bottom-right corner, where slides rarely have content. */
function label(n, width, height) {
  const size = Math.round(height * 0.075);
  const w = Math.round(size * (String(n).length * 0.62 + 0.6));
  const h = Math.round(size * 1.3);
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="${width - w}" y="${height - h}" width="${w}" height="${h}" fill="#c00"/>` +
      `<text x="${width - w / 2}" y="${height - h * 0.25}" text-anchor="middle" font-family="Helvetica, Arial" font-weight="bold" font-size="${size}" fill="#fff">${n}</text>` +
      `</svg>`,
  );
}

try {
  const bytes = await download();
  const hash = createHash("sha256").update(bytes).digest("hex");
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  const pageCount = doc.countPages();
  const dir = `${WORK_DIR}/${id}`;
  mkdirSync(dir, { recursive: true });

  if (flag === "--page") {
    const n = Number(pageArg);
    if (!(n >= 1 && n <= pageCount)) fail(`page must be 1-${pageCount}`);
    const file = `${dir}/single-${String(n).padStart(3, "0")}.png`;
    writeFileSync(file, renderPage(doc, n - 1, SHEET_WIDTH));
    console.log(JSON.stringify({ file }));
    process.exit(0);
  }

  const text = [];
  for (let i = 0; i < pageCount; i++) {
    text.push({ page: i + 1, text: doc.loadPage(i).toStructuredText("preserve-whitespace").asText().trim() });
  }
  writeFileSync(`${dir}/text.json`, JSON.stringify(text, null, 1));
  const sparse = text.filter((t) => t.text.replace(/\s/g, "").length < SPARSE_CHARS).map((t) => t.page);

  const meta = { id, course: m.course.code, kind: m.kind, title: m.title, pageCount, sparse, sheets: [], pages: [] };
  if (m.kind === "slides") {
    const tileW = Math.floor((SHEET_WIDTH - GAP * (COLS + 1)) / COLS);
    for (let start = 0; start < pageCount; start += PER_SHEET) {
      const indexes = [...Array(Math.min(PER_SHEET, pageCount - start)).keys()].map((k) => start + k);
      const tiles = await Promise.all(
        indexes.map((i) => sharp(renderPage(doc, i, tileW * 2)).resize({ width: tileW }).png().toBuffer({ resolveWithObject: true })),
      );
      const tileH = Math.max(...tiles.map((t) => t.info.height));
      const rows = Math.ceil(indexes.length / COLS);
      const composites = tiles.flatMap((t, k) => {
        const left = GAP + (k % COLS) * (tileW + GAP);
        const top = GAP + Math.floor(k / COLS) * (tileH + GAP);
        return [
          { input: t.data, left, top },
          { input: label(indexes[k] + 1, t.info.width, t.info.height), left, top },
        ];
      });
      const file = `${dir}/sheet-${String(meta.sheets.length + 1).padStart(2, "0")}.png`;
      await sharp({ create: { width: SHEET_WIDTH, height: GAP + rows * (tileH + GAP), channels: 3, background: "#888" } })
        .composite(composites)
        .png()
        .toFile(file);
      meta.sheets.push({ file, pages: indexes.map((i) => i + 1) });
    }
  } else {
    for (let i = 0; i < pageCount; i++) {
      const file = `${dir}/page-${String(i + 1).padStart(3, "0")}.png`;
      writeFileSync(file, renderPage(doc, i, PAGE_EDGE));
      meta.pages.push({ file, page: i + 1 });
    }
  }
  writeFileSync(`${dir}/meta.json`, JSON.stringify(meta, null, 1));

  const storagePath = `${userId}/${m.course_id}/${id}.pdf`;
  const { error: upErr } = await db.storage.from("materials").upload(storagePath, bytes, { contentType: "application/pdf", upsert: true });
  if (upErr) throw new Error(`storage upload: ${upErr.message}`);
  // Re-preparing a saved material (to re-check it) keeps it ready, so the reader keeps showing it.
  const status = m.status === "ready" ? "ready" : "processing";
  await db
    .from("materials")
    .update({ status, error: null, storage_path: storagePath, content_hash: hash, page_count: pageCount })
    .eq("id", id);

  console.log(JSON.stringify({ dir, pageCount, sheets: meta.sheets.length, pages: meta.pages.length, sparse }));
} catch (e) {
  if (m.status !== "ready") await db.from("materials").update({ status: "failed", error: e.message }).eq("id", id);
  fail(`prepare failed: ${e.message}`);
}
