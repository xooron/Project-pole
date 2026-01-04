const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

let gameState = {
    players: [],
    totalBank: 0,
    timer: null,
    countdown: 15,
    status: 'waiting' // waiting, counting, playing
};

const COLORS = ['#00ff66', '#ff0066', '#00ccff', '#ffcc00', '#9900ff', '#ff6600', '#00ffff', '#ff00ff'];

io.on('connection', (socket) => {
    socket.emit('init_state', gameState);

    socket.on('place_bet', (data) => {
        if (gameState.status === 'playing') return;

        let player = gameState.players.find(p => p.username === data.username);
        if (player) {
            player.amount += data.amount;
        } else {
            player = {
                id: socket.id,
                name: data.name,
                username: data.username,
                avatar: data.avatar,
                amount: data.amount,
                color: COLORS[gameState.players.length % COLORS.length]
            };
            gameState.players.push(player);
        }

        calculateChances();
        if (gameState.players.length >= 2 && gameState.status === 'waiting') startCountdown();
        io.emit('update_arena', gameState);
    });
});

function calculateChances() {
    gameState.totalBank = gameState.players.reduce((sum, p) => sum + p.amount, 0);
    gameState.players.forEach(p => {
        p.chance = ((p.amount / gameState.totalBank) * 100).toFixed(1);
    });
}

function startCountdown() {
    gameState.status = 'counting';
    gameState.countdown = 15;
    gameState.timer = setInterval(() => {
        gameState.countdown--;
        io.emit('timer_tick', gameState.countdown);
        if (gameState.countdown <= 0) {
            clearInterval(gameState.timer);
            startGame();
        }
    }, 1000);
}

function startGame() {
    gameState.status = 'playing';
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

    io.emit('start_game_animation', { winner });

    setTimeout(() => {
        gameState = { players: [], totalBank: 0, timer: null, countdown: 15, status: 'waiting' };
        io.emit('update_arena', gameState);
    }, 18000); // 2с старт + 3с стрелка + 10с полет + 3с результат
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server started on ${PORT}`));
