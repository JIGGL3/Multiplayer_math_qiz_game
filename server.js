const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

// Game state management
const gameState = {
  players: {},
  questions: [],
  currentChampionQuestion: null,
  championPlayers: new Set(),
  leaderboards: {
    Champion: {},
    "Rapid Fire": {},
    "Fast Finisher": {}
  }
};

// Load questions
fs.readFile(path.join(__dirname, 'public/questions.json'), 'utf8', (err, data) => {
  if (err) {
    console.error("Error loading questions:", err);
    return;
  }
  gameState.questions = JSON.parse(data);
  console.log(`✅ Loaded ${gameState.questions.length} questions.`);
});

function getRandomQuestion() {
  return gameState.questions[Math.floor(Math.random() * gameState.questions.length)];
}

function syncChampionQuestion() {
  gameState.currentChampionQuestion = getRandomQuestion();
  gameState.championPlayers.forEach(socketId => {
    if (gameState.players[socketId]) {
      gameState.players[socketId].currentQuestion = gameState.currentChampionQuestion;
      io.to(socketId).emit("newQuestion", {
        question: gameState.currentChampionQuestion.question,
        options: gameState.currentChampionQuestion.options,
        answer: gameState.currentChampionQuestion.answer,
        mode: "Champion"
      });
    }
  });
}

function updateLeaderboard(mode, playerId, playerData) {
  gameState.leaderboards[mode][playerId] = playerData;
  io.emit("updateLeaderboard", gameState.leaderboards);
}

function cleanupPlayer(socketId) {
  if (gameState.players[socketId]?.modeInfo.mode === 'Champion') {
    gameState.championPlayers.delete(socketId);
  }
  const mode = gameState.players[socketId]?.modeInfo.mode;
  if (mode) {
    delete gameState.leaderboards[mode][socketId];
    io.emit('updateLeaderboard', gameState.leaderboards);
  }
  delete gameState.players[socketId];
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('selectMode', (data) => {
    gameState.players[socket.id] = {
      name: data.name,
      score: 0,
      currentQuestion: null,
      modeInfo: {
        mode: data.mode,
        totalTime: data.time || null,
        totalQuestions: data.numQuestions || null,
        startTime: Date.now(),
        questionsAnswered: 0
      }
    };

    const player = gameState.players[socket.id];
    
    // Initialize leaderboard and send initial score
    updateLeaderboard(player.modeInfo.mode, socket.id, {
      name: player.name,
      score: player.score
    });
    socket.emit('updateScore', player.score);

    if (player.modeInfo.mode === 'Champion') {
      gameState.championPlayers.add(socket.id);
      if (gameState.championPlayers.size === 1) {
        syncChampionQuestion();
      } else if (gameState.currentChampionQuestion) {
        player.currentQuestion = gameState.currentChampionQuestion;
        socket.emit('newQuestion', {
          question: gameState.currentChampionQuestion.question,
          options: gameState.currentChampionQuestion.options,
          answer: gameState.currentChampionQuestion.answer,
          mode: "Champion"
        });
      }
    } else {
      // For non-Champion modes
      const question = getRandomQuestion();
      player.currentQuestion = question;
      socket.emit('newQuestion', {
        question: question.question,
        options: question.options,
        answer: question.answer,
        mode: player.modeInfo.mode
      });

      if (player.modeInfo.mode === 'Rapid Fire') {
        setTimeout(() => {
          socket.emit('endRapidFire', { finalScore: player.score });
          cleanupPlayer(socket.id);
        }, player.modeInfo.totalTime * 1000);
      }
    }
  });

  socket.on('submitAnswer', (answer) => {
    const player = gameState.players[socket.id];
    if (!player || !player.currentQuestion) return;

    const correct = answer === player.currentQuestion.answer;
    
    // Update score
    player.score = correct ? player.score + 10 : Math.max(0, player.score - 5);
    player.modeInfo.questionsAnswered++;

    // Send updates
    socket.emit('updateScore', player.score);
    updateLeaderboard(player.modeInfo.mode, socket.id, {
      name: player.name,
      score: player.score
    });

    socket.emit('answerResult', {
      correct,
      correctAnswer: player.currentQuestion.answer,
      selectedAnswer: answer
    });

    // Handle next question or game end
    if (player.modeInfo.mode === 'Champion') {
      setTimeout(syncChampionQuestion, 1500);
    } else if (player.modeInfo.mode === 'Fast Finisher') {
      if (player.modeInfo.questionsAnswered >= player.modeInfo.totalQuestions) {
        const timeTaken = Math.floor((Date.now() - player.modeInfo.startTime) / 1000);
        socket.emit('finishFastFinisher', {
          timeTaken,
          finalScore: player.score,
          totalQuestions: player.modeInfo.totalQuestions
        });
        cleanupPlayer(socket.id);
      } else {
        setTimeout(() => {
          const question = getRandomQuestion();
          player.currentQuestion = question;
          socket.emit('newQuestion', {
            question: question.question,
            options: question.options,
            answer: question.answer,
            mode: "Fast Finisher"
          });
        }, 1500);
      }
    } else { // Rapid Fire
      setTimeout(() => {
        const question = getRandomQuestion();
        player.currentQuestion = question;
        socket.emit('newQuestion', {
          question: question.question,
          options: question.options,
          answer: question.answer,
          mode: "Rapid Fire"
        });
      }, 1500);
    }
  });

  socket.on('disconnect', () => {
    cleanupPlayer(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});