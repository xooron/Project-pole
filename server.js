const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors'); // Обязательно: npm install cors

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Настройка CORS для TonConnect
app.use(cors());

// Раздача статики
app.use(express.static(__dirname));

// Принудительно отдаем манифест как JSON
app.get('/tonconnect-manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.sendFile(path.join(__dirname, 'tonconnect-manifest.json'));
});

let db = { users: {} };
let players = [];
let totalBank = 0;
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
    });

    socket.on('place_bet', (data) => {
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
                    id: u.id, username: u.username, amount: amount, 
                    color: COLORS[players.length % COLORS.length] 
                });
            }
            calculateChances();
            io.emit('update_data', { users: db.users });
            io.emit('update_arena', { players, totalBank });
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

server.listen(3000, () => console.log('Server started on port 3000 (with CORS)'));
