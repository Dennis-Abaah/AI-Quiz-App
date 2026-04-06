// ============================================================
// Quiz Hub — Centralized Configuration
// All API keys and Supabase credentials are stored here.
// Import this file in every HTML page before other scripts.
// ============================================================

const CONFIG = Object.freeze({
  // Supabase
  SUPABASE_URL: 'https://geehuybkzyrcbdwyvgst.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdlZWh1eWJrenlyY2Jkd3l2Z3N0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMjQ3ODQsImV4cCI6MjA5MDcwMDc4NH0.1RkYoKRRNa-4C4ryyiPmqcZgnGHStBnoZOh9jalwF7w',

  // AI Configuration (Backend handled via Supabase Edge Functions)
  AI_MODEL: 'llama-3.3-70b-versatile',

  // App
  APP_NAME: 'Quiz Hub',
});

// ============================================================
// Supabase Client Singleton
// ============================================================
let _supabaseClient = null;

function getSupabase() {
  if (!_supabaseClient) {
    _supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  }
  return _supabaseClient;
}

// ============================================================
// Utility Helpers
// ============================================================

/** Generate a short 6-char game code */
function generateGameCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/** Show a toast notification */
function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast-notification');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast-notification toast-${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

/**
 * Redirect helper — uses simple relative paths to avoid URL construction issues.
 * @param {string} page - e.g. 'lobby.html'
 * @param {Object} params - query params e.g. { game: 'ABC123' }
 */
function navigateTo(page, params = {}) {
  const qs = new URLSearchParams(params).toString();
  window.location.href = qs ? `${page}?${qs}` : page;
}

/** Get URL params */
function getParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

/**
 * Build the full shareable URL for a given page/params.
 * Uses the current origin + directory path so the link works in any browser/tab.
 */
function buildShareUrl(page, params = {}) {
  const base = window.location.href.replace(/\/[^/]*(\?.*)?$/, '/');
  const qs = new URLSearchParams(params).toString();
  return qs ? `${base}${page}?${qs}` : `${base}${page}`;
}
