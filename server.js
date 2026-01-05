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

const COLORS = ['#00ff66', '#ff00ff', '#8b00ff', '#00ffff', '#ffcc00', '#ff4500', '#adff2f'];

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
        socket.emit('update_arena', { players, totalBank });
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
        io.emit('update_arena', { players, totalBank });
        if (players.length >= 2 && gameStatus === 'waiting') startCountdown();
    });

    // Новая логика пополнения
    socket.on('deposit_ton', (data) => {
        const u = db.users[data.id];
        const amt = parseFloat(data.amount);
        if (u && amt >= 1) {
            u.balance += amt;
            io.emit('update_data', db.users);
        }
    });

    socket.on('request_winner', (data) => {
        if (gameStatus !== 'running') return;
        gameStatus = 'calculating';
        
        const winner = players.find(p => p.id === data.winnerId) || players[0];
        const winAmount = totalBank * 0.95;
        db.users[winner.id].balance += winAmount;

        players.forEach(p => {
            const user = db.users[p.id];
            if (user.referredBy && db.users[user.referredBy]) {
                db.users[user.referredBy].refPending += (p.amount * 0.05) * 0.1;
            }
        });

        io.emit('announce_winner', { winner, bank: winAmount, winnerBet: winner.amount });
        io.emit('update_data', db.users);
        setTimeout(resetGame, 4000);
    });

    socket.on('claim_ref', (data) => {
        const u = db.users[data.id];
        if (u && u.refPending > 0) {
            u.balance += u.refPending; u.refTotal += u.refPending; u.refPending = 0;
            io.emit('update_data', db.users);
        }
    });
});

function updateChances() {
    totalBank = players.reduce((s, p) => s + p.amount, 0);
    players.forEach(p => p.chance = (p.amount / totalBank) * 100);
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
        vx: Math.cos(angle) * 15, vy: Math.sin(angle) * 15
    });
}

function resetGame() {
    players = []; totalBank = 0; gameStatus = 'waiting';
    io.emit('update_arena', { players, totalBank });
    io.emit('game_status', { status: 'waiting' });
}

server.listen(3000);
