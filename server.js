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

const COLORS = ['#00ff66', '#00ccff', '#ff0066', '#ffcc00', '#9900ff'];

io.on('connection', (socket) => {
    socket.on('user_joined', (data) => {
        if (!db.users[data.id]) {
            db.users[data.id] = { 
                id: data.id, 
                name: data.name, 
                username: data.username,
                avatar: data.avatar,
                balance: 100.0, // Тестовый баланс
                refCount: 0, 
                refPending: 0.00,
                refTotal: 0.00
            };
        }
        socket.emit('update_data', { users: db.users });
        io.emit('update_arena', { players, totalBank, status: gameStatus });
    });

    socket.on('place_bet', (data) => {
        const u = db.users[data.id];
        let betAmount = data.amount === 'max' ? u.balance : parseFloat(data.amount);

        if (u && u.balance >= betAmount && betAmount > 0) {
            u.balance -= betAmount;
            
            let p = players.find(x => x.id === data.id);
            if (p) {
                p.amount += betAmount;
            } else {
                players.push({ 
                    id: u.id, 
                    username: u.username, 
                    amount: betAmount, 
                    color: COLORS[players.length % COLORS.length] 
                });
            }

            calculateChances();
            io.emit('update_data', { users: db.users });
            io.emit('update_arena', { players, totalBank, status: gameStatus });
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

server.listen(3000, () => console.log('Server running on port 3000'));
