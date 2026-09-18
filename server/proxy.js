// DARK AI — Unified Server v16.0
// Serves static files + API endpoints (chat, transcribe, video)
const http = require('http');
const fs = require('fs');
const path = require('path');

const GROQ_KEY = process.env.GROQ_KEY;
if (!GROQ_KEY) {
  console.error('Missing GROQ_KEY environment variable');
  process.exit(1);
}

let HF_KEY = process.env.HF_KEY || '';
if (!HF_KEY) {
  try {
    HF_KEY = fs.readFileSync(path.join(require('os').homedir(), '.hf_key'), 'utf8').trim();
  } catch (e) {
    console.warn('No HF_KEY — video disabled');
  }
}

const PORT = process.env.PORT || 1400;
const CHAT_MODEL = 'openai/gpt-oss-120b';
const WHISPER_MODEL = 'whisper-large-v3';
const PUBLIC_DIR = path.join(__dirname, '..'); // ~/dark

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJSON(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json'
};

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ============ API: /chat ============
  if (req.method === 'POST' && req.url === '/chat') {
    try {
      const body = await readBody(req);
      const { messages } = JSON.parse(body.toString('utf8'));
      const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + GROQ_KEY
        },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages,
          temperature: 0.6,
          max_tokens: 1500
        })
      });
      const data = await upstream.json();
      if (!upstream.ok) console.error('Groq error:', JSON.stringify(data));
      sendJSON(res, upstream.status, data);
    } catch (err) {
      console.error('/chat error:', err);
      sendJSON(res, 500, { error: { message: err.message } });
    }
    return;
  }

  // ============ API: /transcribe ============
  if (req.method === 'POST' && req.url === '/transcribe') {
    try {
      const buf = await readBody(req);
      const contentType = req.headers['content-type'] || '';
      const upstream = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'Authorization': 'Bearer ' + GROQ_KEY
        },
        body: buf
      });
      const data = await upstream.json();
      if (!upstream.ok) console.error('Whisper error:', JSON.stringify(data));
      sendJSON(res, upstream.status, data);
    } catch (err) {
      console.error('/transcribe error:', err);
      sendJSON(res, 500, { error: { message: err.message } });
    }
    return;
  }

  // ============ API: /health ============
  if (req.method === 'GET' && req.url === '/health') {
    sendJSON(res, 200, {
      ok: true,
      chat: !!GROQ_KEY,
      whisper: !!GROQ_KEY,
      video: !!HF_KEY
    });
    return;
  }

  // ============ STATIC FILES ============
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = filePath.split('?')[0]; // strip query
  const fullPath = path.join(PUBLIC_DIR, filePath);

  // Security: prevent path traversal
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('═══════════════════════════════════════════');
  console.log('  DARK AI Unified Server v16.0');
  console.log('═══════════════════════════════════════════');
  console.log('  PORT:  ' + PORT);
  console.log('  Chat:  ' + CHAT_MODEL);
  console.log('  Whisper: ' + WHISPER_MODEL);
  console.log('  Video: ' + (HF_KEY ? 'enabled' : 'disabled'));
  console.log('═══════════════════════════════════════════');
});
// DARK AI — Proxy v12.0
// Chat + Whisper via Groq, Video via Hugging Face
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Load keys
const GROQ_KEY = process.env.GROQ_KEY;
if (!GROQ_KEY) {
  console.error('Missing GROQ_KEY. Run: GROQ_KEY=gsk_xxx node proxy.js');
  process.exit(1);
}

// Read HF key from ~/.hf_key
let HF_KEY = '';
try {
  const hfPath = path.join(os.homedir(), '.hf_key');
  HF_KEY = fs.readFileSync(hfPath, 'utf8').trim();
  if (!HF_KEY.startsWith('hf_')) {
    console.warn('⚠️  ~/.hf_key does not start with hf_ — video generation may fail');
  }
} catch (e) {
  console.warn('⚠️  Could not read ~/.hf_key — video generation will be disabled');
  HF_KEY = '';
}

const PORT = 1400;
const CHAT_MODEL = 'openai/gpt-oss-120b';
const WHISPER_MODEL = 'whisper-large-v3';

// Hugging Face video models (free tier)
const HF_VIDEO_MODELS = [
  'Lightricks/LTX-Video',
  'Wan-AI/Wan2.1-T2V-1.3B',
  'ali-vilab/text-to-video-ms-1.7b'
];

// ============ HELPERS ============
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJSON(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

// ============ SERVER ============
const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ---------- /chat ----------
  if (req.method === 'POST' && req.url === '/chat') {
    try {
      const body = await readBody(req);
      const { messages } = JSON.parse(body.toString('utf8'));

      const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + GROQ_KEY
        },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages: messages,
          temperature: 0.6,
          max_tokens: 1500
        })
      });

      const data = await upstream.json();
      if (!upstream.ok) console.error('Groq chat error:', JSON.stringify(data));

      sendJSON(res, upstream.status, data);
    } catch (err) {
      console.error('/chat error:', err);
      sendJSON(res, 500, { error: { message: err.message } });
    }
    return;
  }

  // ---------- /transcribe ----------
  if (req.method === 'POST' && req.url === '/transcribe') {
    try {
      const buf = await readBody(req);
      const contentType = req.headers['content-type'] || '';

      const upstream = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'Authorization': 'Bearer ' + GROQ_KEY
        },
        body: buf
      });

      const data = await upstream.json();
      if (!upstream.ok) console.error('Whisper error:', JSON.stringify(data));

      sendJSON(res, upstream.status, data);
    } catch (err) {
      console.error('/transcribe error:', err);
      sendJSON(res, 500, { error: { message: err.message } });
    }
    return;
  }

  // ---------- /video ----------
  if (req.method === 'POST' && req.url === '/video') {
    if (!HF_KEY) {
      sendJSON(res, 503, {
        error: { message: 'Video disabled: no HF key in ~/.hf_key' }
      });
      return;
    }

    try {
      const body = await readBody(req);
      const { prompt } = JSON.parse(body.toString('utf8'));

      if (!prompt || prompt.trim().length < 3) {
        sendJSON(res, 400, { error: { message: 'Prompt too short' } });
        return;
      }

      console.log('[video] prompt:', prompt.slice(0, 80));

      let lastError = 'All models failed';

      for (const model of HF_VIDEO_MODELS) {
        try {
          console.log('[video] trying model:', model);

          const hfRes = await fetch(
            `https://api-inference.huggingface.co/models/${model}`,
            {
              method: 'POST',
              headers: {
                'Authorization': 'Bearer ' + HF_KEY,
                'Content-Type': 'application/json',
                'x-wait-for-model': 'true'
              },
              body: JSON.stringify({ inputs: prompt })
            }
          );

          if (!hfRes.ok) {
            const errText = await hfRes.text();
            console.warn(`[video] ${model} failed:`, hfRes.status, errText.slice(0, 200));
            lastError = `${model}: HTTP ${hfRes.status}`;
            continue;
          }

          const videoBuffer = Buffer.from(await hfRes.arrayBuffer());

          if (videoBuffer.length < 1000) {
            console.warn(`[video] ${model} returned tiny buffer (${videoBuffer.length} bytes)`);
            lastError = `${model}: empty response`;
            continue;
          }

          console.log(`[video] ${model} succeeded: ${videoBuffer.length} bytes`);

          res.writeHead(200, {
            'Content-Type': 'video/mp4',
            'Content-Length': videoBuffer.length,
            'X-Model-Used': model
          });
          res.end(videoBuffer);
          return;

        } catch (err) {
          console.warn(`[video] ${model} exception:`, err.message);
          lastError = `${model}: ${err.message}`;
        }
      }

      sendJSON(res, 502, {
        error: {
          message: 'All HF video models failed. ' + lastError,
          detail: 'Free tier may be rate-limited. Try again in 30s.'
        }
      });

    } catch (err) {
      console.error('/video error:', err);
      sendJSON(res, 500, { error: { message: err.message } });
    }
    return;
  }

  // ---------- /health ----------
  if (req.method === 'GET' && req.url === '/health') {
    sendJSON(res, 200, {
      ok: true,
      chat: !!GROQ_KEY,
      whisper: !!GROQ_KEY,
      video: !!HF_KEY,
      models: HF_VIDEO_MODELS
    });
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('═══════════════════════════════════════════');
  console.log('  DARK AI proxy v12.0');
  console.log('═══════════════════════════════════════════');
  console.log('  URL:      http://localhost:' + PORT);
  console.log('  Chat:     ' + CHAT_MODEL + '  (Groq)');
  console.log('  Whisper:  ' + WHISPER_MODEL + '  (Groq)');
  console.log('  Video:    Hugging Face  ' + (HF_KEY ? '✓ loaded' : '✗ missing'));
  console.log('  HF key:   ' + (HF_KEY ? HF_KEY.slice(0, 7) + '...' + HF_KEY.slice(-4) : 'none'));
  console.log('═══════════════════════════════════════════');
  console.log('  Endpoints:');
  console.log('    POST /chat');
  console.log('    POST /transcribe');
  console.log('    POST /video');
  console.log('    GET  /health');
  console.log('═══════════════════════════════════════════');
});
