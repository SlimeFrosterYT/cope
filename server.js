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
const FADE_DURATION = 1000;
const BULLET_KNOCKBACK_FORCE = 0.5;
const CUBE_SCORE = 10;
const CUBE_SIZE = 20;

const players = {};
const bullets = {};
const cubes = {};
let bulletCounter = 0;
let cubeCounter = 0;

const wall = {
    x: 200, 
    y: 200, 
    width: 200,
    height: 200,
};

// Function to spawn a new cube
function spawnCube() {
    const x = Math.random() * (wall.width - CUBE_SIZE) + wall.x;
    const y = Math.random() * (wall.height - CUBE_SIZE) + wall.y;
    cubes[cubeCounter] = {
        id: cubeCounter,
        x: x,
        y: y,
        size: CUBE_SIZE
    };
    cubeCounter++;
}

// Spawn a new cube every 5 seconds
setInterval(spawnCube, 5000);

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('A user disconnected:', socket.id);
        // Find the player by socket ID and delete them
        for (const playerId in players) {
            if (players[playerId].socketId === socket.id) {
                delete players[playerId];
                break;
            }
        }
    });

    socket.on('setUsername', (username) => {
        // Find if a player with this username already exists
        let existingPlayerId = null;
        for (const playerId in players) {
            if (players[playerId].username === username) {
                existingPlayerId = playerId;
                break;
            }
        }
        
        // If an old player with this username exists, delete them
        if (existingPlayerId) {
            delete players[existingPlayerId];
        }

        // Create the new player with the new socket ID
        players[socket.id] = {
            socketId: socket.id,
            username: username,
            x: 500,
            y: 500,
            color: '#ffffff',
            radius: 25,
            bulletRadius: 10,
            barrelAngle: 0,
            velocity: { x: 0, y: 0 },
            acceleration: 0.25,
            friction: 0.85,
            maxSpeed: 4.5,
            hp: 6,
            score: 26263,
            keys: { w: false, a: false, s: false, d: false }
        };

        socket.emit('init', { playerId: socket.id, players, bullets, cubes, wall });
    });

    socket.on('playerInput', (keys) => {
        const player = players[socket.id];
        if (player) {
            player.keys = keys;
        }
    });

    socket.on('playerAim', (data) => {
        const player = players[socket.id];
        if (player) {
            player.barrelAngle = data.barrelAngle;
        }
    });

    socket.on('chatMessage', (message) => {
        const player = players[socket.id];
        if (player) {
            io.emit('chatMessage', `${player.username}: ${message}`);
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

setInterval(() => {
    const now = Date.now();
    const bulletsToRemove = [];

    for (const id in players) {
        const player = players[id];
        let newVelocityX = player.velocity.x;
        let newVelocityY = player.velocity.y;

        if (player.keys.w) newVelocityY -= player.acceleration;
        if (player.keys.s) newVelocityY += player.acceleration;
        if (player.keys.a) newVelocityX -= player.acceleration;
        if (player.keys.d) newVelocityX += player.acceleration;

        newVelocityX *= player.friction;
        newVelocityY *= player.friction;

        if (Math.abs(newVelocityX) > player.maxSpeed) newVelocityX = Math.sign(newVelocityX) * player.maxSpeed;
        if (Math.abs(newVelocityY) > player.maxSpeed) newVelocityY = Math.sign(newVelocityY) * player.maxSpeed;

        const nextX = player.x + newVelocityX;
        const nextY = player.y + newVelocityY;

        const closestX = Math.max(wall.x, Math.min(nextX, wall.x + wall.width));
        const closestY = Math.max(wall.y, Math.min(nextY, wall.y + wall.height));
        
        const distanceX = nextX - closestX;
        const distanceY = nextY - closestY;
        const distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);
        
        if (distanceSquared >= (player.radius * player.radius)) {
            player.x = nextX;
            player.y = nextY;
            player.velocity.x = newVelocityX;
            player.velocity.y = newVelocityY;
        } else {
            player.velocity.x = 0;
            player.velocity.y = 0;
        }
    }
    io.emit('updatePlayers', players);

    for (const bulletId in bullets) {
        const bullet = bullets[bulletId];

        if (!bullet.isFading) {
            bullet.x += bullet.velocity.x;
            bullet.y += bullet.velocity.y;

            // Bullet-Wall collision
            const closestX = Math.max(wall.x, Math.min(bullet.x, wall.x + wall.width));
            const closestY = Math.max(wall.y, Math.min(bullet.y, wall.y + wall.height));
            const distToWallX = bullet.x - closestX;
            const distToWallY = bullet.y - closestY;
            const distSquaredToWall = (distToWallX * distToWallX) + (distToWallY * distToWallY);

            if (distSquaredToWall < (bullet.radius * bullet.radius)) {
                bullet.isFading = true;
                bullet.fadeStartTime = now;
                bullet.velocity.x = 0;
                bullet.velocity.y = 0;
            }

            // Bullet-Player collision
            for (const playerId in players) {
                const player = players[playerId];
                const distToPlayerX = bullet.x - player.x;
                const distToPlayerY = bullet.y - player.y;
                const distSquaredToPlayer = (distToPlayerX * distToPlayerX) + (distToPlayerY * distToPlayerY);

                if (distSquaredToPlayer < (player.radius * player.radius) && bullet.ownerId !== player.socketId) {
                    player.hp--;

                    const angle = Math.atan2(distToPlayerY, distToPlayerX);
                    player.velocity.x += Math.cos(angle) * BULLET_KNOCKBACK_FORCE;
                    player.velocity.y += Math.sin(angle) * BULLET_KNOCKBACK_FORCE;

                    const killer = players[bullet.ownerId];

                    if (player.hp <= 0) {
                        if (killer) {
                            killer.score += player.score;
                            // No chat message for kills as per user request
                        }
                        
                        // Emit 'kill' event to the dead client to trigger redirection
                        io.to(player.socketId).emit('kill');
                        
                        delete players[playerId];
                        // Do not broadcast playerDisconnected messages
                    }

                    bullet.isFading = true;
                    bullet.fadeStartTime = now;
                    bullet.velocity.x = 0;
                    bullet.velocity.y = 0;
                }
            }

            // Bullet-Cube collision
            for (const cubeId in cubes) {
                const cube = cubes[cubeId];
                const closestX = Math.max(cube.x, Math.min(bullet.x, cube.x + cube.size));
                const closestY = Math.max(cube.y, Math.min(bullet.y, cube.y + cube.size));
                
                const distToCubeX = bullet.x - closestX;
                const distToCubeY = bullet.y - closestY;
                const distSquaredToCube = (distToCubeX * distToCubeX) + (distToCubeY * distToCubeY);
                
                if (distSquaredToCube < (bullet.radius * bullet.radius)) {
                    const killer = players[bullet.ownerId];
                    if (killer) {
                        killer.score += CUBE_SCORE;
                    }
                    
                    delete cubes[cubeId];
                    bulletsToRemove.push(bulletId);
                }
            }
        }

        if (bullet.isFading && (now - bullet.fadeStartTime > FADE_DURATION)) {
            bulletsToRemove.push(bulletId);
        }
    }

    bulletsToRemove.forEach(id => {
        delete bullets[id];
    });

    io.emit('updateBullets', bullets);
    io.emit('updateCubes', cubes);
}, 1000 / 60);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
