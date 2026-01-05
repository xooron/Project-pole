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
let timer = 13;
let timerId = null;

const COLORS = ['#00ff66', '#ff0066', '#00ccff', '#ffcc00', '#9900ff', '#ff6600'];

io.on('connection', (socket) => {
    socket.on('user_joined', (data) => {
        if (!db.users[data.id]) {
            db.users[data.id] = { 
                id: data.id, name: data.name, username: data.username, 
                balance: 50.0, refBy: data.refBy, refCount: 0, refPending: 0, address: null 
            };
            if (data.refBy && db.users[data.refBy]) db.users[data.refBy].refCount++;
        }
        broadcast();
    });

    socket.on('wallet_connected', (data) => {
        if(db.users[data.id]) { db.users[data.id].address = data.address; broadcast(); }
    });

    socket.on('place_bet', (data) => {
        const u = db.users[data.id];
        if (u && u.balance >= data.amount && gameStatus !== 'playing') {
            u.balance -= data.amount;
            if (u.refBy && db.users[u.refBy]) db.users[u.refBy].refPending += data.amount * 0.1;

            let p = players.find(x => x.id === data.id);
            if (p) p.amount += data.amount;
            else players.push({ 
                id: u.id, username: u.username, 
                avatar: `https://ui-avatars.com/api/?name=${u.name}&background=00ff66&color=000`, 
                amount: data.amount, color: COLORS[players.length % COLORS.length] 
            });

            calc();
            broadcast();
            if (players.length >= 2 && gameStatus === 'waiting') startTimer();
        }
    });

    // Когда клиент сообщает, в какой зоне остановился мяч
    socket.on('game_result', (data) => {
        const winner = db.users[data.winnerId];
        if (winner && totalBank > 0) {
            winner.balance += totalBank;
            players = []; totalBank = 0; gameStatus = 'waiting';
            broadcast();
        }
    });
});

function calc() {
    totalBank = players.reduce((s, p) => s + p.amount, 0);
    players.forEach(p => p.chance = ((p.amount / totalBank) * 100).toFixed(1));
}

function startTimer() {
    gameStatus = 'counting';
    timer = 13;
    timerId = setInterval(() => {
        timer--;
        io.emit('timer_tick', timer);
        if (timer <= 0) { clearInterval(timerId); io.emit('start_game_animation'); gameStatus = 'playing'; }
    }, 1000);
}

function broadcast() {
    io.emit('update_data', { users: db.users });
    io.emit('update_arena', { players, totalBank, status: gameStatus });
}

server.listen(3000, () => console.log('Server started on port 3000'));
