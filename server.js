const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

// Эмуляция Базы Данных
let db = {
    users: {} 
};

let players = [];
let totalBank = 0;
let gameStatus = 'waiting';
const COLORS = ['#00ff66', '#ff0066', '#00ccff', '#ffcc00', '#9900ff'];

io.on('connection', (socket) => {
    
    socket.on('user_joined', (data) => {
        if (!db.users[data.id]) {
            db.users[data.id] = {
                id: data.id,
                name: data.name,
                username: data.username,
                balance: 10.00,
                refBy: data.refBy, // ID того, кто пригласил
                refCount: 0,
                refPending: 0,
                refTotal: 0
            };

            // Если есть реферер, увеличиваем ему счетчик
            if (data.refBy && db.users[data.refBy]) {
                db.users[data.refBy].refCount++;
            }
        }
        broadcastData();
    });

    socket.on('place_bet', (data) => {
        const user = db.users[data.id];
        if (user && user.balance >= data.amount && gameStatus !== 'playing') {
            user.balance -= data.amount;
            
            // ЛОГИКА КОМИССИИ: 10% от ставки идет рефереру (как в твоем ТЗ)
            if (user.refBy && db.users[user.refBy]) {
                let commission = data.amount * 0.10;
                db.users[user.refBy].refPending += commission;
            }

            let p = players.find(x => x.id === data.id);
            if (p) { p.amount += data.amount; } 
            else {
                players.push({
                    id: user.id,
                    username: user.username,
                    avatar: `https://ui-avatars.com/api/?name=${user.name}&background=00ff66`,
                    amount: data.amount,
                    color: COLORS[players.length % COLORS.length]
                });
            }
            calculateChances();
            broadcastData();
            if (players.length >= 2 && gameStatus === 'waiting') startGameTimer();
        }
    });

    socket.on('claim_rewards', (data) => {
        const user = db.users[data.id];
        if (user && user.refPending > 0) {
            user.balance += user.refPending;
            user.refTotal += user.refPending;
            user.refPending = 0;
            broadcastData();
        }
    });
});

function calculateChances() {
    totalBank = players.reduce((sum, p) => sum + p.amount, 0);
    players.forEach(p => p.chance = ((p.amount / totalBank) * 100).toFixed(1));
}

function startGameTimer() {
    gameStatus = 'playing';
    // Простая логика выбора победителя
    setTimeout(() => {
        const winner = players[Math.floor(Math.random() * players.length)];
        if (winner) {
            db.users[winner.id].balance += totalBank;
        }
        io.emit('start_game_animation', { winner });
        
        setTimeout(() => {
            players = [];
            totalBank = 0;
            gameStatus = 'waiting';
            broadcastData();
        }, 5000);
    }, 3000);
}

function broadcastData() {
    io.emit('update_data', { users: db.users });
    io.emit('update_arena', { players, totalBank, status: gameStatus });
}

server.listen(3000, () => console.log('Server running on port 3000'));
