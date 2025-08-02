// server.js
const express = require('express');
const http = require('http');
const path = require('path');
const socketio = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

app.use(express.static(__dirname));

const port = process.env.PORT || 3000;

const players = {};
const bullets = {};
let bulletCounter = 0;

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // This is the line that has been changed to center the player
    players[socket.id] = {
        id: socket.id,
        x: 500, // Fixed starting position
        y: 500, // Fixed starting position
        color: '#ffffff',
        radius: 25,
        barrelAngle: 0,
    };

    socket.emit('init', { playerId: socket.id, players, bullets });
    socket.broadcast.emit('playerConnected', players[socket.id]);

    socket.on('disconnect', () => {
        console.log('A user disconnected:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });

    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].barrelAngle = data.barrelAngle;
            io.emit('updatePlayers', players);
        }
    });

    socket.on('playerShoot', (data) => {
        const newBulletId = bulletCounter++;
        bullets[newBulletId] = {
            id: newBulletId,
            ownerId: socket.id,
            x: data.x,
            y: data.y,
            velocity: data.velocity,
            radius: 10,
        };
        io.emit('newBullet', bullets[newBulletId]);
    });
});

setInterval(() => {
    for (const bulletId in bullets) {
        const bullet = bullets[bulletId];
        bullet.x += bullet.velocity.x;
        bullet.y += bullet.velocity.y;
        // You would add collision detection and bullet removal logic here
    }
    io.emit('updateBullets', bullets);
}, 1000 / 60);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'growthmanhunt.html'));
});

server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
