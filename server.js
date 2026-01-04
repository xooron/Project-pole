const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let waitingPlayer = null;
let rooms = {};

io.on('connection', (socket) => {
    socket.on('find_match', (data) => {
        if (waitingPlayer && waitingPlayer.id !== socket.id) {
            // Создаем игру для двоих
            const roomId = 'room_' + waitingPlayer.id;
            socket.join(roomId);
            waitingPlayer.join(roomId);

            rooms[roomId] = {
                ballX: 50, ballY: 50,
                vx: 0.3, vy: 0.4, // Медленная скорость
                players: [waitingPlayer.id, socket.id],
                bank: 2.0,
                active: true
            };

            io.to(roomId).emit('match_found', { bank: 2.0 });
            startGameLoop(roomId);
            waitingPlayer = null;
        } else {
            waitingPlayer = socket;
        }
    });
});

function startGameLoop(roomId) {
    const game = rooms[roomId];
    let duration = 15000; // Игра длится 15 сек

    const loop = setInterval(() => {
        // Физика мяча с отскоками
        game.ballX += game.vx;
        game.ballY += game.vy;

        // Отскок от левой/правой стенки
        if (game.ballX <= 5 || game.ballX >= 95) game.vx *= -1;
        
        // Отскок от верха/низа (стенки стадиона)
        if (game.ballY <= 5 || game.ballY >= 95) game.vy *= -1;

        io.to(roomId).emit('game_update', {
            ballX: game.ballX,
            ballY: game.ballY,
            bank: game.bank
        });

        duration -= 50;
        if (duration <= 0) {
            clearInterval(loop);
            // Победитель тот, на чьей половине мяч (пример логики)
            const winner = game.ballY > 50 ? game.players[1] : game.players[0];
            io.to(roomId).emit('game_over', winner);
            delete rooms[roomId];
        }
    }, 50);
}

server.listen(3000, () => console.log('Server started on port 3000'));
