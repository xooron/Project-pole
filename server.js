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

const COLORS = ['#00ff66', '#ff0066', '#00ccff', '#ffcc00', '#9900ff', '#ff6600', '#00ffff'];

io.on('connection', (socket) => {
    
    socket.on('user_joined', (data) => {
        if (!db.users[data.id]) {
            db.users[data.id] = { 
                id: data.id, name: data.name, username: data.username, 
                balance: 100.0, refBy: data.refBy, refCount: 0, refPending: 0, address: null 
            };
            if (data.refBy && db.users[data.refBy]) db.users[data.refBy].refCount++;
        }
        socket.emit('update_data', { users: db.users });
        broadcastArena();
    });

    socket.on('wallet_connected', (data) => {
        if(db.users[data.id]) {
            db.users[data.id].address = data.address;
            io.emit('update_data', { users: db.users });
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
                    id: u.id, username: u.username, 
                    avatar: `https://ui-avatars.com/api/?name=${u.name}&background=00ff66&color=000`, 
                    amount: data.amount, color: COLORS[players.length % COLORS.length] 
                });
            }

            calc();
            io.emit('update_data', { users: db.users });
            broadcastArena();

            if (players.length >= 2 && gameStatus === 'waiting') startTimer();
        }
    });

    socket.on('game_result', (data) => {
        if (gameStatus === 'playing' && data.winnerId) {
            const winner = db.users[data.winnerId];
            if (winner) winner.balance += totalBank;
            
            players = []; totalBank = 0; gameStatus = 'waiting';
            io.emit('update_data', { users: db.users });
            broadcastArena();
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
        if (timer <= 0) { 
            clearInterval(timerId); 
            gameStatus = 'playing';
            io.emit('start_game_animation'); 
        }
    }, 1000);
}

function broadcastArena() {
    io.emit('update_arena', { players, totalBank, status: gameStatus });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server started on port ${PORT}`));
