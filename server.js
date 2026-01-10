const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Telegraf, Markup } = require('telegraf');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const bot = new Telegraf('8464295922:AAHm4zu0SUOnGQsdtZPKt57kNgKdaBjKCd8');
const ADMIN_CHAT_ID = '7603470949';

app.use(cors());
app.use(express.static(__dirname));

app.get('/', (req, res) => res.send('Бот и Сервер работают 24/7'));

let db = { users: {} };
let players = [];
let totalBank = 0;
let gameStatus = 'waiting';
let gameHistory = [];
const COLORS = ['#0098ea', '#f48208', '#00ff66', '#ff3b30', '#af52de', '#ffcc00', '#00d2ff', '#3a7bd5'];

io.on('connection', (socket) => {
    io.emit('online_update', io.engine.clientsCount);

    socket.on('user_joined', (data) => {
        if (!db.users[data.id]) {
            db.users[data.id] = { 
                id: data.id, name: data.name, username: data.username, avatar: data.avatar, 
                balance: 100.0, refCount: 0, refPending: 0.0, refTotal: 0.0, referredBy: data.refBy 
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

    // Плинко обработка
    socket.on('plinko_bet', (data) => {
        const u = db.users[data.id];
        const amt = parseFloat(data.amount);
        if (!u || u.balance < amt) return;

        u.balance -= amt;
        // Расчет выигрыша (Плинко 16 рядов/слоты)
        const multis = [5, 2, 0.5, 0.5, 2, 5]; // Упрощенно для примера
        const rand = Math.floor(Math.random() * multis.length);
        const win = amt * multis[rand];
        u.balance += win;

        io.emit('update_data', db.users);
        socket.emit('plinko_result', { win: win, index: rand });
    });

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
            bot.telegram.sendMessage(ADMIN_CHAT_ID, `🔔 *Вывод!* @${u.username} - ${amt} TON`, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([[Markup.button.callback('✅ Ок', `w_acc_${data.id}`), Markup.button.callback('❌ Нет', `w_rej_${data.id}_${amt}`)]])
            });
        }
    });

    socket.on('claim_ref', (data) => {
        const u = db.users[data.id];
        if (u && u.refPending > 0) { u.balance += u.refPending; u.refTotal += u.refPending; u.refPending = 0; io.emit('update_data', db.users); }
    });

    socket.on('disconnect', () => io.emit('online_update', io.engine.clientsCount));
});

bot.action(/w_acc_(.+)/, async (ctx) => ctx.editMessageText(`✅ Выполнено`));
bot.action(/w_rej_(.+)_(.+)/, async (ctx) => {
    const userId = ctx.match[1];
    const amt = parseFloat(ctx.match[2]);
    if (db.users[userId]) { db.users[userId].balance += amt; io.emit('update_data', db.users); }
    ctx.editMessageText(`❌ Отменено`);
});

function updateChances() {
    totalBank = players.reduce((s, p) => s + p.amount, 0);
    players.forEach(p => p.chance = (p.amount / totalBank) * 100);
}

function startCountdown() {
    gameStatus = 'countdown';
    let t = 15;
    const i = setInterval(() => {
        t--;
        io.emit('game_status', { status: 'countdown', timer: t });
        if (t <= 0) { clearInterval(i); startGame(); }
    }, 1000);
}

function startGame() {
    gameStatus = 'running';
    io.emit('game_status', { status: 'running' });
    const rand = Math.random() * 100;
    let cumulative = 0;
    let winner = players[0];
    for (let p of players) {
        cumulative += p.chance;
        if (rand <= cumulative) { winner = p; break; }
    }
    const angle = Math.random() * Math.PI * 2;
    const force = 12 + Math.random() * 4; 
    io.emit('start_game_sequence', { vx: Math.cos(angle) * force, vy: Math.sin(angle) * force });
    setTimeout(() => finalizeGame(winner), 15000);
}

function finalizeGame(winner) {
    const winAmount = totalBank * 0.95;
    if (db.users[winner.id]) {
        db.users[winner.id].balance += winAmount;
        gameHistory.push({ username: winner.username, avatar: winner.avatar, bank: winAmount, bet: winner.amount, chance: winner.chance });
        if(gameHistory.length > 20) gameHistory.shift();
    }
    io.emit('announce_winner', { winner, bank: winAmount, winnerBet: winner.amount });
    io.emit('update_data', db.users);
    io.emit('history_update', gameHistory);
    setTimeout(resetGame, 4500);
}

function resetGame() {
    players = []; totalBank = 0; gameStatus = 'waiting';
    io.emit('update_arena', { players, totalBank });
    io.emit('game_status', { status: 'waiting' });
}

bot.launch().catch(err => console.error(err));
server.listen(PORT, () => console.log(`Server on ${PORT}`));
