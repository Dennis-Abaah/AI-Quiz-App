// ============================================================
// results.js — The Aftermath Logic
// Displays winner/loser, scores, and provides rematch option
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  const gameCode = getParam('game') || sessionStorage.getItem('quizhub_game_code');
  const gameId = sessionStorage.getItem('quizhub_game_id');
  const myNickname = sessionStorage.getItem('quizhub_nickname') || 'Player';

  const resultsLoading = document.getElementById('resultsLoading');
  const resultsUI = document.getElementById('resultsUI');

  // ── Load final scores ──
  loadResults();

  async function loadResults() {
    let myScore = parseInt(sessionStorage.getItem('quizhub_my_score') || '0', 10);
    let myCorrectCount = parseInt(sessionStorage.getItem('quizhub_my_correct') || '0', 10);
    let oppScore = parseInt(sessionStorage.getItem('quizhub_opp_score') || '0', 10);
    let oppName = sessionStorage.getItem('quizhub_opp_name') || 'Opponent';
    let totalQ = parseInt(sessionStorage.getItem('quizhub_total_questions') || '5', 10);

    // Try to fetch latest from Supabase for accuracy
    if (gameId) {
      try {
        const sb = getSupabase();
        const { data: players } = await sb
          .from('players')
          .select('*')
          .eq('game_id', gameId);

        if (players && players.length >= 2) {
          const me = players.find(p => p.nickname === myNickname);
          const opp = players.find(p => p.nickname !== myNickname);

          if (me) myScore = me.score || 0;
          if (opp) {
            oppScore = opp.score || 0;
            oppName = opp.nickname;
          }
        }

        // Get total questions count
        const { count } = await sb
          .from('questions')
          .select('*', { count: 'exact', head: true })
          .eq('game_id', gameId);

        if (count) totalQ = count;
      } catch (err) {
        console.error('Error fetching results:', err);
      }
    }

    // Determine outcome
    const iWon = myScore > oppScore;
    const isDraw = myScore === oppScore;

    // ── Render UI ──
    resultsLoading.style.display = 'none';
    resultsUI.style.display = 'block';

    // Icon & Title
    const resultIcon = document.getElementById('resultIcon');
    const resultTitle = document.getElementById('resultTitle');
    const resultSubtitle = document.getElementById('resultSubtitle');

    if (isDraw) {
      resultIcon.textContent = '🤝';
      resultTitle.textContent = "It's a Draw!";
      resultTitle.className = 'results-title fade-in fade-in-delay-1';
      resultTitle.style.color = 'var(--text-primary)';
      resultSubtitle.textContent = 'Evenly matched competitors.';
    } else if (iWon) {
      resultIcon.textContent = '👑';
      resultTitle.textContent = 'Victory!';
      resultTitle.classList.add('winner');
      resultSubtitle.textContent = 'You dominated the arena!';
    } else {
      resultIcon.textContent = '💀';
      resultTitle.textContent = 'Defeated';
      resultTitle.classList.add('loser');
      resultSubtitle.textContent = `${oppName} claimed the throne.`;
    }

    // Scoreboard
    const scoreboard = document.getElementById('scoreboard');
    scoreboard.innerHTML = `
      <div class="results-player-card ${iWon || isDraw ? 'winner-card' : 'loser-card'}">
        <div class="player-avatar">${myNickname.charAt(0).toUpperCase()}</div>
        <p class="player-name" style="margin-bottom: 0.5rem;">${myNickname}</p>
        <p class="score-value">${myScore}</p>
        <p style="font-size: 0.75rem; color: var(--text-muted);">points</p>
      </div>
      <div class="results-player-card ${!iWon || isDraw ? 'winner-card' : 'loser-card'}">
        <div class="player-avatar">${oppName.charAt(0).toUpperCase()}</div>
        <p class="player-name" style="margin-bottom: 0.5rem;">${oppName}</p>
        <p class="score-value">${oppScore}</p>
        <p style="font-size: 0.75rem; color: var(--text-muted);">points</p>
      </div>
    `;

    // Stats
    const accuracy = totalQ > 0 ? Math.round((myCorrectCount / totalQ) * 100) : 0;
    document.getElementById('statCorrect').textContent = myCorrectCount;
    document.getElementById('statTotal').textContent = totalQ;
    document.getElementById('statAccuracy').textContent = `${accuracy}%`;
  }

  // ── Rematch ──
  document.getElementById('rematchBtn').addEventListener('click', () => {
    // Clear game-specific data but keep nickname
    const nickname = sessionStorage.getItem('quizhub_nickname');
    sessionStorage.clear();
    if (nickname) sessionStorage.setItem('quizhub_nickname', nickname);
    navigateTo('index.html');
  });

  // ── Return Home ──
  document.getElementById('homeBtn').addEventListener('click', () => {
    sessionStorage.clear();
    navigateTo('index.html');
  });
});
