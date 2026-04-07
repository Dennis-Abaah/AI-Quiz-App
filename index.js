// ============================================================
// index.js — Setup Terminal Logic
// Creates a new game in Supabase and redirects to the lobby.
// Handles PDF upload + text extraction via PDF.js.
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide icons
  lucide.createIcons();

  // ── State ──
  let sourceType = 'topic';   // 'topic' or 'pdf'
  let difficulty = 'medium';
  let extractedPdfText = '';   // Text extracted from uploaded PDF

  // ── DOM Elements ──
  const nicknameInput  = document.getElementById('nickname');
  const topicInput     = document.getElementById('topicInput');
  const topicGroup     = document.getElementById('topicGroup');
  const pdfGroup       = document.getElementById('pdfGroup');
  const sourceToggle   = document.getElementById('sourceToggle');
  const questionSlider = document.getElementById('questionCount');
  const questionValue  = document.getElementById('questionCountValue');
  const levelSelector  = document.getElementById('levelSelector');
  const initBtn        = document.getElementById('initBtn');
  const roomCodeInput  = document.getElementById('roomCodeInput');
  const joinRoomBtn    = document.getElementById('joinRoomBtn');

  // PDF elements
  const pdfDropZone      = document.getElementById('pdfDropZone');
  const pdfFileInput     = document.getElementById('pdfFileInput');
  const pdfUploadContent = document.getElementById('pdfUploadContent');
  const pdfUploadSuccess = document.getElementById('pdfUploadSuccess');
  const pdfFileName      = document.getElementById('pdfFileName');
  const pdfCharCount     = document.getElementById('pdfCharCount');
  const pdfRemoveBtn     = document.getElementById('pdfRemoveBtn');
  const pdfLoading       = document.getElementById('pdfLoading');

  // ── Configure PDF.js worker ──
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  // ── Source Toggle ──
  sourceToggle.addEventListener('click', (e) => {
    const tab = e.target.closest('.toggle-tab');
    if (!tab) return;

    sourceToggle.querySelectorAll('.toggle-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    sourceType = tab.dataset.source;
    topicGroup.style.display = sourceType === 'topic' ? 'block' : 'none';
    pdfGroup.style.display   = sourceType === 'pdf'   ? 'block' : 'none';
  });

  // ── PDF Drop Zone — Click ──
  pdfDropZone.addEventListener('click', (e) => {
    // Don't trigger file picker if clicking the Remove button
    if (e.target.closest('#pdfRemoveBtn')) return;
    pdfFileInput.click();
  });

  // ── PDF Drop Zone — Drag & Drop ──
  pdfDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    pdfDropZone.classList.add('drag-over');
  });

  pdfDropZone.addEventListener('dragleave', () => {
    pdfDropZone.classList.remove('drag-over');
  });

  pdfDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    pdfDropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      handlePdfFile(file);
    } else {
      showToast('Please upload a PDF file', 'error');
    }
  });

  // ── PDF File Input Change ──
  pdfFileInput.addEventListener('change', () => {
    const file = pdfFileInput.files[0];
    if (file) handlePdfFile(file);
  });

  // ── PDF Remove Button ──
  pdfRemoveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    extractedPdfText = '';
    pdfFileInput.value = '';
    pdfUploadSuccess.style.display = 'none';
    pdfUploadContent.style.display = 'flex';
    showToast('PDF removed', 'info');
  });

  /**
   * Extract text from a PDF file using PDF.js
   */
  async function handlePdfFile(file) {
    if (!window.pdfjsLib) {
      showToast('PDF library failed to load. Try refreshing.', 'error');
      return;
    }

    // Show loading state
    pdfUploadContent.style.display = 'none';
    pdfUploadSuccess.style.display = 'none';
    pdfLoading.style.display = 'block';

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let fullText = '';
      const totalPages = pdf.numPages;

      for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n\n';
      }

      fullText = fullText.trim();

      if (!fullText || fullText.length < 20) {
        showToast('Could not extract enough text from this PDF. It may be an image-based PDF.', 'error');
        pdfLoading.style.display = 'none';
        pdfUploadContent.style.display = 'flex';
        return;
      }

      // Limit text to 5000 chars for the API
      extractedPdfText = fullText.substring(0, 5000);

      // Show success state
      pdfLoading.style.display = 'none';
      pdfUploadSuccess.style.display = 'flex';
      pdfFileName.textContent = file.name;
      pdfCharCount.textContent = `${totalPages} page${totalPages > 1 ? 's' : ''} · ${extractedPdfText.length.toLocaleString()} characters extracted`;

      // Re-init icons in dynamic content
      lucide.createIcons();
      showToast(`Extracted text from ${totalPages} page${totalPages > 1 ? 's' : ''}`, 'success');

    } catch (err) {
      console.error('PDF extraction error:', err);
      showToast('Failed to read PDF. Try a different file.', 'error');
      pdfLoading.style.display = 'none';
      pdfUploadContent.style.display = 'flex';
    }
  }

  // ── Question Count Slider ──
  questionSlider.addEventListener('input', () => {
    questionValue.textContent = questionSlider.value;
  });

  // ── Difficulty Level ──
  levelSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('.level-btn');
    if (!btn) return;

    levelSelector.querySelectorAll('.level-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    difficulty = btn.dataset.level;
  });

  // ── Initialize Match ──
  initBtn.addEventListener('click', async () => {
    const nickname = nicknameInput.value.trim();
    if (!nickname) {
      showToast('Please enter a nickname', 'error');
      nicknameInput.focus();
      return;
    }

    // Determine the content
    let topicOrText = '';
    let sourceForDb = 'topic';

    if (sourceType === 'topic') {
      topicOrText = topicInput.value.trim();
      sourceForDb = 'topic';
      if (!topicOrText) {
        showToast('Please enter a topic', 'error');
        topicInput.focus();
        return;
      }
    } else {
      // PDF mode
      topicOrText = extractedPdfText;
      sourceForDb = 'text';
      if (!topicOrText) {
        showToast('Please upload a PDF file first', 'error');
        return;
      }
    }

    const numQuestions = parseInt(questionSlider.value, 10);

    // Disable button during submission
    initBtn.disabled = true;
    initBtn.innerHTML = '<span class="spinner" style="width:20px;height:20px;border-width:2px;"></span> Creating Match...';

    try {
      const sb = getSupabase();
      const gameCode = generateGameCode();

      console.log('[QuizHub] Creating game with code:', gameCode);

      // 1. Insert game
      const { data: gameData, error: gameError } = await sb
        .from('games')
        .insert({
          game_code: gameCode,
          topic_or_text: topicOrText,
          source_type: sourceForDb,
          num_questions: numQuestions,
          difficulty: difficulty,
          status: 'waiting'
        })
        .select()
        .single();

      if (gameError) {
        console.error('[QuizHub] Game insert error:', gameError);
        throw gameError;
      }

      console.log('[QuizHub] Game created:', gameData);

      // 2. Insert host player
      const { data: playerData, error: playerError } = await sb
        .from('players')
        .insert({
          game_id: gameData.game_id,
          nickname: nickname,
          score: 0,
          is_host: true
        })
        .select()
        .single();

      if (playerError) {
        console.error('[QuizHub] Player insert error:', playerError);
        throw playerError;
      }

      console.log('[QuizHub] Host player created:', playerData);

      // Store player info locally
      sessionStorage.setItem('quizhub_nickname', nickname);
      sessionStorage.setItem('quizhub_game_id', String(gameData.game_id));
      sessionStorage.setItem('quizhub_game_code', gameCode);
      sessionStorage.setItem('quizhub_is_host', 'true');
      sessionStorage.setItem('quizhub_player_id', String(playerData.player_id));

      showToast('Match created! Redirecting...', 'success');

      // Redirect to lobby
      setTimeout(() => {
        navigateTo('lobby.html', { game: gameCode });
      }, 600);

    } catch (err) {
      console.error('[QuizHub] Error creating match:', err);
      showToast(`Failed: ${err.message || 'Check console for details'}`, 'error');
      initBtn.disabled = false;
      initBtn.innerHTML = '<i data-lucide="zap"></i> Initialize Match';
      lucide.createIcons();
    }
  });

  // ── Join Existing Game ──
  if (joinRoomBtn && roomCodeInput) {
    joinRoomBtn.addEventListener('click', () => {
      const code = roomCodeInput.value.trim().toUpperCase();
      if (!code) {
        showToast('Please enter a room code', 'error');
        roomCodeInput.focus();
        return;
      }
      if (code.length !== 6) {
        showToast('Room code must be 6 characters', 'error');
        roomCodeInput.focus();
        return;
      }
      
      joinRoomBtn.disabled = true;
      joinRoomBtn.innerHTML = '<span class="spinner" style="width:20px;height:20px;border-width:2px;border-color:#fff;border-bottom-color:transparent;border-radius:50%;display:inline-block;animation:spin 1s linear infinite;"></span> Joining...';
      
      setTimeout(() => {
        navigateTo('join.html', { game: code });
      }, 300);
    });

    roomCodeInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        joinRoomBtn.click();
      }
    });
  }
});
