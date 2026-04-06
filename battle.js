// ============================================================
// battle.js — The Arena Logic
// Generates questions via Gemini, handles timer + scoring,
// syncs with Supabase Realtime for opponent score updates
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  // ── State ──
  let gameId = sessionStorage.getItem('quizhub_game_id');
  const gameCode = getParam('game') || sessionStorage.getItem('quizhub_game_code');
  const myNickname = sessionStorage.getItem('quizhub_nickname') || 'Player';
  const isHost = sessionStorage.getItem('quizhub_is_host') === 'true';

  let questions = [];
  let currentIndex = 0;
  let myScore = 0;
  let opponentScore = 0;
  let timerInterval = null;
  let timeLeft = 30;
  let answered = false;
  let myPlayerId = sessionStorage.getItem('quizhub_player_id') || null;
  let opponentPlayerId = null;
  let opponentNickname = 'Opponent';
  let questionStartTime = 0;
  let myCorrectCount = 0;
  let matchStartTime = 0;
  const TIME_PER_QUESTION = 15;
  const DELAY_BETWEEN = 2;

  console.log('[QuizHub Battle] Init state:', { gameId, gameCode, myNickname, isHost, myPlayerId });

  // ── DOM Elements ──
  const loadingState = document.getElementById('loadingState');
  const battleUI = document.getElementById('battleUI');
  const timerValue = document.getElementById('timerValue');
  const player1Name = document.getElementById('player1Name');
  const player2Name = document.getElementById('player2Name');
  const player1Score = document.getElementById('player1Score');
  const player2Score = document.getElementById('player2Score');
  const progressBar = document.getElementById('progressBar');
  const questionCounter = document.getElementById('questionCounter');
  const questionText = document.getElementById('questionText');
  const optionsGrid = document.getElementById('optionsGrid');

  // ── Initialize ──
  init();

  async function init() {
    const sb = getSupabase();

    // Resolve game_id if needed
    if (!gameId && gameCode) {
      const { data } = await sb
        .from('games')
        .select('game_id')
        .eq('game_code', gameCode)
        .single();
      if (data) {
        gameId = String(data.game_id);
        sessionStorage.setItem('quizhub_game_id', gameId);
        console.log('[QuizHub Battle] Resolved game_id:', gameId);
      }
    }

    if (!gameId) {
      showToast('Game not found', 'error');
      return;
    }

    // Load players
    const { data: players, error: playersError } = await sb
      .from('players')
      .select('*')
      .eq('game_id', parseInt(gameId, 10));

    console.log('[QuizHub Battle] Players:', { players, playersError });

    if (players) {
      const me = players.find(p => p.nickname === myNickname);
      const opp = players.find(p => p.nickname !== myNickname);

      if (me) myPlayerId = me.player_id;
      if (opp) {
        opponentPlayerId = opp.player_id;
        opponentNickname = opp.nickname;
        opponentScore = opp.score || 0;
      }
      console.log('[QuizHub Battle] Me:', myPlayerId, '| Opponent:', opponentPlayerId, opponentNickname);
    }

    player1Name.textContent = myNickname;
    player2Name.textContent = opponentNickname;

    // Check if questions already exist
    const { data: existingQ } = await sb
      .from('questions')
      .select('*')
      .eq('game_id', parseInt(gameId, 10))
      .order('question_id', { ascending: true });

    console.log('[QuizHub Battle] Existing questions:', existingQ?.length || 0);

    if (existingQ && existingQ.length > 0) {
      if (!matchStartTime) matchStartTime = new Date(existingQ[0].created_at).getTime() + 4000;
      questions = existingQ.map(q => ({
        id: q.question_id,
        question: q.question_text,
        options: q.options_array,
        correct: q.correct_answer
      }));
      startBattle();
    } else if (isHost) {
      // Host generates the questions
      await generateQuestions();
    } else {
      // Challenger waits for questions
      waitForQuestions();
    }

    // Subscribe to opponent score changes
    subscribeToScoreUpdates();
  }

  let generateAttempts = 0;

  // ── Generate Questions via Gemini AI ──
  async function generateQuestions() {
    generateAttempts++;
    const sb = getSupabase();

    // Get game details
    const { data: game } = await sb
      .from('games')
      .select('*')
      .eq('game_id', gameId)
      .single();

    if (!game) {
      showToast('Game data not found', 'error');
      return;
    }

    const numQ = game.num_questions || 5;
    const diff = game.difficulty || 'medium';
    const source = game.source_type === 'topic'
      ? `Topic: ${game.topic_or_text}`
      : `Text content: ${game.topic_or_text.substring(0, 3000)}`;

    try {
      console.log('[QuizHub Battle] Invoking edge function generate-quiz...');
      
      const { data, error: functionError } = await sb.functions.invoke('generate-quiz', {
        body: { numQ, diff, source, model: CONFIG.AI_MODEL }
      });

      if (functionError) {
         console.error('[QuizHub Battle] Function Error:', functionError);
         throw new Error(`Function Error: ${functionError.message || 'Unknown'}`);
      }

      if (data?.error) {
         console.error('[QuizHub Battle] AI Generation Error:', data.error);
         throw new Error(`API Error: ${data.error.message || data.error}`);
      }

      const parsed = data?.questions;

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('AI did not return an array of questions');
      }

      // Save questions to Supabase
      const questionRows = parsed.map(q => ({
        game_id: parseInt(gameId, 10),
        question_text: q.question,
        options_array: q.options,
        correct_answer: q.correct
      }));

      console.log('[QuizHub Battle] Saving', questionRows.length, 'questions to Supabase', questionRows);

      const { data: savedQuestions, error } = await sb
        .from('questions')
        .insert(questionRows)
        .select();

      if (error) {
         console.error('[QuizHub Battle] Supabase insert error:', error);
         throw error;
      }

      if (!matchStartTime && savedQuestions.length > 0) {
        matchStartTime = new Date(savedQuestions[0].created_at).getTime() + 4000;
      }

      questions = savedQuestions.map(q => ({
        id: q.question_id,
        question: q.question_text,
        options: q.options_array,
        correct: q.correct_answer
      }));

      startBattle();

    } catch (err) {
      console.error('[QuizHub Battle] Error generating questions:', err);
      
      if (generateAttempts < 2) {
        showToast(`Generation failed: ${err.message}. Retrying...`, 'error');
        // Retry exactly once after a short delay
        setTimeout(() => generateQuestions(), 4000);
      } else {
        showToast(`Generation failed permanently: ${err.message}. Start a new match.`, 'error');
        document.querySelector('#loadingState h2').textContent = 'Generation Failed';
        document.querySelector('.loading-text').textContent = err.message;
      }
    }
  }

  // ── Wait for host to generate questions ──
  function waitForQuestions() {
    const sb = getSupabase();

    const channel = sb
      .channel(`questions-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'questions',
          filter: `game_id=eq.${gameId}`
        },
        async () => {
          // Re-fetch all questions
          const { data: allQ } = await sb
            .from('questions')
            .select('*')
            .eq('game_id', gameId)
            .order('question_id', { ascending: true });

          if (allQ && allQ.length > 0) {
            if (!matchStartTime) matchStartTime = new Date(allQ[0].created_at).getTime() + 4000;
            questions = allQ.map(q => ({
              id: q.question_id,
              question: q.question_text,
              options: q.options_array,
              correct: q.correct_answer
            }));

            channel.unsubscribe();
            startBattle();
          }
        }
      )
      .subscribe();

    // Polling fallback
    const poll = setInterval(async () => {
      const { data: allQ } = await sb
        .from('questions')
        .select('*')
        .eq('game_id', gameId)
        .order('question_id', { ascending: true });

      if (allQ && allQ.length > 0) {
        clearInterval(poll);
        if (!matchStartTime) matchStartTime = new Date(allQ[0].created_at).getTime() + 4000;
        questions = allQ.map(q => ({
          id: q.question_id,
          question: q.question_text,
          options: q.options_array,
          correct: q.correct_answer
        }));
        channel.unsubscribe();
        startBattle();
      }
    }, 2000);
  }

  // ── Start Battle ──
  function startBattle() {
    loadingState.style.display = 'none';
    battleUI.style.display = 'block';
    showQuestion();
  }

  // ── Show Question ──
  function showQuestion() {
    if (currentIndex >= questions.length) {
      endGame();
      return;
    }

    answered = false;
    const q = questions[currentIndex];

    // Update UI
    questionCounter.textContent = `Question ${currentIndex + 1} of ${questions.length}`;
    questionText.textContent = q.question;
    progressBar.style.width = `${((currentIndex) / questions.length) * 100}%`;

    // Render options
    const labels = ['A', 'B', 'C', 'D'];
    optionsGrid.innerHTML = q.options.map((opt, i) => `
      <div class="option-card" data-index="${i}" data-answer="${opt}">
        <span class="option-label">${labels[i]}</span>
        <span class="option-text">${opt}</span>
      </div>
    `).join('');

    // Add click listeners
    optionsGrid.querySelectorAll('.option-card').forEach(card => {
      card.addEventListener('click', () => handleAnswer(card, q.correct));
    });

    // Start timer
    startTimer();

    // Animate question card
    const questionCard = document.getElementById('questionCard');
    questionCard.classList.remove('fade-in');
    void questionCard.offsetWidth; // Trigger reflow
    questionCard.classList.add('fade-in');
  }

  // ── Handle Answer ──
  async function handleAnswer(selectedCard, correctAnswer) {
    if (answered) return;
    answered = true;

    // Do NOT clear interval - let the timer finish for both players
    // clearInterval(timerInterval);
    
    // Calculate the time taken to answer in exact milliseconds
    const now = Date.now();
    const timeTakenMs = Math.max(0, now - questionStartTime);

    const selectedAnswer = selectedCard.dataset.answer;
    const isCorrect = selectedAnswer === correctAnswer;

    // Disable all options
    optionsGrid.querySelectorAll('.option-card').forEach(card => {
      card.classList.add('disabled');

      if (card.dataset.answer === correctAnswer) {
        card.classList.add('correct');
      }
    });

    if (isCorrect) {
      selectedCard.classList.add('correct');
      myCorrectCount++;
      // Score based on milliseconds remaining to break ties.
      const points = Math.max(1, (TIME_PER_QUESTION * 1000) - timeTakenMs);
      myScore += points;
      player1Score.textContent = myScore;
      showToast(`+${points} Points! Waiting for timer to end...`, 'success');
    } else {
      selectedCard.classList.add('wrong');
      showToast('Wrong answer! Waiting for timer to end...', 'error');
    }

    // Update score in Supabase
    if (myPlayerId) {
      const sb = getSupabase();
      await sb
        .from('players')
        .update({ score: myScore })
        .eq('player_id', myPlayerId);
    }

    // We do NOT call setTimeout to show next question here.
    // It will be handled entirely by handleTimeout when the timer reaches 0.
  }

  function startTimer() {
    questionStartTime = matchStartTime + currentIndex * ((TIME_PER_QUESTION + DELAY_BETWEEN) * 1000);
    
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      const now = Date.now();
      const elapsedSinceQuestionStart = now - questionStartTime;
      
      const calculatedTimeLeft = Math.ceil((TIME_PER_QUESTION * 1000 - elapsedSinceQuestionStart) / 1000);
      timeLeft = Math.max(0, Math.min(TIME_PER_QUESTION, calculatedTimeLeft));

      timerValue.textContent = timeLeft;

      if (timeLeft <= 5 && timeLeft > 2) {
        timerValue.className = 'timer-value warning';
      } else if (timeLeft <= 2 && timeLeft > 0) {
        timerValue.className = 'timer-value danger';
      } else {
        timerValue.className = 'timer-value';
      }

      if (elapsedSinceQuestionStart >= TIME_PER_QUESTION * 1000) {
        clearInterval(timerInterval);
        handleTimeout();
      }
    }, 100);
  }

  // ── Timeout (Time's Up) ──
  function handleTimeout() {
    if (!answered) {
      answered = true;

      const q = questions[currentIndex];

      optionsGrid.querySelectorAll('.option-card').forEach(card => {
        card.classList.add('disabled');
        if (card.dataset.answer === q.correct) {
          card.classList.add('correct');
        }
      });

      showToast("Time's up!", 'error');
    }

    const now = Date.now();
    const nextQuestionStartTime = matchStartTime + (currentIndex + 1) * ((TIME_PER_QUESTION + DELAY_BETWEEN) * 1000);
    const timeUntilNext = nextQuestionStartTime - now;

    setTimeout(() => {
      currentIndex++;
      showQuestion();
    }, Math.max(0, Math.min(DELAY_BETWEEN * 1000, timeUntilNext)));
  }

  // ── Subscribe to opponent score ──
  function subscribeToScoreUpdates() {
    if (!opponentPlayerId) return;

    const sb = getSupabase();

    sb
      .channel(`scores-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'players',
          filter: `player_id=eq.${opponentPlayerId}`
        },
        (payload) => {
          opponentScore = payload.new.score || 0;
          player2Score.textContent = opponentScore;
        }
      )
      .subscribe();

    // Polling fallback for opponent score
    setInterval(async () => {
      const { data } = await sb
        .from('players')
        .select('score')
        .eq('player_id', opponentPlayerId)
        .single();

      if (data) {
        opponentScore = data.score || 0;
        player2Score.textContent = opponentScore;
      }
    }, 5000);
  }

  // ── End Game ──
  async function endGame() {
    clearInterval(timerInterval);

    // Update progress bar
    progressBar.style.width = '100%';

    // Update game status
    const sb = getSupabase();
    if (isHost) {
      await sb.from('games').update({ status: 'completed' }).eq('game_id', gameId);
    }

    // Store results
    sessionStorage.setItem('quizhub_my_correct', myCorrectCount);
    sessionStorage.setItem('quizhub_my_score', myScore);
    sessionStorage.setItem('quizhub_opp_score', opponentScore);
    sessionStorage.setItem('quizhub_opp_name', opponentNickname);
    sessionStorage.setItem('quizhub_total_questions', questions.length);

    showToast('Battle complete! Loading results...', 'info');

    setTimeout(() => {
      navigateTo('results.html', { game: gameCode });
    }, 1500);
  }
});
