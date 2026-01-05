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

const COLORS = ['#00ff66', '#00ccff', '#ff0066', '#ffcc00', '#aa00ff'];

io.on('connection', (socket) => {
    socket.on('user_joined', (data) => {
        if (!db.users[data.id]) {
            db.users[data.id] = { 
                id: data.id, name: data.name, username: data.username, avatar: data.avatar, 
                balance: 100.0, refCount: 0, refPending: 0.00, refTotal: 0.00, referredBy: data.refBy 
            };
            if (data.refBy && db.users[data.refBy]) {
                db.users[data.refBy].refCount++;
            }
        }
        socket.emit('update_data', db.users);
        io.emit('update_arena', { players, totalBank });
    });

    socket.on('place_bet', (data) => {
        if (gameStatus !== 'waiting' && gameStatus !== 'countdown') return;
        const u = db.users[data.id];
        if (!u) return;
        let amount = data.amount === 'max' ? u.balance : parseFloat(data.amount);
        
        if (amount > 0 && u.balance >= amount) {
            u.balance -= amount;
            let p = players.find(x => x.id === data.id);
            if (p) p.amount += amount;
            else players.push({ id: u.id, username: u.username, avatar: u.avatar, amount, color: COLORS[players.length % COLORS.length] });
            
            calculateChances();
            io.emit('update_data', db.users);
            io.emit('update_arena', { players, totalBank });
            if (players.length >= 2 && gameStatus === 'waiting') startCountdown();
        }
    });

    socket.on('claim_ref', (data) => {
        const u = db.users[data.id];
        if (u && u.refPending > 0) {
            u.balance += u.refPending;
            u.refTotal += u.refPending;
            u.refPending = 0;
            io.emit('update_data', db.users);
        }
    });

    socket.on('request_winner', (data) => {
        if (gameStatus !== 'running') return;
        gameStatus = 'calculating';
        
        let curX = 0;
        let winner = players[0];
        for (let p of players) {
            let w = (p.chance / 100) * 300;
            if (data.finalX >= curX && data.finalX <= curX + w) { winner = p; break; }
            curX += w;
        }
        
        const fee = totalBank * 0.05;
        const winAmount = totalBank - fee;
        const winnerBet = winner.amount;
        db.users[winner.id].balance += winAmount;

        players.forEach(p => {
            const user = db.users[p.id];
            if (user.referredBy && db.users[user.referredBy]) {
                const refBonus = (p.amount * 0.05) * 0.10; 
                db.users[user.referredBy].refPending += refBonus;
            }
        });
        
        io.emit('announce_winner', { winner, bank: winAmount, winnerBet });
        io.emit('update_data', db.users);
        setTimeout(resetGame, 3000); // 3 секунды на показ победителя и очистка
    });
});

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
    io.emit('game_status', { status: 'running' });
    io.emit('start_game_sequence', {
        startX: Math.random() * 200 + 50, 
        startY: Math.random() * 200 + 50
    });
}

function resetGame() {
    players = []; totalBank = 0; gameStatus = 'waiting';
    io.emit('update_arena', { players, totalBank });
    io.emit('game_status', { status: 'waiting' });
}

function calculateChances() {
    totalBank = players.reduce((s, p) => s + p.amount, 0);
    players.forEach(p => p.chance = (p.amount / totalBank) * 100);
}

server.listen(3000, () => console.log('Arena Server Started'));
