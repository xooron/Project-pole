const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

// База данных в памяти (для реального проекта используй MongoDB)
let db = {
    users: {} 
};

let players = [];
let totalBank = 0;
let gameStatus = 'waiting';
const COLORS = ['#00ff66', '#ff0066', '#00ccff', '#ffcc00', '#9900ff', '#ff6600'];

io.on('connection', (socket) => {
    
    // Вход пользователя
    socket.on('user_joined', (data) => {
        if (!db.users[data.id]) {
            db.users[data.id] = {
                id: data.id,
                name: data.name,
                username: data.username,
                balance: 10.00, // Стартовый баланс
                refBy: data.refBy, // Кто пригласил
                refCount: 0,
                refPending: 0,
                refTotal: 0
            };

            // Если пришел по ссылке, уведомляем реферера
            if (data.refBy && db.users[data.refBy]) {
                db.users[data.refBy].refCount++;
            }
        }
        broadcastData();
    });

    // Ставка
    socket.on('place_bet', (data) => {
        const user = db.users[data.id];
        if (user && user.balance >= data.amount && gameStatus !== 'playing') {
            user.balance -= data.amount;
            
            // --- РЕФЕРАЛЬНАЯ КОМИССИЯ 10% ---
            if (user.refBy && db.users[user.refBy]) {
                let commission = data.amount * 0.10;
                db.users[user.refBy].refPending += commission;
            }

            let p = players.find(x => x.id === data.id);
            if (p) {
                p.amount += data.amount;
            } else {
                players.push({
                    id: user.id,
                    username: user.username,
                    avatar: `https://ui-avatars.com/api/?name=${user.name}&background=00ff66&color=000`,
                    amount: data.amount,
                    color: COLORS[players.length % COLORS.length]
                });
            }
            totalBank = players.reduce((sum, p) => sum + p.amount, 0);
            broadcastData();
            
            if (players.length >= 2 && gameStatus === 'waiting') {
                startGame();
            }
        }
    });

    // Зачисление бонусов
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

function startGame() {
    gameStatus = 'playing';
    io.emit('update_arena', { players, totalBank, status: gameStatus });

    // Эмуляция конца игры через 5 секунд
    setTimeout(() => {
        if (players.length > 0) {
            const winner = players[Math.floor(Math.random() * players.length)];
            db.users[winner.id].balance += totalBank;
            io.emit('start_game_animation', { winner });
        }
        
        setTimeout(() => {
            players = [];
            totalBank = 0;
            gameStatus = 'waiting';
            broadcastData();
        }, 4000);
    }, 5000);
}

function broadcastData() {
    io.emit('update_data', { users: db.users });
    io.emit('update_arena', { players, totalBank, status: gameStatus });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
