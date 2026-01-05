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
                name: data.name || "Игрок", 
                username: data.username || "user",
                avatar: data.avatar || `https://ui-avatars.com/api/?name=${data.name}&background=00ff66&color=000`,
                balance: 10.0, // Даем 10 ТОН при первом входе
                refCount: 0, 
                address: null 
            };
        }
        socket.emit('update_data', { users: db.users });
        io.emit('update_arena', { players, totalBank, status: gameStatus, timer });
    });

    socket.on('place_bet', (data) => {
        const u = db.users[data.id];
        if (u && u.balance >= data.amount && gameStatus !== 'playing') {
            u.balance -= data.amount;
            
            let p = players.find(x => x.id === data.id);
            if (p) {
                p.amount += data.amount;
            } else {
                players.push({ 
                    id: u.id, 
                    username: u.username, 
                    avatar: u.avatar, 
                    amount: data.amount, 
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
    const winningRandomAngle = Math.random() * 360; 
    const winner = players.find(p => winningRandomAngle >= p.startAngle && winningRandomAngle < p.endAngle);

    io.emit('start_game_anim', { winningAngle: winningRandomAngle, winner });

    setTimeout(() => {
        finishGame(winner);
    }, 13000); // 2с стрелка + 10с полет + запас
}

function finishGame(winner) {
    if (winner) {
        const u = db.users[winner.id];
        const profit = totalBank - winner.amount; // Чистая прибыль (деньги других игроков)
        const commission = profit * 0.05; // 5% от прибыли
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
