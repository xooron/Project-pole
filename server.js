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

app.get('/tonconnect-manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.sendFile(path.join(__dirname, 'tonconnect-manifest.json'));
});

let db = { users: {} };
let players = [];
let totalBank = 0;
let gameStatus = 'waiting'; // waiting, countdown, running
let countdownTimer = 15;
let gameLoopInterval = null;

const COLORS = ['#00ff66', '#00ccff', '#ff0066', '#ffcc00', '#aa00ff'];

io.on('connection', (socket) => {
    socket.on('user_joined', (data) => {
        if (!db.users[data.id]) {
            db.users[data.id] = { 
                id: data.id, name: data.name, username: data.username, avatar: data.avatar,
                balance: 100.0, refCount: 0, refPending: 0.00, refTotal: 0.00
            };
        }
        socket.emit('update_data', { users: db.users });
        io.emit('update_arena', { players, totalBank });
        io.emit('game_status', { status: gameStatus, timer: countdownTimer });
    });

    socket.on('place_bet', (data) => {
        if (gameStatus === 'running') return;
        
        const u = db.users[data.id];
        if (!u) return;

        let amount = data.amount === 'max' ? u.balance : parseFloat(data.amount);
        
        if (amount > 0 && u.balance >= amount) {
            u.balance -= amount;
            let p = players.find(x => x.id === data.id);
            if (p) {
                p.amount += amount;
            } else {
                players.push({ 
                    id: u.id, username: u.username, avatar: u.avatar,
                    amount: amount, color: COLORS[players.length % COLORS.length] 
                });
            }
            calculateChances();
            io.emit('update_data', { users: db.users });
            io.emit('update_arena', { players, totalBank });

            // Запуск отсчета, если игроков 2+
            if (players.length >= 2 && gameStatus === 'waiting') {
                startCountdown();
            }
        }
    });

    socket.on('check_winner', (data) => {
        // Логика определения победителя по координате X на сервере (для безопасности)
        // В данном учебном примере просто обнуляем для новой игры через 3 сек
        if (gameStatus === 'running') {
            gameStatus = 'waiting';
            setTimeout(resetGame, 3000);
        }
    });
});

function startCountdown() {
    gameStatus = 'countdown';
    countdownTimer = 15;
    
    const interval = setInterval(() => {
        countdownTimer--;
        io.emit('game_status', { status: 'countdown', timer: countdownTimer });
        
        if (countdownTimer <= 0) {
            clearInterval(interval);
            startGame();
        }
    }, 1000);
}

function startGame() {
    gameStatus = 'running';
    io.emit('game_status', { status: 'running' });
    
    // Генерируем начальные параметры мяча
    const startX = Math.random() * 200 + 50;
    const startY = Math.random() * 200 + 50;
    const vx = (Math.random() > 0.5 ? 1 : -1) * (Math.random() * 3 + 4);
    const vy = (Math.random() > 0.5 ? 1 : -1) * (Math.random() * 3 + 4);

    io.emit('start_ball', { startX, startY, vx, vy });
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
    players.forEach(p => {
        p.chance = (p.amount / totalBank) * 100;
    });
}

server.listen(3000, () => console.log('Server started on port 3000'));
