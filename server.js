const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

let server;
const keyPath = path.join(__dirname, 'server.key');
const certPath = path.join(__dirname, 'server.cert');

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  const options = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  };
  server = https.createServer(options, app);
} else {
  // Graceful fallback to HTTP for production (like Fly.io) where SSL is handled by their load balancer
  server = http.createServer(app);
}

const io = new Server(server, { cors: { origin: '*' } });

// Mapping from assigned number -> socket ID
const numberToSocketId = new Map();
// Mapping from socket ID -> assigned number
const socketIdToNumber = new Map();
// Mapping from socket ID -> assigned nickname
const socketIdToNickname = new Map();

// Generate a random 6-digit number
function generateNumber() {
  let num;
  do {
    num = Math.floor(100000 + Math.random() * 900000).toString();
  } while (numberToSocketId.has(num));
  return num;
}

// Generate a random room ID
function generateRoomId() {
  return Math.random().toString(36).substring(2, 10);
}

io.on('connection', (socket) => {
  const myNumber = generateNumber();
  numberToSocketId.set(myNumber, socket.id);
  socketIdToNumber.set(socket.id, myNumber);
  
  socket.emit('assigned-number', { number: myNumber });
  console.log(`User connected: ${socket.id} (Number: ${myNumber})`);

  // Room Management
  socket.on('create-room', ({ nickname } = {}) => {
    socketIdToNickname.set(socket.id, nickname || 'User');
    const roomId = generateRoomId();
    socket.join(roomId);
    socket.roomId = roomId; // attach to socket for easy cleanup
    socket.emit('room-created', { roomId });
  });

  socket.on('join-room', ({ roomId, nickname }) => {
    const room = io.sockets.adapter.rooms.get(roomId);
    if (room) {
      socketIdToNickname.set(socket.id, nickname || 'User');
      socket.join(roomId);
      socket.roomId = roomId;
      
      // Tell everyone in the room that a new user joined so they can initiate offers
      socket.to(roomId).emit('user-joined', { 
        socketId: socket.id, 
        number: myNumber,
        nickname: socketIdToNickname.get(socket.id)
      });
      
      // Give the new user a list of all existing users to prepare PeerConnections
      const existingUsers = Array.from(room).filter(id => id !== socket.id).map(id => ({
        socketId: id,
        number: socketIdToNumber.get(id),
        nickname: socketIdToNickname.get(id) || 'User'
      }));
      socket.emit('room-joined', { roomId, users: existingUsers });
    } else {
      socket.emit('call-error', { message: 'Meeting not found.' });
    }
  });

  // Invitations
  socket.on('invite-user', ({ targetNumber, roomId }) => {
    const targetSocketId = numberToSocketId.get(targetNumber);
    if (targetSocketId) {
      io.to(targetSocketId).emit('invitation', {
        callerNumber: myNumber,
        callerNickname: socketIdToNickname.get(socket.id) || 'User',
        roomId
      });
    } else {
      socket.emit('call-error', { message: 'Number not found or offline.' });
    }
  });

  socket.on('reject-invite', ({ targetNumber }) => {
    const targetSocketId = numberToSocketId.get(targetNumber);
    if (targetSocketId) {
      io.to(targetSocketId).emit('invite-rejected', { number: myNumber });
    }
  });

  // WebRTC Mesh Signaling
  socket.on('offer', ({ targetSocketId, offer }) => {
    io.to(targetSocketId).emit('offer', {
      senderSocketId: socket.id,
      senderNumber: myNumber,
      senderNickname: socketIdToNickname.get(socket.id) || 'User',
      offer
    });
  });

  socket.on('answer', ({ targetSocketId, answer }) => {
    io.to(targetSocketId).emit('answer', {
      senderSocketId: socket.id,
      answer
    });
  });

  socket.on('ice-candidate', ({ targetSocketId, candidate }) => {
    io.to(targetSocketId).emit('ice-candidate', {
      senderSocketId: socket.id,
      candidate
    });
  });

  // Leaving / Disconnecting
  socket.on('leave-room', () => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit('user-left', { socketId: socket.id, number: myNumber });
      socket.leave(socket.roomId);
      socket.roomId = null;
    }
  });

  socket.on('disconnect', () => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit('user-left', { socketId: socket.id, number: myNumber });
    }
    console.log(`User disconnected: ${socket.id} (Number: ${myNumber})`);
    numberToSocketId.delete(myNumber);
    socketIdToNumber.delete(socket.id);
    socketIdToNickname.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Google Meet Clone Server listening on https://localhost:${PORT}`);
});
