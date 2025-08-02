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
const FADE_DURATION = 1000; // 1 second

const players = {};
const bullets = {};
let bulletCounter = 0;

// Add the wall to the server's game state
const wall = {
    x: 200, 
    y: 200, 
    width: 200,
    height: 200,
};

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    players[socket.id] = {
        id: socket.id,
        x: 500,
        y: 500,
        color: '#ffffff',
        radius: 25,
        barrelAngle: 0,
        maxSpeed: 4.5
    };

    socket.emit('init', { playerId: socket.id, players, bullets, wall });
    socket.broadcast.emit('playerConnected', players[socket.id]);

    socket.on('disconnect', () => {
        console.log('A user disconnected:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });

    // Server-side authoritative movement
    socket.on('playerMove', (data) => {
        const player = players[socket.id];
        if (player) {
            const nextX = player.x + (data.x - player.x);
            const nextY = player.y + (data.y - player.y);

            // Check for player collision with the wall
            const closestX = Math.max(wall.x, Math.min(nextX, wall.x + wall.width));
            const closestY = Math.max(wall.y, Math.min(nextY, wall.y + wall.height));
            
            const distanceX = nextX - closestX;
            const distanceY = nextY - closestY;
            const distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);

            if (distanceSquared >= (player.radius * player.radius)) {
                player.x = nextX;
                player.y = nextY;
            }
            player.barrelAngle = data.barrelAngle;
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
            isFading: false,
            fadeStartTime: 0
        };
        io.emit('newBullet', bullets[newBulletId]);
    });
});

// Server-side game loop for bullets and collisions
setInterval(() => {
    const now = Date.now();
    const bulletsToRemove = [];

    for (const bulletId in bullets) {
        const bullet = bullets[bulletId];

        if (!bullet.isFading) {
            bullet.x += bullet.velocity.x;
            bullet.y += bullet.velocity.y;

            // Check for bullet collision with the wall
            const closestX = Math.max(wall.x, Math.min(bullet.x, wall.x + wall.width));
            const closestY = Math.max(wall.y, Math.min(bullet.y, wall.y + wall.height));
            const distanceX = bullet.x - closestX;
            const distanceY = bullet.y - closestY;
            const distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);

            if (distanceSquared < (bullet.radius * bullet.radius)) {
                bullet.isFading = true;
                bullet.fadeStartTime = now;
                bullet.velocity.x = 0;
                bullet.velocity.y = 0;
            }
        }

        // Check if a fading bullet has finished fading
        if (bullet.isFading && (now - bullet.fadeStartTime > FADE_DURATION)) {
            bulletsToRemove.push(bulletId);
        }
    }

    // Remove bullets that have finished fading
    bulletsToRemove.forEach(id => {
        delete bullets[id];
    });

    io.emit('updateBullets', bullets);
}, 1000 / 60);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'growthmanhunt.html'));
});

server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
