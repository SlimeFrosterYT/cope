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

const MAX_CUBES = 10;

const MAX_PENTAGONS = 3;

const MAX_TRIANGLES = 5;

const CUBE_SPAWN_INTERVAL = 5000;

const PENTAGON_SPAWN_INTERVAL = 8000;

const TRIANGLE_SPAWN_INTERVAL = 6000;

const PLAYER_COLLISION_DAMAGE = 1; 

const MAX_HP = 100;

const HP_REGEN_DELAY = 20000;

const HP_REGEN_RATE = 0.05;

const CUBE_SCORE = 5;

const PENTAGON_SCORE = 20;

const TRIANGLE_SCORE = 15;





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

        for (const playerId in players) {

            if (players[playerId].socketId === socket.id) {

                delete players[playerId];

                break;

            }

        }

    });



    socket.on('setUsername', (username) => {

        let existingPlayerId = null;

        for (const playerId in players) {

            if (players[playerId].username === username) {

                existingPlayerId = playerId;

                break;

            }

        }

        

        if (existingPlayerId) {

            delete players[existingPlayerId];

        }



        const playerRadius = 25;

        const spawnPos = getPlayerSpawnPosition(playerRadius) || { x: mapSize.width / 4, y: mapSize.height / 4 };



        players[socket.id] = {

            socketId: socket.id,

            username: username,

            x: spawnPos.x,

            y: spawnPos.y,

            color: '#ffffff',

            radius: playerRadius,

            bulletRadius: 10,

            barrelAngle: 0,

            velocity: { x: 0, y: 0 },

            acceleration: 0.25,

            friction: 0.85,

            maxSpeed: 4.5,

            hp: MAX_HP,

            score: 26263,

            keys: { w: false, a: false, s: false, d: false },

            lastDamageTime: 0 

        };



        socket.emit('init', { playerId: socket.id, players, bullets, cubes, pentagons, triangles, wall, mapSize });

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

            fadeStartTime: 0,

            strength: data.strength

        };

        io.emit('newBullet', bullets[newBulletId]);

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



        player.x = Math.max(player.radius, Math.min(nextX, mapSize.width - player.radius));

        player.y = Math.max(player.radius, Math.min(nextY, mapSize.height - player.radius));



        player.velocity.x = newVelocityX;

        player.velocity.y = newVelocityY;



        // New HP Regeneration logic

        if (player.hp < MAX_HP && (now - player.lastDamageTime > HP_REGEN_DELAY)) {

            player.hp = Math.min(player.hp + HP_REGEN_RATE, MAX_HP);

        }



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
