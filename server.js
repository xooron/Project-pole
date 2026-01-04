const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

let players = [];
let totalBank = 0;
let gameStatus = 'waiting'; 
let countdown = 15;
let serverTimer = null; 

const COLORS = ['#00ff66', '#ff0066', '#00ccff', '#ffcc00', '#9900ff', '#ff6600', '#00ffff', '#ff00ff'];

io.on('connection', (socket) => {
    socket.emit('update_arena', { players, totalBank, status: gameStatus, countdown });

    socket.on('place_bet', (data) => {
        if (gameStatus === 'playing') return;

        let player = players.find(p => p.username === data.username);
        if (player) {
            player.amount += data.amount;
        } else {
            const playerColor = COLORS[players.length % COLORS.length];
            player = {
                id: socket.id,
                name: data.name,
                username: data.username,
                avatar: data.avatar,
                amount: data.amount,
                color: playerColor,
                chance: 0
            };
            players.push(player);
        }

        calculateChances();
        if (players.length >= 2 && gameStatus === 'waiting') startCountdown();
        broadcastState();
    });
});

function calculateChances() {
    totalBank = players.reduce((sum, p) => sum + p.amount, 0);
    players.forEach(p => {
        p.chance = ((p.amount / totalBank) * 100).toFixed(1);
    });
}

function startCountdown() {
    gameStatus = 'counting';
    countdown = 15;
    if (serverTimer) clearInterval(serverTimer);
    serverTimer = setInterval(() => {
        countdown--;
        io.emit('timer_tick', countdown);
        if (countdown <= 0) {
            clearInterval(serverTimer);
            serverTimer = null;
            startGame();
        }
    }, 1000);
}

function startGame() {
    gameStatus = 'playing';
    const random = Math.random() * 100;
    let currentRange = 0;
    let winner = players[0];

    for (const p of players) {
        currentRange += parseFloat(p.chance);
        if (random <= currentRange) {
            winner = p;
            break;
        }
    }

    io.emit('start_game_animation', { winner });

    setTimeout(() => {
        players = [];
        totalBank = 0;
        gameStatus = 'waiting';
        countdown = 15;
        broadcastState();
    }, 18000);
}

function broadcastState() {
    io.emit('update_arena', { players, totalBank, status: gameStatus, countdown });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server started on ${PORT}`));
