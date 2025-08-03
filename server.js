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
const TRIANGLE_SIZE = 40;
const PENTAGON_SIZE = 50;
const MAX_CUBES = 20; // Increased max cubes for more action
const MAX_PENTAGONS = 5; // Increased max pentagons
const MAX_TRIANGLES = 8; // Increased max triangles
const CUBE_SPAWN_INTERVAL = 3000; // Increased spawn rate
const PENTAGON_SPAWN_INTERVAL = 5000; // Increased spawn rate
const TRIANGLE_SPAWN_INTERVAL = 4000; // Increased spawn rate
const PLAYER_COLLISION_DAMAGE = 1;
const MAX_HP = 100;
const HP_REGEN_DELAY = 20000;
const HP_REGEN_RATE = 0.05;
const CUBE_SCORE = 5;
const PENTAGON_SCORE = 20;
const TRIANGLE_SCORE = 15;
const PLAYER_SHOOT_COOLDOWN = 200; // in milliseconds
const BULLET_STRENGTH = 10;
const BULLET_SPEED = 10;
const BASE_BULLET_RADIUS = 5; // Base bullet radius
const CHAT_MESSAGE_LIFETIME = 6000; // 6 seconds for chat messages
const BARREL_LENGTH = 30;
const BARREL_WIDTH = 10;
const BASE_PLAYER_RADIUS = 25;
const BASE_PLAYER_MAX_SPEED = 4.5;
const INITIAL_SCORE = 26263;

// Define the larger map size as a square
const mapSize = {
    width: 4000,
    height: 4000
};

// Define the central wall (now a special spawn zone)
const wall = {
    x: mapSize.width / 2 - 400,
    y: mapSize.height / 2 - 400,
    width: 800,
    height: 800,
};

const players = {};
const bullets = {};
const cubes = {};
const pentagons = {};
const triangles = {};
let bulletCounter = 0;
let cubeCounter = 0;
let pentagonCounter = 0;
let triangleCounter = 0;

/**
 * Calculates a player's radius based on their score.
 * This function provides a smooth, non-linear growth curve.
 * @param {number} score The player's current score.
 * @returns {number} The new radius for the player.
 */
function getPlayerRadiusFromScore(score) {
    // The player's radius grows logarithmically with the score
    return BASE_PLAYER_RADIUS + Math.log10(score + 1) * 10;
}

/**
 * Calculates a player's max speed based on their size.
 * Larger players are slower.
 * @param {number} radius The player's current radius.
 * @returns {number} The new maximum speed for the player.
 */
function getPlayerMaxSpeedFromRadius(radius) {
    // The player's max speed decreases with their radius
    return BASE_PLAYER_MAX_SPEED * (BASE_PLAYER_RADIUS / radius);
}

/**
 * Calculates a bullet's radius based on the owner's size.
 * Larger players shoot larger bullets.
 * @param {number} ownerRadius The radius of the player who fired the bullet.
 * @returns {number} The new bullet radius.
 */
function getBulletRadiusFromOwnerRadius(ownerRadius) {
    return BASE_BULLET_RADIUS + (ownerRadius - BASE_PLAYER_RADIUS) / 5;
}


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

// Function to spawn a new yellow cube at a valid location
function spawnCube() {
    if (Object.keys(cubes).length >= MAX_CUBES) return;

    let attempts = 0;
    let newCubePos = null;

    while (attempts < 100 && newCubePos === null) {
        const padding = 10;
        const x = Math.random() * (mapSize.width - CUBE_SIZE - padding * 2) + padding;
        const y = Math.random() * (mapSize.height - CUBE_SIZE - padding * 2) + padding;
        
        let collision = false;
        const tempCube = { x: x, y: y, size: CUBE_SIZE, width: CUBE_SIZE, height: CUBE_SIZE };

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

        // Check collision with wall
        if (rectRectColliding(tempCube, wall)) {
            collision = true;
        }
        if(collision) {
            attempts++;
            continue;
        }

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
        cubes[cubeCounter] = {
            id: cubeCounter,
            x: newCubePos.x,
            y: newCubePos.y,
            size: CUBE_SIZE,
            strength: 5,
            score: CUBE_SCORE,
            width: CUBE_SIZE,
            height: CUBE_SIZE
        };
        cubeCounter++;
    }
}

// Function to spawn a new purple pentagon inside the central square
function spawnPentagon() {
    if (Object.keys(pentagons).length >= MAX_PENTAGONS) return;
    
    let attempts = 0;
    let newPentagonPos = null;

    while (attempts < 100 && newPentagonPos === null) {
        const x = wall.x + Math.random() * (wall.width - PENTAGON_SIZE);
        const y = wall.y + Math.random() * (wall.height - PENTAGON_SIZE);

        let collision = false;
        const tempPentagon = { x: x, y: y, size: PENTAGON_SIZE, width: PENTAGON_SIZE, height: PENTAGON_SIZE };

        for (const pentagonId in pentagons) {
            if (rectRectColliding(tempPentagon, pentagons[pentagonId])) {
                collision = true;
                break;
            }
        }
        
        if (collision) {
            attempts++;
            continue;
        }

        for (const playerId in players) {
            const player = players[playerId];
            const playerCircle = { x: player.x, y: player.y, radius: player.radius };
            if (rectCircleColliding(playerCircle, tempPentagon)) {
                collision = true;
                break;
            }
        }

        if (!collision) {
            newPentagonPos = { x, y };
        }
        attempts++;
    }

    if (newPentagonPos) {
        pentagons[pentagonCounter] = {
            id: pentagonCounter,
            x: newPentagonPos.x,
            y: newPentagonPos.y,
            size: PENTAGON_SIZE,
            strength: 50,
            score: PENTAGON_SCORE,
            width: PENTAGON_SIZE,
            height: PENTAGON_SIZE,
            hp: 50
        };
        pentagonCounter++;
    }
}

// Function to spawn a new red triangle
function spawnTriangle() {
    if (Object.keys(triangles).length >= MAX_TRIANGLES) return;

    let attempts = 0;
    let newTrianglePos = null;

    while (attempts < 100 && newTrianglePos === null) {
        const padding = 10;
        const x = Math.random() * (mapSize.width - TRIANGLE_SIZE - padding * 2) + padding;
        const y = Math.random() * (mapSize.height - TRIANGLE_SIZE - padding * 2) + padding;
        
        let collision = false;
        const tempTriangle = { x: x, y: y, size: TRIANGLE_SIZE, width: TRIANGLE_SIZE, height: TRIANGLE_SIZE };

        for (const triangleId in triangles) {
            if (rectRectColliding(tempTriangle, triangles[triangleId])) {
                collision = true;
                break;
            }
        }
        
        if (collision) {
            attempts++;
            continue;
        }

        // Check collision with wall
        if (rectRectColliding(tempTriangle, wall)) {
            collision = true;
        }
        if(collision) {
            attempts++;
            continue;
        }

        for (const playerId in players) {
            const player = players[playerId];
            const playerCircle = { x: player.x, y: player.y, radius: player.radius };
            if (rectCircleColliding(playerCircle, tempTriangle)) {
                collision = true;
                break;
            }
        }

        if (!collision) {
            newTrianglePos = { x, y };
        }
        attempts++;
    }

    if (newTrianglePos) {
        triangles[triangleCounter] = {
            id: triangleCounter,
            x: newTrianglePos.x,
            y: newTrianglePos.y,
            size: TRIANGLE_SIZE,
            strength: 15,
            score: TRIANGLE_SCORE,
            width: TRIANGLE_SIZE,
            height: TRIANGLE_SIZE,
            hp: 15
        };
        triangleCounter++;
    }
}

setInterval(spawnCube, CUBE_SPAWN_INTERVAL);
setInterval(spawnPentagon, PENTAGON_SPAWN_INTERVAL);
setInterval(spawnTriangle, TRIANGLE_SPAWN_INTERVAL);

// Function to get a valid player spawn position
function getPlayerSpawnPosition(playerRadius) {
    let attempts = 0;
    let spawnPosition = null;

    while (attempts < 100 && spawnPosition === null) {
        const x = Math.random() * (mapSize.width - playerRadius * 2) + playerRadius;
        const y = Math.random() * (mapSize.height - playerRadius * 2) + playerRadius;
        
        spawnPosition = { x, y };
        attempts++;
    }
    return spawnPosition;
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('A user disconnected:', socket.id);
        delete players[socket.id];
    });

    socket.on('setUsername', (username) => {
        const finalUsername = username ? username : "Unnamed";

        const playerRadius = getPlayerRadiusFromScore(INITIAL_SCORE);
        const spawnPos = getPlayerSpawnPosition(playerRadius) || { x: mapSize.width / 4, y: mapSize.height / 4 };
        const maxSpeed = getPlayerMaxSpeedFromRadius(playerRadius);
        const bulletRadius = getBulletRadiusFromOwnerRadius(playerRadius);

        players[socket.id] = {
            socketId: socket.id,
            username: finalUsername,
            x: spawnPos.x,
            y: spawnPos.y,
            color: '#007bff', // Fixed: Player color is now a property
            radius: playerRadius,
            bulletRadius: bulletRadius,
            barrelAngle: 0,
            velocity: { x: 0, y: 0 },
            acceleration: 0.25,
            friction: 0.85,
            maxSpeed: maxSpeed,
            hp: MAX_HP,
            score: INITIAL_SCORE,
            keys: { w: false, a: false, s: false, d: false },
            lastDamageTime: 0,
            lastShotTime: 0,
            chatMessages: [] // New array to store chat messages
        };

        socket.emit('init', { playerId: socket.id, players, bullets, cubes, pentagons, triangles, wall, mapSize, BARREL_LENGTH, BARREL_WIDTH });
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
            player.chatMessages.push({
                text: message,
                timestamp: Date.now()
            });
        }
    });

    socket.on('playerShoot', () => {
        const player = players[socket.id];
        const now = Date.now();

        if (player && (now - player.lastShotTime > PLAYER_SHOOT_COOLDOWN)) {
            player.lastShotTime = now;
            
            // The server calculates the bullet spawn position
            const spawnDistance = player.radius + player.bulletRadius + 5;
            const bulletSpawnX = player.x + Math.cos(player.barrelAngle) * spawnDistance;
            const bulletSpawnY = player.y + Math.sin(player.barrelAngle) * spawnDistance;

            const newBulletId = bulletCounter++;
            bullets[newBulletId] = {
                id: newBulletId,
                ownerId: socket.id,
                x: bulletSpawnX,
                y: bulletSpawnY,
                velocity: {
                    x: Math.cos(player.barrelAngle) * BULLET_SPEED,
                    y: Math.sin(player.barrelAngle) * BULLET_SPEED
                },
                radius: player.bulletRadius,
                isFading: false,
                fadeStartTime: 0,
                strength: BULLET_STRENGTH,
                color: player.color // Fixed: Bullet color is the player's color
            };
        }
    });
});

setInterval(() => {
    const now = Date.now();
    const bulletsToRemove = new Set();

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
                player1.hp -= PLAYER_COLLISION_DAMAGE;
                player1.lastDamageTime = now;
                player2.hp -= PLAYER_COLLISION_DAMAGE;
                player2.lastDamageTime = now;
            }
        }
    }

    for (const id in players) {
        const player = players[id];
        if (!player) continue;

        // Update player radius and max speed based on score
        player.radius = getPlayerRadiusFromScore(player.score);
        player.maxSpeed = getPlayerMaxSpeedFromRadius(player.radius);
        player.bulletRadius = getBulletRadiusFromOwnerRadius(player.radius);

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

        // Wall collision logic (no changes here as per last request)
        
        player.x = Math.max(player.radius, Math.min(nextX, mapSize.width - player.radius));
        player.y = Math.max(player.radius, Math.min(nextY, mapSize.height - player.radius));

        player.velocity.x = newVelocityX;
        player.velocity.y = newVelocityY;

        // New HP Regeneration logic
        if (player.hp < MAX_HP && (now - player.lastDamageTime > HP_REGEN_DELAY)) {
            player.hp = Math.min(player.hp + HP_REGEN_RATE, MAX_HP);
        }

        // Remove old chat messages
        player.chatMessages = player.chatMessages.filter(msg => now - msg.timestamp < CHAT_MESSAGE_LIFETIME);

        if (player.hp <= 0) {
            io.to(player.socketId).emit('kill');
            delete players[id];
        }
    }
    io.emit('updatePlayers', players);

    for (const bulletId in bullets) {
        const bullet = bullets[bulletId];
        if (!bullet) continue;
        if (bulletsToRemove.has(bulletId)) continue;

        if (!bullet.isFading) {
            bullet.x += bullet.velocity.x;
            bullet.y += bullet.velocity.y;

            // Bullet-Map Boundary collision
            if (bullet.x < 0 || bullet.x > mapSize.width || bullet.y < 0 || bullet.y > mapSize.height) {
                bullet.isFading = true;
                bullet.fadeStartTime = now;
                bullet.velocity.x = 0;
                bullet.velocity.y = 0;
            }

            // The central wall is now non-collidable, so we remove the bullet collision check here.

            // Bullet-Player collision
            for (const playerId in players) {
                const player = players[playerId];
                if (bullet.ownerId === player.socketId) continue;
                
                const distToPlayerX = bullet.x - player.x;
                const distToPlayerY = bullet.y - player.y;
                const distSquaredToPlayer = (distToPlayerX * distToPlayerX) + (distToPlayerY * distToPlayerY);

                if (distSquaredToPlayer < (player.radius * player.radius)) {
                    player.hp -= bullet.strength;
                    player.lastDamageTime = now;

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

                    bulletsToRemove.add(bulletId);
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
                    // Reduce bullet strength
                    bullet.strength -= cube.strength;

                    const killer = players[bullet.ownerId];
                    if (killer) {
                        killer.score += cube.score;
                    }
                    
                    delete cubes[cubeId];
                
                    if (bullet.strength <= 0) {
                        bulletsToRemove.add(bulletId);
                    }
                }
            }
            
            // Bullet-Pentagon collision
            for (const pentagonId in pentagons) {
                const pentagon = pentagons[pentagonId];
                const closestX = Math.max(pentagon.x, Math.min(bullet.x, pentagon.x + pentagon.size));
                const closestY = Math.max(pentagon.y, Math.min(bullet.y, pentagon.y + pentagon.size));
                
                const distToPentagonX = bullet.x - closestX;
                const distToPentagonY = bullet.y - closestY;
                const distSquaredToPentagon = (distToPentagonX * distToPentagonX) + (distToPentagonY * distToPentagonY);
                
                if (distSquaredToPentagon < (bullet.radius * bullet.radius)) {
                    pentagon.hp -= bullet.strength;
                    
                    if (pentagon.hp <= 0) {
                        const killer = players[bullet.ownerId];
                        if (killer) {
                            killer.score += pentagon.score;
                        }
                        
                        delete pentagons[pentagonId];
                    }
                    bulletsToRemove.add(bulletId);
                }
            }

            // Bullet-Triangle collision
            for (const triangleId in triangles) {
                const triangle = triangles[triangleId];
                const closestX = Math.max(triangle.x, Math.min(bullet.x, triangle.x + triangle.size));
                const closestY = Math.max(triangle.y, Math.min(bullet.y, triangle.y + triangle.size));
                
                const distToTriangleX = bullet.x - closestX;
                const distToTriangleY = bullet.y - closestY;
                const distSquaredToTriangle = (distToTriangleX * distToTriangleX) + (distToTriangleY * distToTriangleY);
                
                if (distSquaredToTriangle < (bullet.radius * bullet.radius)) {
                    triangle.hp -= bullet.strength;
                    
                    if (triangle.hp <= 0) {
                        const killer = players[bullet.ownerId];
                        if (killer) {
                            killer.score += triangle.score;
                        }
                        
                        delete triangles[triangleId];
                    }
                    bulletsToRemove.add(bulletId);
                }
            }
        }

        if (bullet.isFading && (now - bullet.fadeStartTime > FADE_DURATION)) {
            bulletsToRemove.add(bulletId);
        }
    }

    bulletsToRemove.forEach(id => {
        delete bullets[id];
    });

    io.emit('updateBullets', bullets);
    io.emit('updateCubes', cubes);
    io.emit('updatePentagons', pentagons);
    io.emit('updateTriangles', triangles);
}, 1000 / 60);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Growth Manhunt</title>
    <style>
        body {
            margin: 0;
            overflow: hidden;
            background-color: #010409;
            font-family: sans-serif;
            color: white;
            position: relative;
        }

        canvas {
            display: block;
            width: 100vw;
            height: 100vh;
        }
        
        .chat-container {
            position: absolute;
            bottom: 10px;
            left: 10px;
            width: 300px;
            background-color: rgba(0, 0, 0, 0.5);
            padding: 10px;
            border-radius: 5px;
            box-shadow: 0 0 10px rgba(255, 255, 255, 0.1);
        }
        
        .chat-input {
            width: 100%;
            background: none;
            border: 1px solid #555;
            color: white;
            padding: 5px;
            box-sizing: border-box;
            outline: none;
        }

        #score-display {
            position: absolute;
            bottom: 10px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 1.5em;
            color: white;
            background-color: rgba(0, 0, 0, 0.5);
            padding: 5px 10px;
            border-radius: 5px;
            z-index: 10;
        }

    </style>
</head>
<body>
    <canvas id="gameCanvas"></canvas>
    
    <div class="chat-container">
        <input type="text" class="chat-input" placeholder="Press Enter to chat..." id="chatInput">
    </div>

    <div id="score-display">Score: 0</div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        // Get the canvas and its 2D rendering context
        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        
        // Connect to the Socket.IO server
        const socket = io();
        
        // Get references to the UI elements
        const chatInput = document.getElementById('chatInput');
        const scoreDisplay = document.getElementById('score-display');
        
        // Constants for chat and player rendering
        const CHAT_DISPLAY_TIME = 6000;
        const CHAT_FADE_DURATION = 500;
        const BASE_PLAYER_RADIUS = 25; // Base radius for new players
        const FADE_DURATION = 1000;
        const BARREL_OFFSET = 5; // The amount the barrel is inside the player's body

        // Game state variables
        let playerId = null;
        let players = {};
        let bullets = {};
        let cubes = {};
        let pentagons = {};
        let triangles = {};
        let wall = {};
        let mapSize = {};
        let BARREL_LENGTH;
        let BARREL_WIDTH;

        // Player input state
        const keys = { w: false, a: false, s: false, d: false };
        let mouse = { x: 0, y: 0 };
        let playerBarrelAngle = 0;
        let shooting = false;

        // Camera for a top-down view
        let camera = { x: 0, y: 0 };

        /**
         * Resizes the canvas to fit the window and updates the camera position.
         */
        window.addEventListener('resize', () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            if (playerId && players[playerId]) {
                const player = players[playerId];
                camera.x = player.x - canvas.width / 2;
                camera.y = player.y - canvas.height / 2;
            }
        });

        // Trigger a resize event on initial load to set the canvas size
        window.dispatchEvent(new Event('resize'));

        // --- Socket.IO Event Handlers ---

        /**
         * Initializes the game state from the server.
         */
        socket.on('init', (data) => {
            playerId = data.playerId;
            players = data.players;
            bullets = data.bullets;
            cubes = data.cubes;
            pentagons = data.pentagons;
            triangles = data.triangles;
            wall = data.wall;
            mapSize = data.mapSize;
            BARREL_LENGTH = data.BARREL_LENGTH;
            BARREL_WIDTH = data.BARREL_WIDTH;

            // Set initial radius for smooth growth animation
            for (const id in players) {
                players[id].currentRadius = players[id].radius;
                players[id].targetRadius = players[id].radius;
            }

            if (players[playerId]) {
                camera.x = players[playerId].x - canvas.width / 2;
                camera.y = players[playerId].y - canvas.height / 2;
            }
            animate();
        });

        /**
         * Updates all player data from the server.
         */
        socket.on('updatePlayers', (serverPlayers) => {
            for (const id in serverPlayers) {
                if (players[id]) {
                    // Update target radius for smooth growth
                    players[id].targetRadius = serverPlayers[id].radius;
                    players[id].x = serverPlayers[id].x;
                    players[id].y = serverPlayers[id].y;
                    players[id].barrelAngle = serverPlayers[id].barrelAngle;
                    players[id].hp = serverPlayers[id].hp;
                    players[id].score = serverPlayers[id].score;
                    players[id].chatMessages = serverPlayers[id].chatMessages;
                    players[id].color = serverPlayers[id].color;
                } else {
                    // Add new player with initial radius
                    serverPlayers[id].currentRadius = serverPlayers[id].radius;
                    serverPlayers[id].targetRadius = serverPlayers[id].radius;
                    players[id] = serverPlayers[id];
                }
            }

            // Remove players that are no longer in the server data
            for (const id in players) {
                if (!serverPlayers[id]) {
                    delete players[id];
                }
            }

            if (players[playerId]) {
                scoreDisplay.textContent = `Score: ${Math.floor(players[playerId].score)}`;
            }
        });

        /**
         * Updates all bullet data from the server.
         */
        socket.on('updateBullets', (serverBullets) => {
            bullets = serverBullets;
        });

        /**
         * Updates cube data from the server.
         */
        socket.on('updateCubes', (serverCubes) => {
            cubes = serverCubes;
        });

        /**
         * Updates pentagon data from the server.
         */
        socket.on('updatePentagons', (serverPentagons) => {
            pentagons = serverPentagons;
        });

        /**
         * Updates triangle data from the server.
         */
        socket.on('updateTriangles', (serverTriangles) => {
            triangles = serverTriangles;
        });
        
        /**
         * Reconnects to the server upon player death.
         */
        socket.on('kill', () => {
            window.location.reload();
        });


        // --- Input Event Handlers ---

        /**
         * Handles keyboard key presses.
         */
        document.addEventListener('keydown', (e) => {
            // Toggle chat input focus with 'Enter' or 'T'
            if (e.key === 'Enter' || e.key === 't') {
                e.preventDefault();
                chatInput.focus();
                return;
            }

            // Handle chat message sending
            if (chatInput.matches(':focus')) {
                if (e.key === 'Enter') {
                    const message = chatInput.value.trim();
                    if (message) {
                        socket.emit('chatMessage', message);
                        chatInput.value = '';
                    }
                    chatInput.blur();
                }
                return;
            }

            // Handle player movement input
            if (e.key === 'w') keys.w = true;
            if (e.key === 'a') keys.a = true;
            if (e.key === 's') keys.s = true;
            if (e.key === 'd') keys.d = true;
        });

        /**
         * Handles keyboard key releases.
         */
        document.addEventListener('keyup', (e) => {
            if (chatInput.matches(':focus')) {
                return;
            }
            if (e.key === 'w') keys.w = false;
            if (e.key === 'a') keys.a = false;
            if (e.key === 's') keys.s = false;
            if (e.key === 'd') keys.d = false;
        });

        /**
         * Tracks mouse movement for aiming.
         */
        canvas.addEventListener('mousemove', (e) => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
        });

        /**
         * Handles mouse button down for shooting.
         */
        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left mouse button
                shooting = true;
            }
        });

        /**
         * Handles mouse button release to stop shooting.
         */
        canvas.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                shooting = false;
            }
        });

        // --- Drawing Functions ---

        /**
         * Draws the player's cannon barrel.
         * @param {object} player The player object to draw the barrel for.
         */
        function drawBarrel(player) {
            ctx.save();
            ctx.translate(player.x - camera.x, player.y - camera.y);
            ctx.rotate(player.barrelAngle);
            
            ctx.fillStyle = player.color; // Fixed: Use player's color for the barrel
            
            const scaleFactor = player.currentRadius / BASE_PLAYER_RADIUS;
            const scaledBarrelLength = BARREL_LENGTH * scaleFactor;
            const scaledBarrelWidth = BARREL_WIDTH * scaleFactor;
            const scaledBarrelOffset = BARREL_OFFSET * scaleFactor;
            
            // Adjusted barrel position to be slightly inside the player's circle
            ctx.fillRect(player.currentRadius - scaledBarrelOffset, -scaledBarrelWidth / 2, scaledBarrelLength, scaledBarrelWidth);
            ctx.restore();
        }

        /**
         * Draws a player circle, name, HP bar, and chat messages.
         * @param {object} player The player object to draw.
         */
        function drawPlayer(player) {
            // Smoothly interpolate the player's radius
            const lerpFactor = 0.1;
            player.currentRadius = player.currentRadius + (player.targetRadius - player.currentRadius) * lerpFactor;
            const displayRadius = player.currentRadius;

            // Draw player body
            ctx.fillStyle = player.socketId === playerId ? player.color : '#dc3545'; // My player is blue, others are red
            ctx.beginPath();
            ctx.arc(player.x - camera.x, player.y - camera.y, displayRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.closePath();
            
            drawBarrel(player);

            // Draw player name
            ctx.fillStyle = 'white';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(player.username, player.x - camera.x, player.y - camera.y - displayRadius - 5);

            // Draw HP bar
            const hpBarWidth = displayRadius * 2;
            const hpBarHeight = 5;
            const hpBarX = player.x - camera.x - displayRadius;
            const hpBarY = player.y - camera.y + displayRadius + 5;
            ctx.fillStyle = 'red';
            ctx.fillRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);
            ctx.fillStyle = 'lime';
            const healthPercentage = player.hp / MAX_HP;
            ctx.fillRect(hpBarX, hpBarY, hpBarWidth * healthPercentage, hpBarHeight);
            
            // Draw chat messages with fade-out
            if (player.chatMessages && player.chatMessages.length > 0) {
                const messageYStart = player.y - camera.y - displayRadius - 20;
                const now = Date.now();
                player.chatMessages.forEach((msg, index) => {
                    const messageY = messageYStart - (15 * (player.chatMessages.length - 1 - index));
                    const age = now - msg.timestamp;
                    const opacity = Math.max(0, 1 - Math.max(0, age - CHAT_DISPLAY_TIME) / CHAT_FADE_DURATION); 
                    if (opacity > 0) {
                        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
                        ctx.font = '12px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.fillText(msg.text, player.x - camera.x, messageY);
                    }
                });
            }
        }

        /**
         * Draws a bullet with a potential fade-out effect.
         * @param {object} bullet The bullet object to draw.
         */
        function drawBullet(bullet) {
            ctx.save();
            if (bullet.isFading) {
                const opacity = Math.max(0, 1 - (Date.now() - bullet.fadeStartTime) / FADE_DURATION);
                ctx.globalAlpha = opacity;
            }
            
            ctx.fillStyle = bullet.color; // Use the bullet's color property from the server
            ctx.beginPath();
            ctx.arc(bullet.x - camera.x, bullet.y - camera.y, bullet.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.closePath();
            
            ctx.restore();
        }

        /**
         * Draws a health bar for a shape if its health is below max.
         * @param {object} shape The shape object.
         * @param {number} size The size of the shape.
         */
        function drawHealthBar(shape, size) {
            if (shape.hp >= shape.maxHp) return;

            const hpBarWidth = size;
            const hpBarHeight = 5;
            const hpBarX = shape.x - camera.x;
            const hpBarY = shape.y - camera.y + size + 5;
            const healthPercentage = shape.hp / shape.maxHp;
            const borderRadius = 2;

            ctx.fillStyle = 'red';
            ctx.beginPath();
            ctx.roundRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight, borderRadius);
            ctx.fill();

            ctx.fillStyle = 'lime';
            ctx.beginPath();
            ctx.roundRect(hpBarX, hpBarY, hpBarWidth * healthPercentage, hpBarHeight, borderRadius);
            ctx.fill();
        }

        /**
         * Draws a cube shape.
         * @param {object} cube The cube object to draw.
         */
        function drawCube(cube) {
            ctx.fillStyle = '#ffde59';
            ctx.beginPath();
            ctx.rect(cube.x - camera.x, cube.y - camera.y, cube.size, cube.size);
            ctx.fill();
            ctx.closePath();
        }

        /**
         * Draws a pentagon shape.
         * @param {object} pentagon The pentagon object to draw.
         */
        function drawPentagon(pentagon) {
            ctx.fillStyle = pentagon.color;
            ctx.beginPath();
            const sides = 5;
            const size = pentagon.size / 2;
            const centerX = pentagon.x - camera.x + pentagon.size / 2;
            const centerY = pentagon.y - camera.y + pentagon.size / 2;
            
            for (let i = 0; i < sides; i++) {
                const angle = i * 2 * Math.PI / sides - Math.PI / 2; // Start from the top
                const x = centerX + size * Math.cos(angle);
                const y = centerY + size * Math.sin(angle);
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.closePath();
            ctx.fill();
            drawHealthBar(pentagon, pentagon.size);
        }

        /**
         * Draws a triangle shape.
         * @param {object} triangle The triangle object to draw.
         */
        function drawTriangle(triangle) {
            ctx.fillStyle = '#ff4d4d';
            ctx.beginPath();
            const sides = 3;
            const size = triangle.size / 2;
            const centerX = triangle.x - camera.x + triangle.size / 2;
            const centerY = triangle.y - camera.y + triangle.size / 2;
            
            for (let i = 0; i < sides; i++) {
                const angle = i * 2 * Math.PI / sides - Math.PI / 2; // Start from the top
                const x = centerX + size * Math.cos(angle);
                const y = centerY + size * Math.sin(angle);
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.closePath();
            ctx.fill();
            drawHealthBar(triangle, triangle.size);
        }

        /**
         * Draws the outer border of the game map.
         */
        function drawMap() {
            ctx.strokeStyle = '#aaa'; 
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.rect(0 - camera.x, 0 - camera.y, mapSize.width, mapSize.height);
            ctx.stroke();
            ctx.closePath();
        }
        
        /**
         * Draws the central wall in the map.
         */
        function drawWall() {
            ctx.fillStyle = 'rgba(128, 0, 128, 0.2)';
            ctx.beginPath();
            ctx.rect(wall.x - camera.x, wall.y - camera.y, wall.width, wall.height);
            ctx.fill();
            ctx.closePath();
        }

        /**
         * Draws a mini-map in the bottom-right corner.
         */
        function drawMinimap() {
            if (!mapSize.width || !players[playerId]) return;

            const minimapSize = 150;
            const minimapPadding = 10;
            const minimapX = canvas.width - minimapSize - minimapPadding;
            const minimapY = canvas.height - minimapSize - minimapPadding;
            
            ctx.save();
            ctx.globalAlpha = 0.8;
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(minimapX, minimapY, minimapSize, minimapSize);
            ctx.strokeStyle = '#aaa';
            ctx.lineWidth = 2;
            ctx.strokeRect(minimapX, minimapY, minimapSize, minimapSize);

            const scaleX = minimapSize / mapSize.width;
            const scaleY = minimapSize / mapSize.height;

            // Draw wall on minimap
            ctx.fillStyle = 'rgba(128, 0, 128, 0.2)';
            ctx.fillRect(minimapX + wall.x * scaleX, minimapY + wall.y * scaleY, wall.width * scaleX, wall.height * scaleY);

            // Draw players on minimap
            for (const id in players) {
                const player = players[id];
                const playerMinimapX = minimapX + player.x * scaleX;
                const playerMinimapY = minimapY + player.y * scaleY;
                ctx.fillStyle = id === playerId ? '#007bff' : '#dc3545';
                ctx.beginPath();
                ctx.arc(playerMinimapX, playerMinimapY, 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.closePath();
            }

            ctx.restore();
        }

        /**
         * The main animation loop.
         */
        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Smoothly move the camera to follow the current player
            if (playerId && players[playerId]) {
                const player = players[playerId];
                const lerpFactor = 0.1;
                camera.x += (player.x - canvas.width / 2 - camera.x) * lerpFactor;
                camera.y += (player.y - canvas.height / 2 - camera.y) * lerpFactor;
            }

            // Draw all game elements
            drawMap();
            drawWall();
            Object.values(cubes).forEach(drawCube);
            Object.values(pentagons).forEach(drawPentagon);
            Object.values(triangles).forEach(drawTriangle);
            Object.values(players).forEach(drawPlayer);
            Object.values(bullets).forEach(drawBullet);
            
            drawMinimap();
            
            // Handle player input and shooting
            if (playerId && players[playerId]) {
                const player = players[playerId];
                if (!chatInput.matches(':focus')) {
                    // Calculate and update the player's barrel angle based on mouse position
                    const dx = mouse.x - (player.x - camera.x);
                    const dy = mouse.y - (player.y - camera.y);
                    const newBarrelAngle = Math.atan2(dy, dx);
                    if (newBarrelAngle !== playerBarrelAngle) {
                        playerBarrelAngle = newBarrelAngle;
                        socket.emit('playerAim', { barrelAngle: playerBarrelAngle });
                    }
                }

                // If shooting, emit a 'playerShoot' event to the server
                if (shooting) {
                    socket.emit('playerShoot');
                }
            }

            // If a player exists, send their movement input to the server
            if (playerId) {
                if (!chatInput.matches(':focus')) {
                    socket.emit('playerInput', keys);
                }
            }

            // Request the next animation frame
            requestAnimationFrame(animate);
        }

        // Prompt for a username when the page loads
        const urlParams = new URLSearchParams(window.location.search);
        const username = urlParams.get('username');

        if (username) {
            socket.emit('setUsername', username);
        } else {
            const newUsername = prompt("Please enter a username:");
            socket.emit('setUsername', newUsername);
        }
    </script>
</body>
</html>
