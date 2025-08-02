// server.js
const express = require('express');
const http = require('http');
const path = require('path');
const socketio = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// Serve all static files from the same directory where server.js is located
app.use(express.static(__dirname));

const port = process.env.PORT || 3000;

// This object will hold the state of all players in the game
const players = {};
// This object will hold the state of all bullets
const bullets = {};
let bulletCounter = 0;

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // When a new user connects, create a new player object for them
    players[socket.id] = {
        id: socket.id,
        x: Math.random() * 800 + 100, // Random starting position
        y: Math.random() * 400 + 100,
        color: '#ffffff', // Set a default color
        radius: 25,
        barrelAngle: 0,
    };

    // Send the new client their ID and the entire current game state
    socket.emit('init', { playerId: socket.id, players, bullets });

    // Tell all other clients that a new player has joined
    socket.broadcast.emit('playerConnected', players[socket.id]);

    // When a client disconnects, remove their player object
    socket.on('disconnect', () => {
        console.log('A user disconnected:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });

    // Listen for player movement updates from a client
    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].barrelAngle = data.barrelAngle;
            // Broadcast the updated state of all players to everyone
            io.emit('updatePlayers', players);
        }
    });

    // Listen for shooting events from a client
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
        // Broadcast the new bullet to all clients
        io.emit('newBullet', bullets[newBulletId]);
    });
});

// A server-side game loop to update bullet positions
setInterval(() => {
    for (const bulletId in bullets) {
        const bullet = bullets[bulletId];
        bullet.x += bullet.velocity.x;
        bullet.y += bullet.velocity.y;
        // You would add collision detection and bullet removal logic here
    }
    // Broadcast the updated bullet positions to all clients
    io.emit('updateBullets', bullets);
}, 1000 / 60); // 60 updates per second

// This line ensures that when a user visits the root URL (e.g., https://your-game.onrender.com),
// they get your growthmanhunt.html file.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'growthmanhunt.html'));
});

server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
