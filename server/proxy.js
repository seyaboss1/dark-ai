// DARK AI — Unified Server v16.0
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const GROQ_KEY = process.env.GROQ_KEY;
if (!GROQ_KEY) {
  console.error('Missing GROQ_KEY');
  process.exit(1);
}

let HF_KEY = process.env.HF_KEY || '';

const PORT = process.env.PORT || 1400;
const CHAT_MODEL = 'openai/gpt-oss-120b';
const WHISPER_MODEL = 'whisper-large-v3';
const PUBLIC_DIR = path.join(__dirname, '..');

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

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

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
      sendJSON(res, upstream.status, data);
    } catch (err) {
      sendJSON(res, 500, { error: { message: err.message } });
    }
    return;
  }

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
      sendJSON(res, upstream.status, data);
    } catch (err) {
      sendJSON(res, 500, { error: { message: err.message } });
    }
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    sendJSON(res, 200, { ok: true, chat: true, whisper: true });
    return;
  }

  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = filePath.split('?')[0];
  const fullPath = path.join(PUBLIC_DIR, filePath);

  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(fullPath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('DARK AI Server on port ' + PORT);
  console.log('Serving: ' + PUBLIC_DIR);
});
