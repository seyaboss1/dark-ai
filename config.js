/* ============================================================
   DARK AI — Config & Constants
   Loaded first. Exposes globals via window.DARK
   ============================================================ */

window.DARK = (function () {
  const PROXY_URL = '/chat';
  const SUPER_ADMINS = ['seyaboss1', 'seyaboss1@gmail.com', 'creative_mountain_405049'];

  const LANGUAGES = [
    { code: 'auto', name: 'Auto-detect', native: 'Auto',     flag: '🌐', tts: '' },
    { code: 'ar',   name: 'Arabic',      native: 'العربية',  flag: '🇸🇦', tts: 'ar-SA' },
    { code: 'en',   name: 'English',     native: 'English',  flag: '🇬🇧', tts: 'en-US' },
    { code: 'am',   name: 'Amharic',     native: 'አማርኛ',     flag: '🇪🇹', tts: 'am-ET' },
    { code: 'fr',   name: 'French',      native: 'Français', flag: '🇫🇷', tts: 'fr-FR' },
    { code: 'es',   name: 'Spanish',     native: 'Español',  flag: '🇪🇸', tts: 'es-ES' },
    { code: 'de',   name: 'German',      native: 'Deutsch',  flag: '🇩🇪', tts: 'de-DE' },
    { code: 'tr',   name: 'Turkish',     native: 'Türkçe',   flag: '🇹🇷', tts: 'tr-TR' },
    { code: 'hi',   name: 'Hindi',       native: 'हिन्दी',    flag: '🇮🇳', tts: 'hi-IN' },
    { code: 'zh',   name: 'Chinese',     native: '中文',     flag: '🇨🇳', tts: 'zh-CN' },
    { code: 'ja',   name: 'Japanese',    native: '日本語',   flag: '🇯🇵', tts: 'ja-JP' },
    { code: 'ru',   name: 'Russian',     native: 'Русский',  flag: '🇷🇺', tts: 'ru-RU' }
  ];

  const IMAGE_SIZES = [
    { code: 'square',    name: 'Square', dim: '1024×1024', w: 1024, h: 1024 },
    { code: 'landscape', name: 'Wide',   dim: '1280×720',  w: 1280, h: 720  },
    { code: 'portrait',  name: 'Tall',   dim: '720×1280',  w: 720,  h: 1280 },
    { code: 'hd',        name: 'HD',     dim: '1920×1080', w: 1920, h: 1080 }
  ];

  const DEFAULT_SYSTEM_PROMPT = `You are DARK, an elite multilingual AI assistant with native fluency in Arabic, English, and Amharic.

IMAGE GENERATION:
When user requests an image, respond ONLY in this exact format:
[IMAGE_PROMPT]detailed image description here[/IMAGE_PROMPT]
Then ONE short line: "Click the button below to generate 👇"

VIDEO GENERATION:
When user requests a video, respond ONLY in this format:
[VIDEO_PROMPT]detailed video description[/VIDEO_PROMPT]
Then ONE short line: "Click the button below to generate 👇"

NEVER include "generate image of" or "How to generate it" in your reply.
NEVER include markdown like **Prompt:** or italics.
NEVER give instructions — just output the wrapped prompt.

For other tasks (chat, code, translation):
- Reply in the user's last message language
- Be direct and helpful
- Use markdown code blocks for code

Amharic rules: SOV order, correct verb conjugations, definite articles (-ው, -ዋ, -ዎቹ), prepositions (በ-, ለ-, ከ-, ወደ-). NEVER mix with English.`;

  const QUICK_PROMPTS = [
    { emoji: '👤', title: 'Who are you', desc: 'Learn about DARK', prompt: 'Who are you?' },
    { emoji: '💬', title: 'مرحبا',        desc: 'Talk in Arabic',   prompt: 'مرحبا، كيف حالك؟' },
    { emoji: '🎨', title: 'HD Portrait',  desc: 'Generate image',   prompt: 'صمم صورة رجل يرتدي بدلة رسمية' },
    { emoji: '🎬', title: 'Video',        desc: 'Generate video',   prompt: 'صمم فيديو قطة تلعب في الحديقة' },
    { emoji: '💻', title: 'Code',         desc: 'Python, JS',       prompt: 'اكتب دالة بايثون لقلب نص' }
  ];

  return {
    PROXY_URL,
    SUPER_ADMINS,
    LANGUAGES,
    IMAGE_SIZES,
    DEFAULT_SYSTEM_PROMPT,
    QUICK_PROMPTS
  };
})();
