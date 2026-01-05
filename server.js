const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors()); app.use(express.static(__dirname));

let db = { users: {} };
let players = [];
let totalBank = 0;
let gameStatus = 'waiting';
let currentSeed = 123;

const COLORS = ['#00ff66', '#00ccff', '#ff0066', '#ffcc00', '#aa00ff'];

io.on('connection', (socket) => {
    socket.on('user_joined', (data) => {
        if (!db.users[data.id]) {
            db.users[data.id] = { id: data.id, name: data.name, username: data.username, avatar: data.avatar, balance: 100.0, refPending: 0.0, refTotal: 0.0, referredBy: data.refBy };
        }
        io.emit('update_data', db.users);
        socket.emit('update_arena', { players, totalBank, seed: currentSeed });
    });

    socket.on('place_bet', (data) => {
        if (gameStatus !== 'waiting' && gameStatus !== 'countdown') return;
        const u = db.users[data.id];
        if (!u || u.balance < (data.amount === 'max' ? u.balance : data.amount)) return;
        let amt = data.amount === 'max' ? u.balance : parseFloat(data.amount);
        u.balance -= amt;
        let p = players.find(x => x.id === data.id);
        if (p) p.amount += amt;
        else players.push({ id: u.id, username: u.username, avatar: u.avatar, amount: amt, color: COLORS[players.length % COLORS.length] });
        
        totalBank = players.reduce((s, p) => s + p.amount, 0);
        players.forEach(p => p.chance = (p.amount / totalBank) * 100);
        io.emit('update_data', db.users);
        io.emit('update_arena', { players, totalBank, seed: currentSeed });
        if (players.length >= 2 && gameStatus === 'waiting') startCountdown();
    });

    socket.on('request_winner', (data) => {
        if (gameStatus !== 'running') return;
        gameStatus = 'calculating';
        const winnerId = getOwnerAt(data.x, data.y);
        const winner = players.find(p => p.id === winnerId) || players[0];
        const winAmt = totalBank * 0.95;
        db.users[winner.id].balance += winAmt;
        io.emit('announce_winner', { winner, bank: winAmt, winnerBet: winner.amount });
        io.emit('update_data', db.users);
        setTimeout(resetGame, 4000);
    });
});

function getOwnerAt(x, y) {
    const gx = Math.floor(x / 20), gy = Math.floor(y / 20);
    const size = 15; const total = 225;
    let pool = [];
    players.forEach(p => {
        let count = Math.floor((p.chance / 100) * total);
        for(let i=0; i<count; i++) pool.push(p.id);
    });
    while(pool.length < total) pool.push(players[0].id);
    let s = currentSeed;
    function rnd() { s = (s * 9301 + 49297) % 233280; return s / 233280; }
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool[Math.min(gy * 15 + gx, 224)];
}

function startCountdown() {
    gameStatus = 'countdown'; let timer = 10;
    const inv = setInterval(() => {
        timer--; io.emit('game_status', { status: 'countdown', timer });
        if (timer <= 0) { clearInterval(inv); startGame(); }
    }, 1000);
}

function startGame() {
    gameStatus = 'running';
    const ang = Math.random() * Math.PI * 2;
    io.emit('start_game_sequence', { 
        startX: Math.random() * 100 + 100, startY: Math.random() * 100 + 100,
        vx: Math.cos(ang) * 10.5, vy: Math.sin(ang) * 10.5 
    });
}

function resetGame() {
    players = []; totalBank = 0; gameStatus = 'waiting'; currentSeed = Math.floor(Math.random() * 1000);
    io.emit('update_arena', { players, totalBank, seed: currentSeed });
    io.emit('game_status', { status: 'waiting' });
}

server.listen(3000);
