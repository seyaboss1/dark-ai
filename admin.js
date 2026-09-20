/* ============================================================
   DARK AI — Super Admin Panel
   Depends: config.js, app.js
   ============================================================ */

(function () {
  'use strict';

  const { DEFAULT_SYSTEM_PROMPT } = window.DARK;
  const APP = window.DARK_APP;
  const { state, $, escapeHtml, toast, renderThreads, rebuildUI, createThread } = APP;

  // ============ AD LIST ============
  function renderAdList() {
    const container = $('superAdsList') || $('adList');
    if (!container) return;
    container.innerHTML = '';
    if (state.ads.length === 0) {
      container.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;text-align:center;padding:1rem;">No ads yet.</p>';
      return;
    }
    state.ads.forEach((ad, i) => {
      const item = document.createElement('div');
      item.className = 'ad-item';
      item.innerHTML =
        '<div class="ad-item-header">' +
          '<div class="ad-item-title">' + escapeHtml(ad.title || 'Untitled') + '</div>' +
          '<div class="ad-item-actions">' +
            '<button data-act="edit" data-i="' + i + '">Edit</button>' +
            '<button class="del" data-act="del" data-i="' + i + '">Delete</button>' +
          '</div>' +
        '</div>' +
        '<div class="ad-item-body">Every ' + (ad.freq || 10) + ' msgs · ' +
          escapeHtml((ad.desc || '').slice(0, 60)) + '</div>';
      item.querySelector('[data-act="edit"]').onclick = () => openAdEditor(i);
      item.querySelector('[data-act="del"]').onclick = () => deleteAd(i);
      container.appendChild(item);
    });
  }

  function openAdEditor(index = -1) {
    const isNew = index === -1;
    const ad = isNew ? {} : state.ads[index];
    $('adEditTitle').textContent = isNew ? '📢 NEW AD' : '✏️ EDIT AD';
    $('adTitle').value = ad.title || '';
    $('adDesc').value = ad.desc || '';
    $('adImage').value = ad.image || '';
    $('adLink').value = ad.link || '';
    $('adCta').value = ad.cta || 'Learn More';
    $('adFreq').value = ad.freq || 10;
    $('adEditModal').dataset.index = index;
    $('adEditModal').classList.add('show');
  }
  APP.openAdEditor = openAdEditor;

  function saveAdFromEditor() {
    const index = parseInt($('adEditModal').dataset.index, 10);
    const ad = {
      title: $('adTitle').value.trim() || 'Special Offer',
      desc: $('adDesc').value.trim(),
      image: $('adImage').value.trim(),
      link: $('adLink').value.trim(),
      cta: $('adCta').value.trim() || 'Learn More',
      freq: parseInt($('adFreq').value, 10) || 10
    };
    if (index === -1) state.ads.push(ad);
    else state.ads[index] = ad;
    localStorage.setItem('dark-ads', JSON.stringify(state.ads));
    renderAdList();
    $('adEditModal').classList.remove('show');
    toast('Ad saved');
  }
  window.DARK_SAVE_AD = saveAdFromEditor;

  function deleteAd(index) {
    if (!confirm('Delete this ad?')) return;
    state.ads.splice(index, 1);
    localStorage.setItem('dark-ads', JSON.stringify(state.ads));
    renderAdList();
    toast('Ad deleted');
  }

  // ============ AD DISPLAY ============
  function checkAndShowAd() {
    if (state.ads.length === 0) return;
    const due = state.ads.find(ad => state.messageCounter > 0 && state.messageCounter % (ad.freq || 10) === 0);
    if (!due) return;
    showFullscreenAd(due);
  }
  window.DARK_CHECK_AD = checkAndShowAd;

  function showFullscreenAd(ad) {
    const overlay = $('adFullscreen');
    $('adFsTitle').textContent = ad.title || 'Sponsored';
    $('adFsDesc').textContent = ad.desc || '';
    const cta = $('adFsCta');
    cta.textContent = ad.cta || 'Learn More';
    cta.href = ad.link || '#';
    const img = $('adFsImage');
    if (ad.image) { img.src = ad.image; img.style.display = 'block'; }
    else img.style.display = 'none';
    overlay.classList.add('show');

    const skipBtn = $('adSkip');
    let countdown = 5;
    skipBtn.disabled = true;
    skipBtn.textContent = countdown;
    const timer = setInterval(() => {
      countdown--;
      skipBtn.textContent = countdown;
      if (countdown <= 0) {
        clearInterval(timer);
        skipBtn.disabled = false;
        skipBtn.textContent = '✕';
      }
    }, 1000);
  }

  // ============ SUPER PANEL ============
  function openSuperPanel() {
    if (!state.isSuperAdmin) { toast('❌ Super Admin only'); return; }
    refreshSuperStats();
    $('superPanel').classList.add('show');
  }
  window.DARK_OPEN_SUPER = openSuperPanel;

  function closeSuperPanel() {
    $('superPanel').classList.remove('show');
  }

  function refreshSuperStats() {
    const totalUsers = parseInt(localStorage.getItem('dark-total-users') || '1', 10);
    const totalChats = Object.keys(state.threads).length;
    const totalMessages = Object.values(state.threads).reduce((sum, t) =>
      sum + t.messages.filter(m => m.role !== 'system').length, 0);
    $('saTotalUsers').textContent = totalUsers;
    $('saTotalChats').textContent = totalChats;
    $('saTotalAds').textContent = state.ads.length;
    const detail = $('saMsgDetail');
    if (detail) detail.textContent = 'TOTAL USERS · ' + totalMessages + ' messages';
  }

  // ============ EVENT HANDLERS ============
  function attachAdminEvents() {
    $('superClose').onclick = closeSuperPanel;
    $('saRefreshStats').onclick = () => { refreshSuperStats(); toast('✓ Stats refreshed'); };
    $('saResetStats').onclick = () => {
      if (!confirm('Reset all statistics?')) return;
      localStorage.setItem('dark-total-users', '1');
      localStorage.setItem('dark-msg-counter', '0');
      state.messageCounter = 0;
      refreshSuperStats();
      toast('✓ Stats reset');
    };
    $('saViewChats').onclick = () => {
      const totalChats = Object.keys(state.threads).length;
      const totalMessages = Object.values(state.threads).reduce((sum, t) =>
        sum + t.messages.filter(m => m.role !== 'system').length, 0);
      alert('Chats: ' + totalChats + '\nMessages: ' + totalMessages);
    };
    $('saAddAd').onclick = () => { closeSuperPanel(); openAdEditor(-1); };
    $('saManageAds').onclick = () => { closeSuperPanel(); openAdEditor(-1); };
    $('saEditPrompt').onclick = () => {
      const newPrompt = prompt('Edit System Prompt:', state.systemPrompt);
      if (newPrompt && newPrompt.trim()) {
        state.systemPrompt = newPrompt.trim();
        localStorage.setItem('dark-prompt', state.systemPrompt);
        Object.values(state.threads).forEach(t => {
          if (t.messages[0]?.role === 'system') t.messages[0].content = state.systemPrompt;
        });
        APP.state && localStorage.setItem('dark-threads', JSON.stringify(state.threads));
        toast('✓ Prompt updated');
      }
    };
    $('saResetPrompt').onclick = () => {
      if (!confirm('Reset system prompt to default?')) return;
      state.systemPrompt = DEFAULT_SYSTEM_PROMPT;
      localStorage.setItem('dark-prompt', state.systemPrompt);
      Object.values(state.threads).forEach(t => {
        if (t.messages[0]?.role === 'system') t.messages[0].content = state.systemPrompt;
      });
      localStorage.setItem('dark-threads', JSON.stringify(state.threads));
      toast('✓ Prompt reset');
    };
    $('saExportAll').onclick = () => {
      const data = {
        exportDate: new Date().toISOString(),
        version: '20.0',
        systemPrompt: state.systemPrompt,
        threads: state.threads,
        ads: state.ads,
        settings: {
          preferredLang: state.preferredLang,
          preferredSize: state.preferredSize,
          theme: state.theme,
          autoSpeak: state.autoSpeak
        },
        stats: {
          totalUsers: parseInt(localStorage.getItem('dark-total-users') || '1', 10),
          msgCounter: state.messageCounter
        }
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'dark-full-backup-' + Date.now() + '.json';
      a.click();
      toast('✓ Full backup exported');
    };
    $('saImportAll').onclick = () => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = '.json';
      input.onchange = (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const data = JSON.parse(ev.target.result);
            if (data.systemPrompt) {
              state.systemPrompt = data.systemPrompt;
              localStorage.setItem('dark-prompt', state.systemPrompt);
            }
            if (data.threads) {
              state.threads = data.threads;
              localStorage.setItem('dark-threads', JSON.stringify(state.threads));
            }
            if (data.ads) {
              state.ads = data.ads;
              localStorage.setItem('dark-ads', JSON.stringify(state.ads));
            }
            if (data.settings) {
              if (data.settings.preferredLang) state.preferredLang = data.settings.preferredLang;
              if (data.settings.preferredSize) state.preferredSize = data.settings.preferredSize;
              if (data.settings.theme) {
                state.theme = data.settings.theme;
                document.body.dataset.theme = state.theme === 'dark' ? 'dark' : '';
              }
              if (typeof data.settings.autoSpeak === 'boolean') state.autoSpeak = data.settings.autoSpeak;
            }
            renderThreads(); rebuildUI(); refreshSuperStats();
            toast('✓ Full restore complete');
          } catch { toast('❌ Invalid file'); }
        };
        reader.readAsText(file);
      };
      input.click();
    };
    $('saClearEverything').onclick = () => {
      if (!confirm('⚠️ Delete ALL chats, ads, and settings?')) return;
      if (!confirm('Really sure? Cannot undo!')) return;
      ['dark-threads','dark-active','dark-ads','dark-prompt','dark-msg-counter'].forEach(k => localStorage.removeItem(k));
      state.threads = {}; state.ads = [];
      state.systemPrompt = DEFAULT_SYSTEM_PROMPT;
      state.messageCounter = 0;
      createThread(true);
      renderThreads(); rebuildUI(); refreshSuperStats();
      toast('✓ Everything cleared');
    };
    $('saListUsers').onclick = () => {
      const users = JSON.parse(localStorage.getItem('dark-recent-users') || '[]');
      if (users.length === 0) { alert('No users tracked yet'); return; }
      alert('Recent users:\n\n' + users.slice(-20).map(u => u.name).join('\n'));
    };
    $('saClearUsers').onclick = () => {
      if (!confirm('Clear user tracking log?')) return;
      localStorage.removeItem('dark-recent-users');
      toast('✓ User log cleared');
    };
    $('saChangeColors').onclick = () => {
      const c1 = prompt('Primary color (hex):', '#4f46e5');
      const c2 = prompt('Secondary color (hex):', '#06b6d4');
      if (c1 && c2) {
        document.documentElement.style.setProperty('--accent', c1);
        document.documentElement.style.setProperty('--accent-2', c2);
        localStorage.setItem('dark-custom-accent', c1);
        localStorage.setItem('dark-custom-accent-2', c2);
        toast('✓ Colors updated');
      }
    };
    $('saChangeLogo').onclick = () => {
      const icon = prompt('Logo character:', '◆');
      if (icon) {
        document.querySelectorAll('.brand-mark, .welcome-icon').forEach(el => el.textContent = icon);
        localStorage.setItem('dark-custom-logo', icon);
        toast('✓ Logo updated');
      }
    };
    $('saAddPage').onclick = () => {
      const name = prompt('Page name (without .html):', 'about');
      const content = prompt('Page content (HTML):', '<h1>My Page</h1><p>Content here</p>');
      if (name && content) {
        const pages = JSON.parse(localStorage.getItem('dark-custom-pages') || '{}');
        pages[name] = content;
        localStorage.setItem('dark-custom-pages', JSON.stringify(pages));
        toast('✓ Page created: /' + name);
      }
    };
    $('saListPages').onclick = () => {
      const pages = JSON.parse(localStorage.getItem('dark-custom-pages') || '{}');
      const names = Object.keys(pages);
      if (names.length === 0) { alert('No custom pages yet'); return; }
      alert('Custom pages:\n\n' + names.join('\n'));
    };
    $('saReload').onclick = () => location.reload();
    $('saToggleTheme').onclick = () => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      document.body.dataset.theme = state.theme === 'dark' ? 'dark' : '';
      localStorage.setItem('dark-theme', state.theme);
      toast('Theme: ' + state.theme);
    };
    $('saFactoryReset').onclick = () => {
      if (!confirm('⚠️⚠️ FACTORY RESET\n\nThis will delete EVERYTHING.\n\nContinue?')) return;
      if (!confirm('⚠️⚠️ ARE YOU ABSOLUTELY SURE?\n\nThis CANNOT be undone!')) return;
      localStorage.clear();
      toast('💥 Factory reset complete');
      setTimeout(() => location.reload(), 1000);
    };
  }

  // Init admin after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachAdminEvents);
  } else {
    attachAdminEvents();
  }
})();
