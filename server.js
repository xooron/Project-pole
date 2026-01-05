const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

let db = { users: {} };
let players = [];
let totalBank = 0;
let gameStatus = 'waiting'; 
let timer = 15;
let timerId = null;

const COLORS = ['#00ff66', '#ff0066', '#00ccff', '#ffcc00', '#9900ff', '#ff6600'];

io.on('connection', (socket) => {
    socket.on('user_joined', (data) => {
        if (!db.users[data.id]) {
            db.users[data.id] = { 
                id: data.id, 
                name: data.name, 
                username: data.username || "user",
                avatar: data.avatar || `https://ui-avatars.com/api/?name=${data.name}&background=00ff66&color=000`,
                balance: 10.0, // Даем 10 TON при первом входе
                refCount: 0, 
                refPending: 0.00,
                refTotal: 0.00,
                address: null 
            };
        }
        socket.emit('update_data', { users: db.users });
        io.emit('update_arena', { players, totalBank, status: gameStatus, timer });
    });

    socket.on('place_bet', (data) => {
        const u = db.users[data.id];
        if (u && u.balance >= 1.0 && gameStatus !== 'playing') {
            u.balance -= 1.0;
            
            let p = players.find(x => x.id === data.id);
            if (p) {
                p.amount += 1.0;
            } else {
                players.push({ 
                    id: u.id, 
                    username: u.username, 
                    avatar: u.avatar, 
                    amount: 1.0, 
                    color: COLORS[players.length % COLORS.length] 
                });
            }

            calculateChances();
            io.emit('update_data', { users: db.users });
            io.emit('update_arena', { players, totalBank, status: gameStatus, timer });

            if (players.length >= 2 && gameStatus === 'waiting') {
                startTimer();
            }
        }
    });
});

function calculateChances() {
    totalBank = players.reduce((s, p) => s + p.amount, 0);
    let currentPos = 0;
    players.forEach(p => {
        p.chance = (p.amount / totalBank) * 100;
        p.startAngle = currentPos;
        currentPos += (p.chance / 100) * 360;
        p.endAngle = currentPos;
    });
}

function startTimer() {
    gameStatus = 'counting';
    timer = 15;
    if (timerId) clearInterval(timerId);
    
    timerId = setInterval(() => {
        timer--;
        if (timer <= 0) {
            clearInterval(timerId);
            startGame();
        } else {
            io.emit('timer_tick', timer);
        }
    }, 1000);
}

function startGame() {
    gameStatus = 'playing';
    const winningAngle = Math.random() * 360; 
    const winner = players.find(p => winningAngle >= p.startAngle && winningAngle < p.endAngle);

    io.emit('start_game_anim', { winningAngle, winner });

    setTimeout(() => {
        finishGame(winner);
    }, 13000); // 2с ожидание + 10с полет + 1с запас
}

function finishGame(winner) {
    if (winner) {
        const u = db.users[winner.id];
        const othersBets = totalBank - winner.amount;
        const commission = othersBets * 0.05; // 5% от ставки других
        const winAmount = totalBank - commission;
        
        u.balance += winAmount;
        io.emit('game_result', { winner, winAmount });
    }
    
    players = [];
    totalBank = 0;
    gameStatus = 'waiting';
    io.emit('update_data', { users: db.users });
    io.emit('update_arena', { players, totalBank, status: gameStatus });
}

server.listen(3000, () => console.log('Server started on port 3000'));
