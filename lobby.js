// ============================================================
// lobby.js — Radar Link Logic
// Subscribes to Supabase Realtime, waits for opponent to join
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  const gameCode = getParam('game') || sessionStorage.getItem('quizhub_game_code');
  const gameId = sessionStorage.getItem('quizhub_game_id');

  console.log('[QuizHub Lobby] gameCode:', gameCode, '| gameId:', gameId);

  if (!gameCode) {
    showToast('No game found. Redirecting...', 'error');
    setTimeout(() => navigateTo('index.html'), 1500);
    return;
  }

  // ── Populate share link ──
  const shareUrl = buildShareUrl('join.html', { game: gameCode });
  document.getElementById('shareLink').value = shareUrl;
  document.getElementById('gameCodeDisplay').textContent = gameCode;

  console.log('[QuizHub Lobby] Share URL:', shareUrl);

  // ── Share buttons ──
  const shareMessage = `Join my Quiz Duel on Quiz Bay! 🏆\nBattle Link: ${shareUrl}`;

  document.getElementById('shareWhatsapp').addEventListener('click', () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareMessage)}`, '_blank');
  });

  document.getElementById('shareMessenger').addEventListener('click', async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Quiz Hub Duel',
          text: 'Join my Quiz Duel!',
          url: shareUrl,
        });
      } catch (e) {
        console.log('Share failed', e);
      }
    } else {
      // Fallback to clipboard for "Messenger" if Web Share not supported
      await navigator.clipboard.writeText(shareUrl);
      showToast('Messenger link copied to clipboard!', 'success');
    }
  });

  // ── Copy button ──
  document.getElementById('copyBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Link copied to clipboard!', 'success');
    } catch {
      // Fallback
      const input = document.getElementById('shareLink');
      input.select();
      document.execCommand('copy');
      showToast('Link copied!', 'success');
    }
  });

  // ── Cancel button ──
  document.getElementById('cancelBtn').addEventListener('click', async () => {
    try {
      const sb = getSupabase();
      if (gameId) {
        await sb.from('games').update({ status: 'cancelled' }).eq('game_id', gameId);
      }
    } catch (e) {
      console.error('[QuizHub Lobby] Error cancelling:', e);
    }
    sessionStorage.clear();
    navigateTo('index.html');
  });

  // ── Realtime: Listen for player joining ──
  subscribeToPlayers();

  async function subscribeToPlayers() {
    const sb = getSupabase();

    // Make sure we have the game_id
    let currentGameId = gameId;
    if (!currentGameId) {
      console.log('[QuizHub Lobby] No game_id in session, fetching by code...');
      const { data, error } = await sb
        .from('games')
        .select('game_id')
        .eq('game_code', gameCode)
        .single();

      if (error) {
        console.error('[QuizHub Lobby] Error fetching game:', error);
        showToast('Could not find game. Try creating a new match.', 'error');
        return;
      }
      if (data) {
        currentGameId = String(data.game_id);
        sessionStorage.setItem('quizhub_game_id', currentGameId);
        console.log('[QuizHub Lobby] Resolved game_id:', currentGameId);
      }
    }

    if (!currentGameId) {
      showToast('Game not found', 'error');
      return;
    }

    // Subscribe to INSERT events on the players table for this game
    const channel = sb
      .channel(`lobby-${currentGameId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'players',
          filter: `game_id=eq.${currentGameId}`
        },
        async (payload) => {
          console.log('[QuizHub Lobby] Realtime INSERT on players:', payload);
          const newPlayer = payload.new;

          // If this is not the host, an opponent joined!
          if (!newPlayer.is_host) {
            showToast(`${newPlayer.nickname} has joined! Starting battle...`, 'success');

            // Update game status
            await sb
              .from('games')
              .update({ status: 'in_progress' })
              .eq('game_id', currentGameId);

            // Redirect to battle
            setTimeout(() => {
              navigateTo('battle.html', { game: gameCode });
            }, 1200);
          }
        }
      )
      .subscribe((status) => {
        console.log('[QuizHub Lobby] Realtime subscription status:', status);
      });

    // Also poll periodically as a fallback
    const pollInterval = setInterval(async () => {
      const { data: players } = await sb
        .from('players')
        .select('*')
        .eq('game_id', currentGameId);

      if (players && players.length >= 2) {
        clearInterval(pollInterval);
        const opponent = players.find(p => !p.is_host);
        if (opponent) {
          console.log('[QuizHub Lobby] Opponent detected via polling:', opponent.nickname);
          showToast(`${opponent.nickname} has joined! Starting battle...`, 'success');
          await sb
            .from('games')
            .update({ status: 'in_progress' })
            .eq('game_id', currentGameId);
          setTimeout(() => {
            navigateTo('battle.html', { game: gameCode });
          }, 1200);
        }
      }
    }, 3000);
  }
});
