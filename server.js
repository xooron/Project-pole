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
let gameStatus = 'waiting'; // waiting, counting, playing
let timer = 13;
let timerId = null;

const COLORS = ['#00ff66', '#ff0066', '#00ccff', '#ffcc00', '#9900ff', '#ff6600'];

io.on('connection', (socket) => {
    socket.on('user_joined', (data) => {
        if (!db.users[data.id]) {
            db.users[data.id] = { id: data.id, name: data.name, username: data.username, balance: 100.0, refBy: data.refBy, refCount: 0, refPending: 0 };
            if (data.refBy && db.users[data.refBy]) db.users[data.refBy].refCount++;
        }
        broadcastData();
    });

    socket.on('place_bet', (data) => {
        const user = db.users[data.id];
        if (user && user.balance >= data.amount && gameStatus !== 'playing') {
            user.balance -= data.amount;
            if (user.refBy && db.users[user.refBy]) db.users[user.refBy].refPending += data.amount * 0.1;

            let p = players.find(x => x.id === data.id);
            if (p) p.amount += data.amount;
            else players.push({ id: user.id, username: user.username, avatar: `https://ui-avatars.com/api/?name=${user.name}&background=00ff66`, amount: data.amount, color: COLORS[players.length % COLORS.length] });

            calculate();
            broadcastData();

            // Таймер запускается только когда 2 и более игрока
            if (players.length >= 2 && gameStatus === 'waiting') {
                startCountdown();
            }
        }
    });

    socket.on('claim_rewards', (data) => {
        const user = db.users[data.id];
        if (user && user.refPending > 0) {
            user.balance += user.refPending;
            user.refPending = 0;
            broadcastData();
        }
    });
});

function calculate() {
    totalBank = players.reduce((s, p) => s + p.amount, 0);
    players.forEach(p => p.chance = ((p.amount / totalBank) * 100).toFixed(1));
}

function startCountdown() {
    gameStatus = 'counting';
    timer = 13;
    timerId = setInterval(() => {
        timer--;
        io.emit('timer_tick', timer);
        if (timer <= 0) {
            clearInterval(timerId);
            startGame();
        }
    }, 1000);
}

function startGame() {
    gameStatus = 'playing';
    const rand = Math.random() * 100;
    let curr = 0, winner = players[0];
    for (const p of players) {
        curr += parseFloat(p.chance);
        if (rand <= curr) { winner = p; break; }
    }

    io.emit('start_game_animation', { winner });

    setTimeout(() => {
        db.users[winner.id].balance += totalBank;
        players = []; totalBank = 0; gameStatus = 'waiting';
        broadcastData();
    }, 15000);
}

function broadcastData() {
    io.emit('update_data', { users: db.users });
    io.emit('update_arena', { players, totalBank, status: gameStatus });
}

server.listen(3000, () => console.log('Server started on 3000'));
