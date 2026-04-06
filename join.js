// ============================================================
// join.js — Challenger Gateway Logic
// Loads game info, lets the challenger accept and join
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  const gameCode = getParam('game');
  const challengeCard = document.getElementById('challengeCard');
  const errorCard = document.getElementById('errorCard');

  console.log('[QuizHub Join] Game code from URL:', gameCode);

  if (!gameCode) {
    console.warn('[QuizHub Join] No game code in URL');
    challengeCard.style.display = 'none';
    errorCard.style.display = 'block';
    return;
  }

  // ── Load game details ──
  loadGameDetails();

  async function loadGameDetails() {
    try {
      const sb = getSupabase();

      console.log('[QuizHub Join] Fetching game with code:', gameCode);

      // Get game by code
      const { data: game, error: gameError } = await sb
        .from('games')
        .select('*')
        .eq('game_code', gameCode)
        .single();

      console.log('[QuizHub Join] Game query result:', { game, gameError });

      if (gameError || !game) {
        console.error('[QuizHub Join] Game not found or error:', gameError);
        challengeCard.style.display = 'none';
        errorCard.style.display = 'block';
        return;
      }

      // Check if game is still waiting
      if (game.status !== 'waiting') {
        console.warn('[QuizHub Join] Game status is:', game.status);
        challengeCard.style.display = 'none';
        errorCard.style.display = 'block';
        document.querySelector('#errorCard h2').textContent = 'Match Already Started';
        document.querySelector('#errorCard p').textContent = 'This duel is already in progress or complete.';
        return;
      }

      // Get the host player
      const { data: host, error: hostError } = await sb
        .from('players')
        .select('nickname')
        .eq('game_id', game.game_id)
        .eq('is_host', true)
        .single();

      console.log('[QuizHub Join] Host player:', { host, hostError });

      // Populate UI
      document.getElementById('hostName').textContent = host ? host.nickname : 'Unknown';

      const topicDisplay = game.source_type === 'topic'
        ? game.topic_or_text.substring(0, 30) + (game.topic_or_text.length > 30 ? '...' : '')
        : 'PDF Content';
      document.getElementById('badgeTopic').innerHTML = `<i data-lucide="book-open" style="width:12px;height:12px;"></i> ${topicDisplay}`;
      document.getElementById('badgeQuestions').innerHTML = `<i data-lucide="hash" style="width:12px;height:12px;"></i> ${game.num_questions} Questions`;
      lucide.createIcons();

      // Store game info
      sessionStorage.setItem('quizhub_game_id', String(game.game_id));
      sessionStorage.setItem('quizhub_game_code', gameCode);
      sessionStorage.setItem('quizhub_is_host', 'false');

    } catch (err) {
      console.error('[QuizHub Join] Error loading game:', err);
      challengeCard.style.display = 'none';
      errorCard.style.display = 'block';
    }
  }

  // ── Accept Duel ──
  document.getElementById('acceptBtn').addEventListener('click', async () => {
    const nickname = document.getElementById('joinNickname').value.trim();
    if (!nickname) {
      showToast('Please enter a nickname', 'error');
      document.getElementById('joinNickname').focus();
      return;
    }

    const gameId = sessionStorage.getItem('quizhub_game_id');
    if (!gameId) {
      showToast('Game not found', 'error');
      return;
    }

    const acceptBtn = document.getElementById('acceptBtn');
    acceptBtn.disabled = true;
    acceptBtn.innerHTML = '<span class="spinner" style="width:20px;height:20px;border-width:2px;"></span> Joining...';

    try {
      const sb = getSupabase();

      console.log('[QuizHub Join] Inserting challenger into game:', gameId);

      // Insert challenger player
      const { data: playerData, error: playerError } = await sb
        .from('players')
        .insert({
          game_id: parseInt(gameId, 10),
          nickname: nickname,
          score: 0,
          is_host: false
        })
        .select()
        .single();

      if (playerError) {
        console.error('[QuizHub Join] Player insert error:', playerError);
        throw playerError;
      }

      console.log('[QuizHub Join] Challenger joined:', playerData);

      sessionStorage.setItem('quizhub_nickname', nickname);
      sessionStorage.setItem('quizhub_player_id', String(playerData.player_id));

      showToast('Challenge accepted! Entering arena...', 'success');

      setTimeout(() => {
        navigateTo('battle.html', { game: gameCode });
      }, 800);

    } catch (err) {
      console.error('[QuizHub Join] Error joining game:', err);
      showToast(`Failed to join: ${err.message || 'Check console'}`, 'error');
      acceptBtn.disabled = false;
      acceptBtn.innerHTML = '<i data-lucide="shield"></i> Accept Duel';
      lucide.createIcons();
    }
  });
});
