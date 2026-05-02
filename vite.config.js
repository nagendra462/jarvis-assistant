import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, 'jarvis-data.json');
const MODEL_FILE = path.join(__dirname, 'jarvis-usermodel.json');
const JOURNALS_DIR = path.join(__dirname, 'jarvis-journals');

// ===== Shared helpers =====
function readData() {
  try { if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); } catch {}
  return {};
}
function writeData(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8'); }

function readModel() {
  try { if (fs.existsSync(MODEL_FILE)) return JSON.parse(fs.readFileSync(MODEL_FILE, 'utf-8')); } catch {}
  return {};
}
function writeModel(data) { fs.writeFileSync(MODEL_FILE, JSON.stringify(data, null, 2), 'utf-8'); }

function ensureJournalsDir() {
  if (!fs.existsSync(JOURNALS_DIR)) fs.mkdirSync(JOURNALS_DIR, { recursive: true });
}

function journalPath(date) {
  ensureJournalsDir();
  return path.join(JOURNALS_DIR, `${date}.json`);
}

function readJournal(date) {
  try {
    const p = journalPath(date);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {}
  return null;
}

function writeJournal(date, data) {
  ensureJournalsDir();
  fs.writeFileSync(journalPath(date), JSON.stringify(data, null, 2), 'utf-8');
}

function listJournals(days = 30) {
  ensureJournalsDir();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  try {
    return fs.readdirSync(JOURNALS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
      .filter(date => new Date(date) >= cutoff)
      .sort()
      .reverse()
      .map(date => ({ date, ...readJournal(date) }));
  } catch { return []; }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid JSON')); } });
  });
}

// Strip HTML tags for URL reader
function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{3,}/g, '\n\n')
    .trim()
    .slice(0, 12000); // max 12k chars to Gemini
}

// ===== Server Plugin =====
function jarvisServerPlugin() {
  return {
    name: 'jarvis-server',
    configureServer(server) {

      // --- MODEL API ---
      server.middlewares.use('/api/model', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method === 'GET') {
          res.end(JSON.stringify(readModel()));
          return;
        }
        if (req.method === 'POST') {
          try {
            const body = await parseBody(req);
            writeModel(body);
            res.end(JSON.stringify({ ok: true }));
          } catch { res.statusCode = 400; res.end('Bad request'); }
          return;
        }
        res.statusCode = 405; res.end('Method not allowed');
      });

      // --- JOURNAL API ---
      server.middlewares.use('/api/journal', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        const url = new URL(req.url, 'http://localhost');
        const action = url.pathname.replace(/^\//, ''); // 'get', 'list', 'save' or ''

        if (req.method === 'GET') {
          if (action === 'list' || action === '') {
            const days = parseInt(url.searchParams.get('days') || '30');
            res.end(JSON.stringify(listJournals(days)));
            return;
          }
          if (action === 'get') {
            const date = url.searchParams.get('date');
            if (!date) { res.statusCode = 400; res.end(JSON.stringify({ error: 'date required' })); return; }
            res.end(JSON.stringify(readJournal(date) || {}));
            return;
          }
        }

        if (req.method === 'POST') {
          try {
            const body = await parseBody(req);
            const date = body.date || new Date().toISOString().slice(0, 10);
            const existing = readJournal(date) || {};
            const merged = { ...existing, ...body, date };
            writeJournal(date, merged);
            res.end(JSON.stringify({ ok: true, date }));
          } catch { res.statusCode = 400; res.end('Bad request'); }
          return;
        }
        res.statusCode = 405; res.end('Method not allowed');
      });

      // --- FETCH URL API (server-side, bypasses CORS) ---
      server.middlewares.use('/api/fetch-url', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return; }
        try {
          const { url } = await parseBody(req);
          if (!url) { res.statusCode = 400; res.end(JSON.stringify({ error: 'url required' })); return; }
          const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JARVIS/1.0)' },
            signal: AbortSignal.timeout(10000),
          });
          if (!response.ok) { res.statusCode = 502; res.end(JSON.stringify({ error: `HTTP ${response.status}` })); return; }
          const html = await response.text();
          // Extract title
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          const title = titleMatch ? titleMatch[1].trim() : url;
          const text = stripHtml(html);
          res.end(JSON.stringify({ title, text, url }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });

      // --- DATA API: GET /api/data/:key ---
      server.middlewares.use('/api/data', async (req, res) => {
        const key = req.url.replace(/^\//, '').replace(/\?.*$/, '');
        if (req.method === 'GET' && key) {
          const data = readData();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ value: data[key] ?? null }));
          return;
        }
        if (req.method === 'GET' && !key) {
          const data = readData();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
          return;
        }
        if (req.method === 'POST' || req.method === 'PUT') {
          try {
            const body = await parseBody(req);
            const data = readData();
            if (body.key && body.value !== undefined) {
              data[body.key] = body.value;
              writeData(data);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true }));
            } else { res.statusCode = 400; res.end('Need key and value'); }
          } catch { res.statusCode = 400; res.end('Invalid request'); }
          return;
        }
        res.statusCode = 405; res.end('Method not allowed');
      });

      // --- TTS API: POST /api/tts ---
      server.middlewares.use('/api/tts', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return; }
        try {
          const { text, pitch, rate } = await parseBody(req);
          if (!text || !text.trim()) { res.statusCode = 400; res.end('No text'); return; }
          const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
          const tts = new MsEdgeTTS();
          await tts.setMetadata('en-US-JennyNeural', OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

          // Use the library's built-in SSML template via prosody object — plain text + options.
          // Passing raw SSML to toStream() causes the library to double-wrap it.
          const pitchStr = pitch !== undefined ? `${pitch >= 0 ? '+' : ''}${pitch}st` : '+0st';
          const rateStr  = rate  !== undefined ? `${rate  >= 0 ? '+' : ''}${rate}%`   : '+0%';

          const { audioStream } = tts.toStream(
            text.trim(),
            { pitch: pitchStr, rate: rateStr, volume: '100' }
          );

          const chunks = [];
          audioStream.on('data', chunk => chunks.push(chunk));
          audioStream.on('end', () => {
            const buffer = Buffer.concat(chunks);
            if (buffer.length === 0) {
              res.statusCode = 500; res.end('TTS returned empty audio'); return;
            }
            res.setHeader('Content-Type', 'audio/mp3');
            res.setHeader('Content-Length', buffer.length);
            res.end(buffer);
          });
          audioStream.on('error', err => {
            console.error('TTS stream error:', err);
            res.statusCode = 500; res.end('TTS error');
          });
        } catch (err) { console.error('TTS error:', err); res.statusCode = 500; res.end('TTS error: ' + err.message); }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), jarvisServerPlugin()],
  server: { host: true, port: 3000 },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Split Firebase (~290KB) into its own lazy-loaded chunk
          'firebase-vendor': ['firebase/app', 'firebase/firestore'],
          // Split React into its own stable chunk for better caching
          'react-vendor': ['react', 'react-dom'],
        }
      }
    },
    chunkSizeWarningLimit: 400,
  }
});
