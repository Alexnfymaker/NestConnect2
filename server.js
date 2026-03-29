const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();
const JWT_SECRET = 'nestconnect_ultra_secret_123';
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Ensure data directory and users file exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({}));

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to load/save users
function getUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Generate a unique 6-digit strict ID
function generateStrictId(users) {
  let id;
  const existingIds = Object.values(users).map(u => u.id);
  do {
    id = Math.floor(100000 + Math.random() * 900000).toString();
  } while (existingIds.includes(id));
  return id;
}

// Auth Middleware
const authenticate = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userEmail = decoded.email;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// --- Auth Routes ---
app.post('/api/register', async (req, res) => {
  const { email, password, nickname } = req.body;
  const users = getUsers();
  if (users[email]) return res.status(400).json({ error: 'User already exists' });

  const hashedPassword = await bcrypt.hash(password, 10);
  const strictId = generateStrictId(users);
  
  users[email] = {
    email,
    password: hashedPassword,
    nickname,
    id: strictId,
    friends: [],
    friendRequests: []
  };
  saveUsers(users);
  res.json({ success: true });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const users = getUsers();
  const user = users[email];
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, { httpOnly: true });
  res.json({ success: true, user: { nickname: user.nickname, id: user.id } });
});

app.get('/api/me', authenticate, (req, res) => {
  const users = getUsers();
  const user = users[req.userEmail];
  const { password, ...safeUser } = user;
  res.json(safeUser);
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// --- Friends API ---
app.post('/api/friends/request', authenticate, (req, res) => {
  const { targetId } = req.body;
  const users = getUsers();
  const sender = users[req.userEmail];
  
  if (targetId === sender.id) return res.status(400).json({ error: 'Cannot add yourself' });

  const target = Object.values(users).find(u => u.id === targetId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  
  if (target.friends.includes(sender.id)) return res.status(400).json({ error: 'Already friends' });
  if (target.friendRequests.includes(sender.id)) return res.status(400).json({ error: 'Request already sent' });

  target.friendRequests.push(sender.id);
  saveUsers(users);
  res.json({ success: true });
});

app.post('/api/friends/accept', authenticate, (req, res) => {
  const { senderId } = req.body;
  const users = getUsers();
  const receiver = users[req.userEmail];

  const reqIndex = receiver.friendRequests.indexOf(senderId);
  if (reqIndex === -1) return res.status(400).json({ error: 'No request found' });

  receiver.friendRequests.splice(reqIndex, 1);
  receiver.friends.push(senderId);
  
  const sender = Object.values(users).find(u => u.id === senderId);
  if (sender) sender.friends.push(receiver.id);
  
  saveUsers(users);
  res.json({ success: true });
});

// --- Server Setup ---
let server;
const keyPath = path.join(__dirname, 'server.key');
const certPath = path.join(__dirname, 'server.cert');

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  const options = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
  server = https.createServer(options, app);
} else {
  server = http.createServer(app);
}

const io = new Server(server, { cors: { origin: '*' } });

// Socket state
const idToSocketId = new Map();
const socketIdToId = new Map();
const socketIdToNickname = new Map();

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('identify', ({ id }) => {
    idToSocketId.set(id, socket.id);
    socketIdToId.set(socket.id, id);
    console.log(`Socket ${socket.id} identified as ${id}`);
  });

  // Room Management
  socket.on('create-room', ({ nickname, id } = {}) => {
    socketIdToNickname.set(socket.id, nickname || 'User');
    const roomId = Math.random().toString(36).substring(2, 10);
    socket.join(roomId);
    socket.roomId = roomId;
    socket.emit('room-created', { roomId });
  });

  socket.on('join-room', ({ roomId, nickname, id }) => {
    const room = io.sockets.adapter.rooms.get(roomId);
    if (room) {
      socketIdToNickname.set(socket.id, nickname || 'User');
      socket.join(roomId);
      socket.roomId = roomId;
      socket.to(roomId).emit('user-joined', { socketId: socket.id, number: id, nickname });

      const existingUsers = Array.from(room).filter(sid => sid !== socket.id).map(sid => ({
        socketId: sid,
        number: socketIdToId.get(sid),
        nickname: socketIdToNickname.get(sid) || 'User'
      }));
      socket.emit('room-joined', { roomId, users: existingUsers });
    } else {
      socket.emit('call-error', { message: 'Meeting not found.' });
    }
  });

  // Leave room gracefully
  socket.on('leave-room', () => {
    if (socket.roomId) {
      const id = socketIdToId.get(socket.id);
      socket.to(socket.roomId).emit('user-left', { socketId: socket.id, number: id });
      socket.leave(socket.roomId);
      socket.roomId = null;
    }
  });

  // Direct Messaging
  socket.on('send-chat-msg', ({ targetId, message, senderNickname }) => {
    const targetSid = idToSocketId.get(targetId);
    if (targetSid) {
      io.to(targetSid).emit('receive-chat-msg', { senderId: socketIdToId.get(socket.id), senderNickname, message });
    }
  });

  // Invitation
  socket.on('invite-friend', ({ targetId, roomId, senderNickname, senderId }) => {
    const targetSid = idToSocketId.get(targetId);
    if (targetSid) {
      io.to(targetSid).emit('invitation', { callerNumber: senderId, callerNickname: senderNickname, roomId });
    }
  });

  // Mesh signaling
  socket.on('offer', ({ targetSocketId, offer, senderNumber, senderNickname }) => {
    io.to(targetSocketId).emit('offer', { senderSocketId: socket.id, senderNumber, senderNickname, offer });
  });
  socket.on('answer', ({ targetSocketId, answer }) => {
    io.to(targetSocketId).emit('answer', { senderSocketId: socket.id, answer });
  });
  socket.on('ice-candidate', ({ targetSocketId, candidate }) => {
    io.to(targetSocketId).emit('ice-candidate', { senderSocketId: socket.id, candidate });
  });

  socket.on('disconnect', () => {
    const id = socketIdToId.get(socket.id);
    if (id) {
      idToSocketId.delete(id);
      socketIdToId.delete(socket.id);
    }
    socketIdToNickname.delete(socket.id);
    if (socket.roomId) {
      socket.to(socket.roomId).emit('user-left', { socketId: socket.id, number: id });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`NestConnect Server running on port ${PORT}`);
});
