const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(express.static(__dirname));

let db = { users: {} };
let players = [];
let totalBank = 0;
let gameStatus = 'waiting';
let countdownTimer = 15;

const COLORS = ['#00ff66', '#00ccff', '#ff0066', '#ffcc00', '#aa00ff'];

io.on('connection', (socket) => {
    socket.on('user_joined', (data) => {
        if (!db.users[data.id]) {
            db.users[data.id] = { id: data.id, name: data.name, username: data.username, avatar: data.avatar, balance: 100.0 };
        }
        socket.emit('update_data', { users: db.users });
        io.emit('update_arena', { players, totalBank });
    });

    socket.on('place_bet', (data) => {
        if (gameStatus === 'running') return;
        const u = db.users[data.id];
        let amount = data.amount === 'max' ? u.balance : parseFloat(data.amount);
        
        if (amount > 0 && u.balance >= amount) {
            u.balance -= amount;
            let p = players.find(x => x.id === data.id);
            if (p) p.amount += amount;
            else players.push({ id: u.id, username: u.username, avatar: u.avatar, amount, color: COLORS[players.length % COLORS.length] });
            
            calculateChances();
            io.emit('update_data', { users: db.users });
            io.emit('update_arena', { players, totalBank });

            if (players.length >= 2 && gameStatus === 'waiting') startCountdown();
        }
    });

    socket.on('request_winner', (data) => {
        let curX = 0;
        let winner = players[0];
        for (let p of players) {
            let w = (p.chance / 100) * 300;
            if (data.finalX >= curX && data.finalX <= curX + w) {
                winner = p;
                break;
            }
            curX += w;
        }
        
        const winAmount = totalBank * 0.95; // 5% комиссия
        db.users[winner.id].balance += winAmount;
        
        io.emit('announce_winner', { winner, bank: winAmount });
        io.emit('update_data', { users: db.users });
        
        // Очистка через 3 сек после показа панели
        setTimeout(resetGame, 3000);
    });
});

function startCountdown() {
    gameStatus = 'countdown';
    let timer = 15;
    const interval = setInterval(() => {
        timer--;
        io.emit('game_status', { status: 'countdown', timer });
        if (timer <= 0) {
            clearInterval(interval);
            startGame();
        }
    }, 1000);
}

function startGame() {
    gameStatus = 'running';
    io.emit('game_status', { status: 'running' });
    io.emit('start_game_sequence', {
        startX: Math.random() * 200 + 50,
        startY: Math.random() * 200 + 50,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10
    });
}

function resetGame() {
    players = [];
    totalBank = 0;
    gameStatus = 'waiting';
    io.emit('update_arena', { players, totalBank });
    io.emit('game_status', { status: 'waiting' });
}

function calculateChances() {
    totalBank = players.reduce((s, p) => s + p.amount, 0);
    players.forEach(p => p.chance = (p.amount / totalBank) * 100);
}

server.listen(3000, () => console.log('Server started'));
