const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" } 
});

// ЭТО ИСПРАВЛЯЕТ ОШИБКУ "Cannot GET /"
// Сервер теперь понимает, что нужно отправить index.html пользователю
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let gameState = {
    players: [],
    totalBank: 0,
    timer: null,
    countdown: 10,
    isGameRunning: false
};

const COLORS = ['#00ff66', '#ff0066', '#00ccff', '#ffcc00', '#9900ff', '#ff6600'];

io.on('connection', (socket) => {
    console.log('Новое подключение:', socket.id);

    socket.on('place_bet', (userData) => {
        if (gameState.isGameRunning) return;

        // Проверяем, не сделал ли игрок ставку уже (чтобы не дублировать)
        if (gameState.players.find(p => p.id === socket.id)) return;

        const playerColor = COLORS[gameState.players.length % COLORS.length];
        const newPlayer = {
            id: socket.id,
            name: userData.name,
            username: userData.username,
            avatar: userData.avatar,
            amount: userData.amount,
            color: playerColor,
            chance: 0
        };

        gameState.players.push(newPlayer);
        calculateGameState();

        // Начинаем таймер, если зашло 2 и более игрока
        if (gameState.players.length >= 2 && !gameState.timer) {
            startCountdown();
        }

        updateAll();
    });

    socket.on('disconnect', () => {
        // Опционально: удаление игрока при выходе, но для ставок лучше оставить до конца игры
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
    let winner = gameState.players[0];

    for (const p of gameState.players) {
        currentRange += parseFloat(p.chance);
        if (random <= currentRange) {
            winner = p;
            break;
        }
    }

    io.emit('game_result', winner);

    setTimeout(() => {
        gameState = {
            players: [],
            totalBank: 0,
            timer: null,
            countdown: 10,
            isGameRunning: false
        };
        updateAll();
    }, 5000);
}

function updateAll() {
    io.emit('update_arena', {
        players: gameState.players,
        totalBank: gameState.totalBank
    });
}

// На Render порт выдается автоматически через process.env.PORT
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
