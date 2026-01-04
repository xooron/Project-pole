const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let gameState = {
    players: [],
    totalBank: 0,
    timer: null,
    countdown: 10,
    isGameRunning: false,
    winner: null
};

const COLORS = ['#00ff66', '#ff0066', '#00ccff', '#ffcc00', '#9900ff', '#ff6600', '#00ffff', '#ff00ff'];

io.on('connection', (socket) => {
    // Отправляем текущее состояние при входе
    socket.emit('update_arena', {
        players: gameState.players,
        totalBank: gameState.totalBank,
        isGameRunning: gameState.isGameRunning
    });

    socket.on('place_bet', (userData) => {
        if (gameState.isGameRunning) return;

        // Проверка по username, чтобы нельзя было ставить дважды (даже после перезагрузки)
        let existingPlayer = gameState.players.find(p => p.username === userData.username);
        if (existingPlayer) return;

        const playerColor = COLORS[gameState.players.length % COLORS.length];
        const player = {
            id: socket.id, // Текущий сокет
            name: userData.name,
            username: userData.username,
            avatar: userData.avatar,
            amount: userData.amount,
            color: playerColor,
            chance: 0
        };
        
        gameState.players.push(player);
        calculateGameState();

        if (gameState.players.length >= 2 && !gameState.timer) {
            startCountdown();
        }

        updateAll();
    });
});

function calculateGameState() {
    gameState.totalBank = gameState.players.reduce((sum, p) => sum + p.amount, 0);
    gameState.players.forEach(p => {
        p.chance = ((p.amount / gameState.totalBank) * 100).toFixed(1);
    });
}

function startCountdown() {
    gameState.countdown = 10;
    gameState.timer = setInterval(() => {
        gameState.countdown--;
        io.emit('timer_tick', gameState.countdown);

        if (gameState.countdown <= 0) {
            clearInterval(gameState.timer);
            gameState.timer = null;
            resolveWinner();
        }
    }, 1000);
}

function resolveWinner() {
    if (gameState.players.length === 0) return;
    gameState.isGameRunning = true;

    const random = Math.random() * 100;
    let currentRange = 0;
    let winner = gameState.players[gameState.players.length - 1];

    for (const p of gameState.players) {
        currentRange += parseFloat(p.chance);
        if (random <= currentRange) {
            winner = p;
            break;
        }
    }

    gameState.winner = winner;
    // Отправляем победителя всем
    io.emit('start_game_animation', { winner: winner });

    // Сброс через 18 секунд (2с ожидание + 3с стрелка + 10с полет + 3с показ ника)
    setTimeout(() => {
        gameState = {
            players: [],
            totalBank: 0,
            timer: null,
            countdown: 10,
            isGameRunning: false,
            winner: null
        };
        updateAll();
    }, 18000);
}

function updateAll() {
    io.emit('update_arena', {
        players: gameState.players,
        totalBank: gameState.totalBank,
        isGameRunning: gameState.isGameRunning
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server started on port ${PORT}`));
