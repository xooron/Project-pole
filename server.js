const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Раздаем статические файлы (index.html)
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

const COLORS = ['#00ff66', '#ff0066', '#00ccff', '#ffcc00', '#9900ff', '#ff6600', '#00ffff', '#ff00ff'];

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Обработка ставки
    socket.on('place_bet', (userData) => {
        if (gameState.isGameRunning) return;

        // Находим, есть ли уже этот игрок
        let player = gameState.players.find(p => p.id === socket.id);
        
        if (!player) {
            const playerColor = COLORS[gameState.players.length % COLORS.length];
            player = {
                id: socket.id,
                name: userData.name,
                username: userData.username,
                avatar: userData.avatar,
                amount: 0,
                color: playerColor,
                chance: 0
            };
            gameState.players.push(player);
        }

        // Увеличиваем ставку
        player.amount += userData.amount;
        calculateGameState();

        // Если игроков 2 или больше и таймер еще не идет — запускаем
        if (gameState.players.length >= 2 && !gameState.timer) {
            startCountdown();
        }

        updateAll();
    });

    socket.on('disconnect', () => {
        // Игроки остаются в списке до конца раунда, чтобы не ломать логику банка
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

    io.emit('game_result', winner);

    // Сброс через 5 секунд после объявления победителя
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
        totalBank: gameState.totalBank,
        hasStarted: gameState.timer !== null
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server started on port ${PORT}`));
