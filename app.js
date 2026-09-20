/* ============================================================
   DARK AI — Main Application Logic
   Depends: config.js, puter.js
   ============================================================ */

(function () {
  'use strict';

  const { PROXY_URL, LANGUAGES, IMAGE_SIZES, DEFAULT_SYSTEM_PROMPT, QUICK_PROMPTS } = window.DARK;

  // ============ STATE ============
  const state = {
    preferredLang: localStorage.getItem('dark-lang') || 'auto',
    preferredSize: localStorage.getItem('dark-size') || 'hd',
    autoSpeak:    localStorage.getItem('dark-autospeak') === 'true',
    theme:        localStorage.getItem('dark-theme') || 'light',
    systemPrompt: localStorage.getItem('dark-prompt') || DEFAULT_SYSTEM_PROMPT,
    currentUser:  null,
    isSuperAdmin: false,
    threads:      {},
    activeId:     null,
    busy:         false,
    abortController: null,
    searchQuery:  '',
    ads:          JSON.parse(localStorage.getItem('dark-ads') || '[]'),
    messageCounter: parseInt(localStorage.getItem('dark-msg-counter') || '0', 10)
  };

  window.DARK_STATE = state;

  // ============ HELPERS ============
  const $ = (id) => document.getElementById(id);

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
  }

  function setStatus(t, ok = true) {
    const el = $('chatStatus');
    el.textContent = t;
    el.style.color = ok ? 'var(--muted)' : 'var(--err)';
  }

  function detectLanguage(text) {
    if (!text) return null;
    if (/[\u1200-\u137F\u1380-\u139F\u2D80-\u2DDF\uAB00-\uAB2F]/.test(text)) return 'am';
    if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text)) return 'ar';
    if (/[\u0400-\u04FF]/.test(text)) return 'ru';
    if (/[\u0900-\u097F]/.test(text)) return 'hi';
    if (/[\u4E00-\u9FFF\u3040-\u30FF]/.test(text)) return /[\u3040-\u30FF]/.test(text) ? 'ja' : 'zh';
    if (/[ğüşıöçĞÜŞİÖÇ]/.test(text)) return 'tr';
    if (/[éèêëàâîïôûùçÉÈÊËÀÂÎÏÔÛÙÇ]/.test(text)) return 'fr';
    if (/[äöüßÄÖÜ]/.test(text)) return 'de';
    if (/[ñáéíóúüÑÁÉÍÓÚ]/.test(text)) return 'es';
    if (/[a-zA-Z]/.test(text)) return 'en';
    return null;
  }

  function speak(text) {
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    const clean = text
      .replace(/\[IMAGE_PROMPT\][\s\S]*?\[\/IMAGE_PROMPT\]/g, '')
      .replace(/\[VIDEO_PROMPT\][\s\S]*?\[\/VIDEO_PROMPT\]/g, '')
      .replace(/```[\s\S]*?```/g, 'code block')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[*_#>]/g, '').trim();
    if (!clean) return;
    const detected = detectLanguage(clean);
    let langCode = 'en-US';
    if (detected) {
      const l = LANGUAGES.find(x => x.code === detected);
      if (l && l.tts) langCode = l.tts;
    } else if (state.preferredLang !== 'auto') {
      const l = LANGUAGES.find(x => x.code === state.preferredLang);
      if (l && l.tts) langCode = l.tts;
    }
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = langCode; u.rate = 1.0; u.pitch = 1.0;
    speechSynthesis.speak(u);
  }

  function renderMarkdown(text) {
    let html = escapeHtml(text);
    const codeBlocks = [];
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push({ code: code.replace(/\n$/, '') });
      return `\u0000CB${idx}\u0000`;
    });
    html = html.replace(/`([^`\n]+)`/g, '<code class="inline">$1</code>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, m => '<ul>' + m + '</ul>');
    html = html.split(/\n{2,}/).map(p => {
      if (/^\s*<(h[1-3]|ul|ol|pre)/.test(p.trim())) return p;
      return '<p>' + p.replace(/\n/g, '<br>') + '</p>';
    }).join('');
    html = html.replace(/\u0000CB(\d+)\u0000/g, (_, i) => {
      const { code } = codeBlocks[+i];
      const encoded = encodeURIComponent(code);
      return `<pre data-code="${encoded}"><button class="code-copy" type="button" onclick="DARK_COPY_CODE(this)">COPY</button><code>${escapeHtml(code)}</code></pre>`;
    });
    return html;
  }

  window.DARK_COPY_CODE = function (btn) {
    const pre = btn.closest('pre');
    const code = decodeURIComponent(pre.dataset.code);
    navigator.clipboard.writeText(code).then(() => {
      btn.textContent = 'COPIED'; btn.style.color = 'var(--ok)';
      setTimeout(() => { btn.textContent = 'COPY'; btn.style.color = ''; }, 1400);
      toast('Code copied');
    });
  };

  // ============ THREADS ============
  function loadThreads() {
    try { state.threads = JSON.parse(localStorage.getItem('dark-threads') || '{}') || {}; }
    catch { state.threads = {}; }
    state.activeId = localStorage.getItem('dark-active') || null;
    if (!state.activeId || !state.threads[state.activeId]) {
      if (Object.keys(state.threads).length === 0) createThread(true);
      else state.activeId = Object.keys(state.threads)[0];
    }
  }

  async function saveThreads() {
    localStorage.setItem('dark-threads', JSON.stringify(state.threads));
    localStorage.setItem('dark-active', state.activeId);
    try {
      if (window.puter && puter.auth && await puter.auth.isSignedIn()) {
        await puter.kv.set('dark-threads', JSON.stringify(state.threads));
        await puter.kv.set('dark-active', state.activeId);
      }
    } catch {}
  }

  function createThread(silent = false) {
    const id = 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    state.threads[id] = {
      title: 'New chat',
      messages: [{ role: 'system', content: state.systemPrompt }],
      createdAt: Date.now()
    };
    state.activeId = id;
    saveThreads();
    if (!silent) {
      renderThreads(); rebuildUI(); toast('New chat created');
      if (window.innerWidth <= 900) $('sidebar').classList.remove('open');
    }
  }

  function deleteThread(id, e) {
    if (e) e.stopPropagation();
    if (!confirm('Delete this chat?')) return;
    delete state.threads[id];
    if (state.activeId === id) {
      const remaining = Object.keys(state.threads);
      if (remaining.length === 0) createThread(true);
      else state.activeId = remaining[0];
    }
    saveThreads(); renderThreads(); rebuildUI(); toast('Chat deleted');
  }

  function switchThread(id) {
    if (state.busy) { toast('Wait for current reply'); return; }
    state.activeId = id; saveThreads(); renderThreads(); rebuildUI();
    if (window.innerWidth <= 900) $('sidebar').classList.remove('open');
  }

  function renderThreads() {
    const list = $('chatList');
    list.innerHTML = '';
    const ids = Object.keys(state.threads)
      .filter(id => !state.searchQuery || state.threads[id].title.toLowerCase().includes(state.searchQuery))
      .sort((a, b) => state.threads[b].createdAt - state.threads[a].createdAt);
    ids.forEach(id => {
      const t = state.threads[id];
      const item = document.createElement('div');
      item.className = 'chat-item' + (id === state.activeId ? ' active' : '');
      item.innerHTML = '<span>' + escapeHtml(t.title) + '</span>';
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'del'; del.innerHTML = '×';
      del.onclick = (e) => deleteThread(id, e);
      item.appendChild(del);
      item.onclick = () => switchThread(id);
      list.appendChild(item);
    });
  }

  // ============ RENDER MESSAGES ============
  function hideWelcome() { const w = $('welcome'); if (w) w.remove(); }
  function scrollBottom() { const cb = $('chatBody'); cb.scrollTop = cb.scrollHeight; }

  function renderUserMsg(text) {
    hideWelcome();
    const row = document.createElement('div');
    row.className = 'msg-row user';
    const col = document.createElement('div');
    col.className = 'msg-col';
    const m = document.createElement('div');
    m.className = 'msg user';
    m.textContent = text;
    col.appendChild(m); row.appendChild(col); $('chatBody').appendChild(row); scrollBottom();
  }

  function buildMeta(text, tokens) {
    const meta = document.createElement('div');
    meta.className = 'msg-meta';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button'; copyBtn.className = 'msg-action';
    copyBtn.innerHTML = '<span>📋</span><span>Copy</span>';
    copyBtn.onclick = () => {
      const clean = text
        .replace(/\[IMAGE_PROMPT\]([\s\S]*?)\[\/IMAGE_PROMPT\]/g, '$1')
        .replace(/\[VIDEO_PROMPT\]([\s\S]*?)\[\/VIDEO_PROMPT\]/g, '$1').trim();
      navigator.clipboard.writeText(clean).then(() => {
        copyBtn.classList.add('done');
        copyBtn.innerHTML = '<span>✓</span><span>Copied</span>';
        setTimeout(() => {
          copyBtn.classList.remove('done');
          copyBtn.innerHTML = '<span>📋</span><span>Copy</span>';
        }, 1600);
      });
    };
    meta.appendChild(copyBtn);

    const speakBtn = document.createElement('button');
    speakBtn.type = 'button'; speakBtn.className = 'msg-action';
    speakBtn.innerHTML = '<span>🔊</span><span>Speak</span>';
    speakBtn.onclick = () => speak(text);
    meta.appendChild(speakBtn);

    const retryBtn = document.createElement('button');
    retryBtn.type = 'button'; retryBtn.className = 'msg-action';
    retryBtn.innerHTML = '<span>↻</span><span>Retry</span>';
    retryBtn.onclick = retryLast;
    meta.appendChild(retryBtn);

    if (tokens) {
      const ti = document.createElement('span');
      ti.textContent = '• ' + tokens + ' tokens';
      ti.style.marginLeft = '0.3rem';
      ti.style.fontSize = '0.7rem';
      meta.appendChild(ti);
    }
    return meta;
  }

  function renderAiMsg(text, tokens) {
    hideWelcome();
    const row = document.createElement('div');
    row.className = 'msg-row ai';
    const col = document.createElement('div');
    col.className = 'msg-col';

    let imgMatch = text.match(/\[IMAGE_PROMPT\]([\s\S]*?)\[\/IMAGE_PROMPT\]/);
    let vidMatch = text.match(/\[VIDEO_PROMPT\]([\s\S]*?)\[\/VIDEO_PROMPT\]/);

    if (!imgMatch && !vidMatch) {
      const lower = text.toLowerCase();
      const isVideo = /فيديو|video|متحرك|animated/.test(lower) && !/صورة|image|photo/.test(lower);
      const isImage = /صورة|صور|image|photo|رسم/.test(lower) && !isVideo;
      const hasGenBtn = /click the button below|اضغط الزر|👇/.test(lower);
      if (hasGenBtn && (isVideo || isImage)) {
        let desc = text.replace(/Click the button below.*/i, '')
                       .replace(/اضغط الزر.*/i, '')
                       .replace(/\*\*/g, '').replace(/\*/g, '').trim();
        const lines = desc.split('\n').map(l => l.trim()).filter(Boolean);
        desc = lines[0] || desc;
        if (isVideo) vidMatch = [desc, desc];
        else imgMatch = [desc, desc];
      }
    }

    if (imgMatch) return renderMediaPrompt(text, imgMatch[1], 'image', tokens, col, row);
    if (vidMatch) return renderMediaPrompt(text, vidMatch[1], 'video', tokens, col, row);

    const m = document.createElement('div');
    m.className = 'msg ai';
    m.innerHTML = renderMarkdown(text);
    col.appendChild(m);
    col.appendChild(buildMeta(text, tokens));
    row.appendChild(col);
    $('chatBody').appendChild(row);
    scrollBottom();
  }

  function renderMediaPrompt(text, prompt, type, tokens, col, row) {
    prompt = (prompt || '').trim();
    const tagRe = type === 'image' ? /\[IMAGE_PROMPT\][\s\S]*?\[\/IMAGE_PROMPT\]/g : /\[VIDEO_PROMPT\][\s\S]*?\[\/VIDEO_PROMPT\]/g;
    const clean = text.replace(tagRe, '')
      .replace(/Click the button below.*/gi, '')
      .replace(/اضغط الزر.*/gi, '').trim();

    const m = document.createElement('div');
    m.className = 'msg ai';
    m.innerHTML = renderMarkdown(clean || (type === 'image' ? 'Ready to generate your image:' : 'Ready to generate your video:'));

    const box = document.createElement('div');
    box.className = 'prompt-box';
    box.innerHTML = '<div class="prompt-text">' + escapeHtml(prompt) + '</div>';

    const actions = document.createElement('div');
    actions.className = 'prompt-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'prompt-btn';
    copyBtn.innerHTML = '📋 Copy Prompt';
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(prompt).then(() => {
        copyBtn.innerHTML = '✓ Copied';
        copyBtn.classList.add('done');
        setTimeout(() => {
          copyBtn.innerHTML = '📋 Copy Prompt';
          copyBtn.classList.remove('done');
        }, 1500);
      });
    };
    actions.appendChild(copyBtn);

    const genBtn = document.createElement('button');
    genBtn.className = 'prompt-btn primary';
    if (type === 'image') {
      genBtn.innerHTML = '🎨 Generate Image';
      genBtn.onclick = () => generateImage(prompt);
    } else {
      genBtn.innerHTML = '🎬 Generate Video';
      genBtn.onclick = () => generateVideo(prompt);
    }
    actions.appendChild(genBtn);

    box.appendChild(actions);
    m.appendChild(box);
    col.appendChild(m);
    col.appendChild(buildMeta(text, tokens));
    row.appendChild(col);
    $('chatBody').appendChild(row);
    scrollBottom();
  }

  function renderTyping() {
    hideWelcome();
    const row = document.createElement('div');
    row.className = 'msg-row ai';
    const col = document.createElement('div');
    col.className = 'msg-col';
    const m = document.createElement('div');
    m.className = 'msg ai typing';
    m.innerHTML = '<span class="t-dot"></span><span class="t-dot"></span><span class="t-dot"></span>';
    col.appendChild(m); row.appendChild(col);
    $('chatBody').appendChild(row); scrollBottom();
    return row;
  }

  // ============ IMAGE GENERATION ============
  async function generateImage(userPrompt) {
    const t = state.threads[state.activeId];
    if (!t) return;
    state.busy = true;
    $('sendBtn').disabled = true;
    renderUserMsg('🎨 ' + userPrompt);
    $('chatInput').value = '';

    let prompt = userPrompt.trim();
    if (!/(?:8k|4k|detailed|cinematic|masterpiece|hyperrealistic|ultra)/i.test(prompt)) {
      prompt += ', highly detailed, cinematic, 8k, sharp focus';
    }
    t.messages.push({ role: 'user', content: '[Image] ' + prompt });
    saveThreads();

    hideWelcome();
    const row = document.createElement('div');
    row.className = 'msg-row ai';
    const col = document.createElement('div');
    col.className = 'msg-col';
    const wrap = document.createElement('div');
    wrap.className = 'msg ai msg-image';

    const uid = 'p_' + Date.now();
    wrap.innerHTML = `
      <div class="img-progress">
        <div class="progress-percent" id="pct-${uid}">0%</div>
        <div class="progress-bar"><div class="progress-fill" id="fill-${uid}"></div></div>
        <div class="progress-message" id="msg-${uid}">🎨 جاري تحضير الفكرة...</div>
        <div class="progress-meta">
          <span>⏱️ <span id="time-${uid}">0.0</span>s</span>
          <span class="eta">جاري الإنشاء</span>
        </div>
      </div>`;
    col.appendChild(wrap); row.appendChild(col);
    $('chatBody').appendChild(row); scrollBottom();
    setStatus('Generating image…');

    const pctEl = document.getElementById('pct-' + uid);
    const fillEl = document.getElementById('fill-' + uid);
    const msgEl = document.getElementById('msg-' + uid);
    const timeEl = document.getElementById('time-' + uid);
    const startTime = Date.now();
    let fakeProgress = 0;
    const steps = [
      '🎨 جاري تحضير الفكرة...',
      '💭 أفكر في التفاصيل...',
      '✏️ أرسم الخطوط الأولى...',
      '🎨 أضيف الألوان...',
      '✨ أضيف اللمسات الأخيرة...',
      '🖼️ جاري التحميل...'
    ];
    const tick = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      timeEl.textContent = elapsed.toFixed(1);
      if (fakeProgress < 95) {
        const speed = fakeProgress < 50 ? 2.5 : fakeProgress < 80 ? 1.2 : 0.4;
        fakeProgress = Math.min(fakeProgress + speed, 95);
        const rounded = Math.floor(fakeProgress);
        pctEl.textContent = rounded + '%';
        fillEl.style.width = rounded + '%';
        const stepIdx = Math.min(Math.floor(elapsed / 3), steps.length - 1);
        msgEl.textContent = steps[stepIdx];
      }
    }, 200);

    try {
      const seed = Math.floor(Math.random() * 1e6);
      const s = IMAGE_SIZES.find(x => x.code === state.preferredSize) || IMAGE_SIZES[0];
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${s.w}&height=${s.h}&seed=${seed}&model=flux&enhance=true&safe=false&private=true&nologo=true`;

      const loaded = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
        setTimeout(() => resolve(false), 90000);
      });
      clearInterval(tick);
      if (!loaded) throw new Error('Timeout');

      wrap.innerHTML = '';
      const img = document.createElement('img');
      img.src = url; img.alt = prompt;
      img.onclick = () => window.open(url, '_blank');
      wrap.appendChild(img);

      const meta = document.createElement('div');
      meta.className = 'msg-meta';
      meta.style.opacity = '1';

      const dlBtn = document.createElement('button');
      dlBtn.type = 'button'; dlBtn.className = 'msg-action';
      dlBtn.innerHTML = '<span>⬇</span><span>Download</span>';
      dlBtn.onclick = async () => {
        try {
          const res = await fetch(url);
          const blob = await res.blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'dark-' + Date.now() + '.png';
          a.click();
          toast('Downloaded');
        } catch { window.open(url, '_blank'); }
      };
      meta.appendChild(dlBtn);

      const reBtn = document.createElement('button');
      reBtn.type = 'button'; reBtn.className = 'msg-action';
      reBtn.innerHTML = '<span>🔄</span><span>Regenerate</span>';
      reBtn.onclick = () => generateImage(userPrompt);
      meta.appendChild(reBtn);

      col.appendChild(meta);
      t.messages.push({ role: 'assistant', content: '[Generated image]\n![image](' + url + ')' });
      saveThreads();
      setStatus('Online • image ready');
      toast('Image ready');
    } catch (err) {
      clearInterval(tick);
      const safe = userPrompt.replace(/'/g, "\\'");
      wrap.innerHTML = '<div class="img-progress" style="color:var(--err)">⚠️ Failed. <button class="msg-action" onclick="DARK_RETRY_IMG(\'' + safe + '\')" style="color:var(--accent); margin-left:0.5rem;">↻ Try again</button></div>';
      setStatus('Image error', false);
    } finally {
      state.busy = false; $('sendBtn').disabled = false; $('chatInput').focus();
    }
  }

  window.DARK_RETRY_IMG = (p) => generateImage(p);

  // ============ VIDEO GENERATION ============
  async function generateVideo(userPrompt) {
    const t = state.threads[state.activeId];
    if (!t) return;
    state.busy = true;
    $('sendBtn').disabled = true;
    renderUserMsg('🎬 ' + userPrompt);
    $('chatInput').value = '';
    const prompt = userPrompt.trim();
    t.messages.push({ role: 'user', content: '[Video] ' + prompt });
    saveThreads();

    hideWelcome();
    const row = document.createElement('div');
    row.className = 'msg-row ai';
    const col = document.createElement('div');
    col.className = 'msg-col';
    const wrap = document.createElement('div');
    wrap.className = 'msg ai msg-video';
    wrap.innerHTML = '<div class="img-progress"><div style="display:flex;align-items:center;gap:0.5rem;"><div class="spinner"></div><span>Generating video… (30-90s)</span></div></div>';
    col.appendChild(wrap); row.appendChild(col);
    $('chatBody').appendChild(row); scrollBottom();
    setStatus('Generating video…');

    try {
      if (!window.puter || !puter.ai || !puter.ai.txt2vid) {
        throw new Error('Video generator not available. Sign in to Puter first.');
      }
      const videoElement = await puter.ai.txt2vid(prompt);
      wrap.innerHTML = '';
      videoElement.controls = true;
      videoElement.loop = true;
      videoElement.muted = false;
      videoElement.playsInline = true;
      videoElement.style.width = '100%';
      videoElement.style.borderRadius = '12px';
      wrap.appendChild(videoElement);

      const meta = document.createElement('div');
      meta.className = 'msg-meta';
      meta.style.opacity = '1';

      const dlBtn = document.createElement('button');
      dlBtn.type = 'button'; dlBtn.className = 'msg-action';
      dlBtn.innerHTML = '<span>⬇</span><span>Download</span>';
      dlBtn.onclick = async () => {
        try {
          const src = videoElement.src || videoElement.currentSrc;
          const res = await fetch(src);
          const blob = await res.blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'dark-video-' + Date.now() + '.mp4';
          a.click();
          toast('Downloaded');
        } catch { toast('Download failed'); }
      };
      meta.appendChild(dlBtn);

      const reBtn = document.createElement('button');
      reBtn.type = 'button'; reBtn.className = 'msg-action';
      reBtn.innerHTML = '<span>🔄</span><span>Regenerate</span>';
      reBtn.onclick = () => generateVideo(userPrompt);
      meta.appendChild(reBtn);

      col.appendChild(meta);
      t.messages.push({ role: 'assistant', content: '[Generated video]' });
      saveThreads();
      setStatus('Online • video ready');
      toast('Video ready');
    } catch (err) {
      const safe = userPrompt.replace(/'/g, "\\'");
      wrap.innerHTML = '<div class="img-progress" style="color:var(--err)">⚠️ ' + (err.message || 'Unknown error') + ' <button class="msg-action" onclick="DARK_RETRY_VID(\'' + safe + '\')" style="color:var(--accent); margin-left:0.5rem;">↻ Try</button></div>';
      setStatus('Video error', false);
    } finally {
      state.busy = false; $('sendBtn').disabled = false; $('chatInput').focus();
    }
  }

  window.DARK_RETRY_VID = (p) => generateVideo(p);

  // ============ CHAT ============
  async function sendMsg() {
    if (state.busy) return;
    const text = $('chatInput').value.trim();
    if (!text) return;
    const t = state.threads[state.activeId];
    if (!t) return;

    if (t.messages.filter(m => m.role === 'user').length === 0) {
      t.title = text.length > 40 ? text.slice(0, 40) + '…' : text;
      renderThreads();
    }
    renderUserMsg(text);
    $('chatInput').value = '';
    t.messages.push({ role: 'user', content: text });
    await saveThreads();
    await streamReply();
    state.messageCounter++;
    localStorage.setItem('dark-msg-counter', state.messageCounter);
    if (window.DARK_CHECK_AD) window.DARK_CHECK_AD();
  }

  async function streamReply() {
    const t = state.threads[state.activeId];
    if (!t) return;
    state.busy = true;
    $('sendBtn').disabled = true;
    $('sendBtn').textContent = 'STOP';
    $('sendBtn').classList.add('stop');
    const typing = renderTyping();
    setStatus('Thinking…');
    state.abortController = new AbortController();

    try {
      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: t.messages.slice(-20) }),
        signal: state.abortController.signal
      });
      const data = await res.json();
      typing.remove();
      if (!res.ok || data.error) {
        renderAiMsg('⚠️ Error: ' + (data.error?.message || data.error || ('HTTP ' + res.status)));
        setStatus('Error', false); return;
      }
      const reply = data.choices?.[0]?.message?.content?.trim() || '(empty response)';
      const tokens = data.usage?.total_tokens;
      t.messages.push({ role: 'assistant', content: reply });
      await saveThreads();
      await typewriterRender(reply, tokens);
      setStatus(tokens ? 'Online • ' + tokens + ' tokens' : 'Online');
      if (state.autoSpeak) speak(reply);
    } catch (err) {
      typing.remove();
      if (err.name === 'AbortError') { renderAiMsg('(stopped)'); setStatus('Stopped'); }
      else { renderAiMsg('⚠️ Connection error.'); setStatus('Offline', false); }
    } finally {
      state.busy = false; state.abortController = null;
      $('sendBtn').disabled = false; $('sendBtn').textContent = 'SEND';
      $('sendBtn').classList.remove('stop'); $('chatInput').focus();
    }
  }

  async function typewriterRender(fullText, tokens) {
    hideWelcome();
    const row = document.createElement('div');
    row.className = 'msg-row ai';
    const col = document.createElement('div');
    col.className = 'msg-col';
    const m = document.createElement('div');
    m.className = 'msg ai';
    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    m.appendChild(cursor);
    col.appendChild(m); row.appendChild(col);
    $('chatBody').appendChild(row);

    const speed = fullText.length > 500 ? 3 : fullText.length > 200 ? 6 : 10;
    for (let i = 0; i < fullText.length; i++) {
      m.innerHTML = renderMarkdown(fullText.slice(0, i + 1));
      m.appendChild(cursor);
      scrollBottom();
      await new Promise(r => setTimeout(r, speed));
    }
    cursor.remove();
    m.innerHTML = renderMarkdown(fullText);
    col.appendChild(buildMeta(fullText, tokens));
    scrollBottom();
  }

  async function retryLast() {
    if (state.busy) return;
    const t = state.threads[state.activeId];
    if (!t) return;
    while (t.messages.length > 1 && t.messages[t.messages.length - 1].role === 'assistant') {
      t.messages.pop();
    }
    await saveThreads(); rebuildUI();
    if (t.messages.length > 1) await streamReply();
    else toast('Nothing to retry');
  }

  // ============ UI BUILD ============
  function rebuildUI() {
    $('chatBody').innerHTML = '';
    const t = state.threads[state.activeId];
    if (!t) return;
    const visible = t.messages.filter(m => m.role !== 'system');
    if (visible.length === 0) {
      const w = document.createElement('div');
      w.className = 'welcome'; w.id = 'welcome';
      w.innerHTML =
        '<div class="welcome-icon">◆</div>' +
        '<h1>Chat, speak, <span class="grad">create anything</span>.</h1>' +
        '<p>Arabic, English, Amharic & more. Ask for images, videos, code, or anything.</p>' +
        '<div class="quick-grid" id="quickGrid"></div>';
      $('chatBody').appendChild(w);
      buildQuickGrid(w.querySelector('#quickGrid'));
      return;
    }
    visible.forEach(m => {
      if (m.role === 'user') {
        renderUserMsg(typeof m.content === 'string' ? m.content : '[message]');
      } else {
        const text = typeof m.content === 'string' ? m.content : '';
        const imgMatch = text.match(/!\[image\]\((https?:\/\/[^\)]+)\)/);
        if (imgMatch) { renderImageFromHistory(imgMatch[1]); return; }
        renderAiMsg(text);
      }
    });
    scrollBottom();
  }

  function renderImageFromHistory(url) {
    hideWelcome();
    const row = document.createElement('div');
    row.className = 'msg-row ai';
    const col = document.createElement('div');
    col.className = 'msg-col';
    const wrap = document.createElement('div');
    wrap.className = 'msg ai msg-image';
    const img = document.createElement('img');
    img.src = url; img.onclick = () => window.open(url, '_blank');
    wrap.appendChild(img);
    col.appendChild(wrap); row.appendChild(col);
    $('chatBody').appendChild(row); scrollBottom();
  }

  function buildQuickGrid(container) {
    container.innerHTML = '';
    QUICK_PROMPTS.forEach(p => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'quick-card';
      card.innerHTML = '<span class="qc-emoji">' + p.emoji + '</span>' +
        '<span class="qc-text"><span class="qc-title">' + p.title + '</span>' +
        '<span class="qc-desc">' + p.desc + '</span></span>';
      card.onclick = () => { $('chatInput').value = p.prompt; $('chatInput').focus(); sendMsg(); };
      container.appendChild(card);
    });
  }

  // ============ THEME ============
  function applyTheme() {
    document.body.dataset.theme = state.theme === 'dark' ? 'dark' : '';
    localStorage.setItem('dark-theme', state.theme);
  }

  // ============ AUTH ============
  function isSuperAdminCheck(name, email) {
    const _e = (email || '').toLowerCase();
    const _n = (name || '').toLowerCase();
    return window.DARK.SUPER_ADMINS.some(u => {
      const lu = u.toLowerCase();
      return _e === lu || _n === lu;
    });
  }

  function renderAuthBox() {
    const box = $('authBox');
    if (!box) return;
    if (state.currentUser) {
      const name = state.currentUser.username || state.currentUser.email || 'User';
      const email = state.currentUser.email || state.currentUser.username || '';
      box.innerHTML =
        '<div style="font-size:0.85rem;font-weight:700;margin-bottom:0.7rem;color:var(--fg);">✓ Signed in as <br><b>' +
        escapeHtml(name) + '</b><br>' +
        '<small style="color:var(--muted);font-weight:400">' + escapeHtml(email) + '</small>' +
        (state.isSuperAdmin ? '<br><span style="color:var(--gold);font-size:0.72rem">👑 SUPER ADMIN</span>' : '') +
        '</div>' +
        '<button id="settingsSignOut" style="background:transparent;border:1px solid rgba(225,29,72,0.4);color:var(--err);padding:0.7rem 1.5rem;border-radius:10px;font-weight:700;font-size:0.85rem;cursor:pointer;font-family:inherit;width:100%;">🚪 Sign Out</button>';
      setTimeout(() => {
        const btn = $('settingsSignOut');
        if (btn) btn.onclick = handleSignOut;
      }, 0);
    } else {
      box.innerHTML =
        '<p style="font-size:0.82rem;color:var(--muted);margin-bottom:0.7rem;">Sign in to sync your chats.</p>' +
        '<button id="settingsSignIn" style="background:linear-gradient(135deg,var(--accent),var(--accent-2));color:white;border:none;padding:0.7rem 1.5rem;border-radius:10px;font-weight:700;font-size:0.85rem;cursor:pointer;font-family:inherit;width:100%;">👤 Sign In with Puter</button>';
      setTimeout(() => {
        const btn = $('settingsSignIn');
        if (btn) btn.onclick = handleSignIn;
      }, 0);
    }
  }

  async function updateAuthUI() {
    try {
      const signed = await puter.auth.isSignedIn();
      if (signed) {
        state.currentUser = await puter.auth.getUser();
        const name = state.currentUser.username || 'User';
        const email = state.currentUser.email || '';
        state.isSuperAdmin = isSuperAdminCheck(name, email);

        const badge = $('authBadge');
        badge.style.display = 'flex';
        badge.classList.toggle('super', state.isSuperAdmin);
        $('authAvatar').textContent = name.charAt(0).toUpperCase();
        $('authName').textContent = name;

        $('userCard').style.display = 'flex';
        $('userCard').classList.toggle('super', state.isSuperAdmin);
        $('userName').textContent = name;
        $('userSub').textContent = email || 'Signed in';
        $('userAvatar').textContent = name.charAt(0).toUpperCase();
        $('userCrown').style.display = state.isSuperAdmin ? 'inline' : 'none';
        $('superBtn').style.display = state.isSuperAdmin ? 'flex' : 'none';

        const pa = $('profileAvatar');
        pa.textContent = name.charAt(0).toUpperCase();
        pa.className = 'profile-avatar' + (state.isSuperAdmin ? ' super' : '');
      } else {
        state.currentUser = null; state.isSuperAdmin = false;
        $('authBadge').style.display = 'none';
        $('userCard').style.display = 'none';
        $('superBtn').style.display = 'none';
      }
      renderAuthBox();
    } catch (e) { console.warn('Auth failed:', e); }
  }

  async function handleSignIn() {
    try {
      await puter.auth.signIn();
      const user = await puter.auth.getUser();
      toast('Welcome, ' + (user.username || 'User'));
      await updateAuthUI();
      renderThreads(); rebuildUI();
    } catch (err) { toast('Auth error: ' + (err.message || 'unknown')); }
  }

  async function handleSignOut() {
    if (!confirm('Sign out?')) return;
    try {
      await puter.auth.signOut();
      state.currentUser = null; state.isSuperAdmin = false;
      await updateAuthUI();
      toast('Signed out');
    } catch { toast('Sign out failed'); }
  }

  // ============ PROFILE ============
  function openProfile() {
    if (!state.currentUser) return;
    const name = state.currentUser.username || 'User';
    const email = state.currentUser.email || '—';
    $('profileName').textContent = name;
    $('profileEmail').textContent = email;
    $('profileAvatar').textContent = name.charAt(0).toUpperCase();
    $('profileRole').style.display = state.isSuperAdmin ? 'inline-flex' : 'none';
    const statsEl = $('profileStats');
    statsEl.innerHTML = '';
    const myChats = Object.keys(state.threads).length;
    const myMessages = Object.values(state.threads).reduce((sum, t) =>
      sum + t.messages.filter(m => m.role !== 'system').length, 0);
    addStatCard(statsEl, myChats, 'Your Chats');
    addStatCard(statsEl, myMessages, 'Your Messages');
    $('profileModal').classList.add('show');
  }

  function addStatCard(container, value, label) {
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML = '<div class="stat-value">' + value + '</div><div class="stat-label">' + label + '</div>';
    container.appendChild(card);
  }

  // ============ SETTINGS ============
  function buildLangGrid() {
    const grid = $('langGrid');
    grid.innerHTML = '';
    LANGUAGES.forEach(l => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lang-option' + (l.code === state.preferredLang ? ' active' : '');
      btn.innerHTML = '<span class="lang-flag">' + l.flag + '</span><span>' + l.native + '</span>';
      btn.onclick = () => {
        state.preferredLang = l.code;
        localStorage.setItem('dark-lang', state.preferredLang);
        buildLangGrid();
        toast('Language: ' + l.name);
      };
      grid.appendChild(btn);
    });
  }

  function buildSizeGrid() {
    const grid = $('sizeGrid');
    grid.innerHTML = '';
    IMAGE_SIZES.forEach(s => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'size-opt' + (s.code === state.preferredSize ? ' active' : '');
      btn.innerHTML = '<span>' + s.name + '</span><small>' + s.dim + '</small>';
      btn.onclick = () => {
        state.preferredSize = s.code;
        localStorage.setItem('dark-size', state.preferredSize);
        buildSizeGrid();
        toast('Size: ' + s.name);
      };
      grid.appendChild(btn);
    });
  }

  function openSettings() {
    buildLangGrid(); buildSizeGrid(); renderAuthBox();
    $('autoSpeakToggle').classList.toggle('on', state.autoSpeak);
    $('themeToggle').classList.toggle('on', state.theme === 'dark');
    $('settingsModal').classList.add('show');
  }

  function saveSettings() {
    state.autoSpeak = $('autoSpeakToggle').classList.contains('on');
    localStorage.setItem('dark-autospeak', state.autoSpeak);
    state.theme = $('themeToggle').classList.contains('on') ? 'dark' : 'light';
    applyTheme();
    $('settingsModal').classList.remove('show');
    toast('Settings saved');
  }

  // ============ EXPORT ============
  function exportAllChats() {
    const all = Object.values(state.threads).map(t => {
      const v = t.messages.filter(m => m.role !== 'system');
      return '# ' + t.title + '\n\n' + v.map(m =>
        '**' + (m.role === 'user' ? 'You' : 'DARK') + ':**\n\n' + m.content
      ).join('\n\n');
    }).join('\n\n---\n\n---\n\n');
    const blob = new Blob([all], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'dark-all-chats.md';
    a.click();
    toast('Exported');
  }

  // ============ EVENTS ============
  function handleSend(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (state.busy) { if (state.abortController) state.abortController.abort(); return; }
    sendMsg();
  }

  function attachEvents() {
    $('sendBtn').addEventListener('click', handleSend, false);
    $('sendBtn').addEventListener('touchend', (e) => { e.preventDefault(); handleSend(e); }, { passive: false });

    $('chatInput').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!state.busy) sendMsg(); }
    });

    $('btnSettings').onclick = openSettings;
    $('sidebarToggle').onclick = () => {
      if (window.innerWidth <= 900) $('sidebar').classList.toggle('open');
      else $('sidebar').classList.toggle('hidden');
    };
    $('newChat').onclick = () => createThread();
    $('searchBox').oninput = (e) => {
      state.searchQuery = e.target.value.trim().toLowerCase();
      renderThreads();
    };
    $('exportAllBtn').onclick = exportAllChats;
    $('clearAllBtn').onclick = () => {
      if (!confirm('Delete ALL chats?')) return;
      state.threads = {}; state.activeId = null;
      createThread(true); saveThreads(); renderThreads(); rebuildUI();
      toast('All cleared');
    };
    $('userCard').onclick = () => { if (state.currentUser) openProfile(); };
    $('superBtn').onclick = () => window.DARK_OPEN_SUPER && window.DARK_OPEN_SUPER();
    $('profileClose').onclick = () => $('profileModal').classList.remove('show');
    $('adEditCancel').onclick = () => $('adEditModal').classList.remove('show');
    $('adEditSave').onclick = () => window.DARK_SAVE_AD && window.DARK_SAVE_AD();
    $('settingsCancel').onclick = () => $('settingsModal').classList.remove('show');
    $('settingsSave').onclick = saveSettings;
    $('autoSpeakToggle').onclick = () => $('autoSpeakToggle').classList.toggle('on');
    $('themeToggle').onclick = () => $('themeToggle').classList.toggle('on');
    $('adSkip').onclick = () => {
      if ($('adSkip').disabled) return;
      $('adFullscreen').classList.remove('show');
    };
    $('authBadge').onclick = () => { if (state.currentUser) openProfile(); };
  }

  // ============ INIT ============
  async function init() {
    loadThreads();
    const totalUsers = parseInt(localStorage.getItem('dark-total-users') || '0', 10);
    localStorage.setItem('dark-total-users', totalUsers + 1);

    applyTheme();

    try { await updateAuthUI(); } catch {}

    if (state.currentUser) {
      try {
        const users = JSON.parse(localStorage.getItem('dark-recent-users') || '[]');
        users.push({ name: state.currentUser.username || 'User', time: Date.now() });
        localStorage.setItem('dark-recent-users', JSON.stringify(users.slice(-50)));
      } catch {}
    }

    const c1 = localStorage.getItem('dark-custom-accent');
    const c2 = localStorage.getItem('dark-custom-accent-2');
    if (c1) document.documentElement.style.setProperty('--accent', c1);
    if (c2) document.documentElement.style.setProperty('--accent-2', c2);
    const logo = localStorage.getItem('dark-custom-logo');
    if (logo) {
      document.querySelectorAll('.brand-mark, .welcome-icon').forEach(el => el.textContent = logo);
    }

    renderThreads();
    rebuildUI();
    attachEvents();

    try {
      const h = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'ping' }] })
      });
      setStatus(h.ok ? 'Online' : 'Error', h.ok);
    } catch { setStatus('Proxy offline', false); }
  }

  // ============ EXPOSE FOR ADMIN ============
  window.DARK_APP = {
    state, $, escapeHtml, toast, setStatus, renderThreads, rebuildUI,
    createThread, renderAdListDummy: () => {},
    openAdEditor: null // set by admin.js
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
