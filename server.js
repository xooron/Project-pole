const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
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
let currentSeed = Math.random();

const COLORS = ['#00ff66', '#ff00ff', '#8b00ff', '#00ffff', '#ffcc00'];

io.on('connection', (socket) => {
    socket.on('user_joined', (data) => {
        if (!db.users[data.id]) {
            db.users[data.id] = { 
                id: data.id, name: data.name, username: data.username, avatar: data.avatar, 
                balance: 100.0, refCount: 0, refPending: 0.0, refTotal: 0.0, referredBy: data.refBy 
            };
            if (data.refBy && db.users[data.refBy]) db.users[data.refBy].refCount++;
        }
        io.emit('update_data', db.users);
        socket.emit('update_arena', { players, totalBank, seed: currentSeed });
    });

    socket.on('place_bet', (data) => {
        if (gameStatus !== 'waiting' && gameStatus !== 'countdown') return;
        const u = db.users[data.id];
        let amount = data.amount === 'max' ? u.balance : parseFloat(data.amount);
        if (!u || u.balance < amount || amount <= 0) return;

        u.balance -= amount;
        let p = players.find(x => x.id === data.id);
        if (p) p.amount += amount;
        else players.push({ id: u.id, username: u.username, avatar: u.avatar, amount, color: COLORS[players.length % COLORS.length] });
        
        updateChances();
        io.emit('update_data', db.users);
        io.emit('update_arena', { players, totalBank, seed: currentSeed });
        if (players.length >= 2 && gameStatus === 'waiting') startCountdown();
    });

    socket.on('request_winner', (data) => {
        if (gameStatus !== 'running') return;
        gameStatus = 'calculating';
        // Победитель определяется по координатам остановки мяча (на чьей территории встал)
        io.emit('announce_winner', { 
            winner: data.winner, 
            bank: totalBank * 0.95, 
            winnerBet: data.winnerBet 
        });
        db.users[data.winner.id].balance += totalBank * 0.95;
        io.emit('update_data', db.users);
        setTimeout(resetGame, 4000);
    });
});

function updateChances() {
    totalBank = players.reduce((s, p) => s + p.amount, 0);
    players.forEach(p => p.chance = (p.amount / totalBank) * 100);
    // Сортируем: самый богатый в начало (для центра)
    players.sort((a, b) => b.amount - a.amount);
}

function startCountdown() {
    gameStatus = 'countdown';
    let timer = 10;
    const interval = setInterval(() => {
        timer--;
        io.emit('game_status', { status: 'countdown', timer });
        if (timer <= 0) { clearInterval(interval); startGame(); }
    }, 1000);
}

function startGame() {
    gameStatus = 'running';
    const angle = Math.random() * Math.PI * 2;
    io.emit('start_game_sequence', {
        startX: 150, startY: 150,
        vx: Math.cos(angle) * 12, vy: Math.sin(angle) * 12
    });
}

function resetGame() {
    players = []; totalBank = 0; gameStatus = 'waiting';
    currentSeed = Math.random();
    io.emit('update_arena', { players, totalBank, seed: currentSeed });
    io.emit('game_status', { status: 'waiting' });
}

server.listen(3000);
