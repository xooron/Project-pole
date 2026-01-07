const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(express.static(__dirname));

let db = { users: {} };
let players = [];
let totalBank = 0;
let gameStatus = 'waiting';
let gameHistory = []; // Хранение истории

const COLORS = ['#0098ea', '#f48208', '#00ff66', '#ff3b30', '#af52de', '#ffcc00'];

io.on('connection', (socket) => {
    // Рассылка текущего онлайна при подключении/отключении
    io.emit('online_update', io.engine.clientsCount);
    
    socket.on('user_joined', (data) => {
        if (!db.users[data.id]) {
            db.users[data.id] = { 
                id: data.id, name: data.name, username: data.username, avatar: data.avatar, 
                balance: 0.0, 
                refCount: 0, refPending: 0.0, refTotal: 0.0, referredBy: data.refBy 
            };
            if (data.refBy && db.users[data.refBy]) db.users[data.refBy].refCount++;
        }
        io.emit('update_data', db.users);
        socket.emit('update_arena', { players, totalBank });
        socket.emit('history_update', gameHistory);
    });

    socket.on('place_bet', (data) => {
        if (gameStatus !== 'waiting' && gameStatus !== 'countdown') return;
        const u = db.users[data.id];
        let amount = data.amount === 'max' ? (u ? u.balance : 0) : parseFloat(data.amount);
        if (!u || u.balance < amount || amount <= 0) return;

        u.balance -= amount;
        let p = players.find(x => x.id === data.id);
        if (p) p.amount += amount;
        else players.push({ id: u.id, username: u.username, avatar: u.avatar, amount, color: COLORS[players.length % COLORS.length] });
        
        updateChances();
        io.emit('update_data', db.users);
        io.emit('update_arena', { players, totalBank });
        if (players.length >= 2 && gameStatus === 'waiting') startCountdown();
    });

    socket.on('request_winner', (data) => {
        if (gameStatus !== 'running') return;
        gameStatus = 'calculating';
        const winner = players.find(p => p.id === data.winnerId) || players[0];
        const winAmount = totalBank * 0.95;
        const multiplier = (winAmount / winner.amount).toFixed(1);

        if (db.users[winner.id]) {
            db.users[winner.id].balance += winAmount;
            
            // Сохраняем в историю
            const historyEntry = {
                username: winner.username,
                avatar: winner.avatar,
                bank: winAmount,
                bet: winner.amount,
                chance: winner.chance,
                x: multiplier
            };
            gameHistory.push(historyEntry);
            if(gameHistory.length > 15) gameHistory.shift();

            players.forEach(p => {
                const betUser = db.users[p.id];
                if (betUser && betUser.referredBy && db.users[betUser.referredBy]) {
                    db.users[betUser.referredBy].refPending += (p.amount * 0.05) * 0.1;
                }
            });
        }

        io.emit('announce_winner', { winner, bank: winAmount, winnerBet: winner.amount });
        io.emit('update_data', db.users);
        io.emit('history_update', gameHistory);
        setTimeout(resetGame, 4000);
    });

    socket.on('disconnect', () => {
        io.emit('online_update', io.engine.clientsCount);
    });

    // Остальные обработчики без изменений...
    socket.on('deposit_ton', (data) => {
        const u = db.users[data.id];
        if (u && data.amount >= 0.1) { u.balance += parseFloat(data.amount); io.emit('update_data', db.users); }
    });

    socket.on('withdraw_ton', (data) => {
        const u = db.users[data.id];
        const amt = parseFloat(data.amount);
        if (u && amt >= 1 && u.balance >= amt) {
            u.balance -= amt;
            io.emit('update_data', db.users);
            socket.emit('withdraw_response', { success: true, message: "Заявка на вывод принята!" });
        }
    });

    socket.on('claim_ref', (data) => {
        const u = db.users[data.id];
        if (u && u.refPending > 0) { u.balance += u.refPending; u.refTotal += u.refPending; u.refPending = 0; io.emit('update_data', db.users); }
    });
});

function updateChances() { totalBank = players.reduce((s, p) => s + p.amount, 0); players.forEach(p => p.chance = (p.amount / totalBank) * 100); }
function startCountdown() { gameStatus = 'countdown'; let t = 15; const i = setInterval(() => { t--; io.emit('game_status', { status: 'countdown', timer: t }); if (t <= 0) { clearInterval(i); startGame(); } }, 1000); }
function startGame() { gameStatus = 'running'; const angle = Math.random()*Math.PI*2; io.emit('start_game_sequence', { vx: Math.cos(angle)*12, vy: Math.sin(angle)*12 }); }
function resetGame() { players = []; totalBank = 0; gameStatus = 'waiting'; io.emit('update_arena', { players, totalBank }); io.emit('game_status', { status: 'waiting' }); }

server.listen(3000, () => console.log('Server running on port 3000'));
