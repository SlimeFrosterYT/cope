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
const CUBE_SIZE = 20;
const MAX_CUBES = 10;
const CUBE_SPAWN_INTERVAL = 5000;
const PLAYER_COLLISION_DAMAGE = 0.1;

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

// Function to check for collision between a rectangle and a circle
function rectCircleColliding(circle, rect) {
    const distX = Math.abs(circle.x - (rect.x + rect.width / 2));
    const distY = Math.abs(circle.y - (rect.y + rect.height / 2));

    if (distX > (rect.width / 2 + circle.radius)) { return false; }
    if (distY > (rect.height / 2 + circle.radius)) { return false; }

    if (distX <= (rect.width / 2)) { return true; } 
    if (distY <= (rect.height / 2)) { return true; }

    const dx = distX - rect.width / 2;
    const dy = distY - rect.height / 2;
    return (dx * dx + dy * dy <= (circle.radius * circle.radius));
}

// Function to check for collision between two rectangles
function rectRectColliding(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

// Function to spawn a new cube at a valid location
function spawnCube() {
    if (Object.keys(cubes).length >= MAX_CUBES) return;

    let attempts = 0;
    let newCubePos = null;

    while (attempts < 100 && newCubePos === null) {
        // Spawn cube randomly within the wall boundaries, with padding
        const padding = 10;
        const x = Math.random() * (wall.width - CUBE_SIZE - padding * 2) + wall.x + padding;
        const y = Math.random() * (wall.height - CUBE_SIZE - padding * 2) + wall.y + padding;
        
        let collision = false;
        const tempCube = { x: x, y: y, size: CUBE_SIZE, width: CUBE_SIZE, height: CUBE_SIZE };

        // Check for collision with existing cubes
        for (const cubeId in cubes) {
            if (rectRectColliding(tempCube, cubes[cubeId])) {
                collision = true;
                break;
            }
        }

        if (collision) {
            attempts++;
            continue;
        }

        // Check for collision with players
        for (const playerId in players) {
            const player = players[playerId];
            const playerCircle = { x: player.x, y: player.y, radius: player.radius };
            if (rectCircleColliding(playerCircle, tempCube)) {
                collision = true;
                break;
            }
        }

        if (!collision) {
            newCubePos = { x, y };
        }
        attempts++;
    }

    if (newCubePos) {
        const score = Math.floor(Math.random() * (15 - 5 + 1)) + 5;
        cubes[cubeCounter] = {
            id: cubeCounter,
            x: newCubePos.x,
            y: newCubePos.y,
            size: CUBE_SIZE,
            score: score,
            width: CUBE_SIZE,
            height: CUBE_SIZE
        };
        cubeCounter++;
    }
}

setInterval(spawnCube, CUBE_SPAWN_INTERVAL);

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

    // Player collision logic
    const playerIds = Object.keys(players);
    for (let i = 0; i < playerIds.length; i++) {
        for (let j = i + 1; j < playerIds.length; j++) {
            const player1 = players[playerIds[i]];
            const player2 = players[playerIds[j]];
            
            if (!player1 || !player2) continue;

            const dx = player1.x - player2.x;
            const dy = player1.y - player2.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < player1.radius + player2.radius) {
                // Collision detected, apply damage
                player1.hp -= PLAYER_COLLISION_DAMAGE;
                player2.hp -= PLAYER_COLLISION_DAMAGE;
            }
        }
    }

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

        let nextX = player.x + newVelocityX;
        let nextY = player.y + newVelocityY;

        // Boundary collision logic
        const minX = wall.x + player.radius;
        const maxX = wall.x + wall.width - player.radius;
        const minY = wall.y + player.radius;
        const maxY = wall.y + wall.height - player.radius;
        
        if (nextX < minX) {
            nextX = minX;
            newVelocityX = 0;
        } else if (nextX > maxX) {
            nextX = maxX;
            newVelocityX = 0;
        }

        if (nextY < minY) {
            nextY = minY;
            newVelocityY = 0;
        } else if (nextY > maxY) {
            nextY = maxY;
            newVelocityY = 0;
        }

        player.x = nextX;
        player.y = nextY;
        player.velocity.x = newVelocityX;
        player.velocity.y = newVelocityY;

        // Check for player death after all damage is applied
        if (player.hp <= 0) {
            io.to(player.socketId).emit('kill');
            delete players[id];
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
                        }
                        
                        io.to(player.socketId).emit('kill');
                        
                        delete players[playerId];
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
                        killer.score += cube.score;
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
