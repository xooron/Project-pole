const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

// Имитация БД
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
                username: data.username,
                avatar: data.avatar,
                balance: 50.0, // Начальный бонус
                refBy: data.refBy, 
                refCount: 0, 
                refPending: 0, 
                refTotal: 0, 
                address: null 
            };
            // Логика реферала
            if (data.refBy && db.users[data.refBy] && data.refBy != data.id) {
                db.users[data.refBy].refCount++;
            }
        }
        socket.emit('update_data', { users: db.users });
        io.emit('update_arena', { players, totalBank, status: gameStatus });
    });

    socket.on('wallet_connected', (data) => {
        if(db.users[data.id]) {
            db.users[data.id].address = data.address;
            console.log(`User ${data.id} linked wallet: ${data.address}`);
        }
    });

    socket.on('place_bet', (data) => {
        const u = db.users[data.id];
        if (u && u.balance >= data.amount && gameStatus !== 'playing') {
            u.balance -= data.amount;
            
            // 10% рефереру
            if (u.refBy && db.users[u.refBy]) {
                db.users[u.refBy].refPending += data.amount * 0.1;
            }

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
            io.emit('update_arena', { players, totalBank, status: gameStatus });

            if (players.length >= 2 && gameStatus === 'waiting') {
                startTimer();
            }
        }
    });

    socket.on('claim_rewards', (data) => {
        const u = db.users[data.id];
        if (u && u.refPending > 0) {
            u.balance += u.refPending;
            u.refTotal += u.refPending;
            u.refPending = 0;
            socket.emit('update_data', { users: db.users });
        }
    });
});

function calculateChances() {
    totalBank = players.reduce((s, p) => s + p.amount, 0);
    players.forEach(p => p.chance = ((p.amount / totalBank) * 100).toFixed(1));
}

function startTimer() {
    gameStatus = 'counting';
    timer = 15;
    if (timerId) clearInterval(timerId);
    
    timerId = setInterval(() => {
        timer--;
        io.emit('timer_tick', timer);
        if (timer <= 0) {
            clearInterval(timerId);
            gameStatus = 'playing';
            // Тут должна быть анимация мяча (логика на клиенте)
            setTimeout(resetGame, 10000); // Сброс через 10 сек после "игры"
        }
    }, 1000);
}

function resetGame() {
    // В реальном приложении тут выбирается победитель
    players = [];
    totalBank = 0;
    gameStatus = 'waiting';
    io.emit('update_arena', { players, totalBank, status: gameStatus });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
