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
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

// Ensure data directory and users/messages file exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({}));
if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, JSON.stringify({}));

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

// Helper to load/save messages
function getMessages() {
  if (!fs.existsSync(MESSAGES_FILE)) return {};
  const content = fs.readFileSync(MESSAGES_FILE, 'utf8');
  return content ? JSON.parse(content) : {};
}
function saveMessages(messages) {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
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
    friendRequests: [],
    sentRequests: []
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
  res.cookie('token', token, {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days persist across restarts
    sameSite: 'lax',
    secure: false // Set true in production HTTPS environment
  });
  res.json({ success: true, user: { nickname: user.nickname, id: user.id } });
});

app.get('/api/me', authenticate, (req, res) => {
  const users = getUsers();
  const user = users[req.userEmail];
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  const { password, ...safeUser } = user;
  
  // Resolve friends to objects {id, nickname}
  const resolvedFriends = (safeUser.friends || []).map(fid => {
    const friendObj = Object.values(users).find(u => u.id === fid);
    return friendObj ? { id: fid, nickname: friendObj.nickname } : { id: fid, nickname: 'Unknown' };
  });
  
  safeUser.friends = resolvedFriends;
  res.json(safeUser);
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: 'lax',
    secure: false
  });
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
  sender.sentRequests.push(target.id);
  saveUsers(users);

  // Notify receiver in real-time
  getUserSocketIds(targetId).forEach(targetSid => {
    io.to(targetSid).emit('friend-request-received', { fromId: sender.id, fromNickname: sender.nickname });
  });

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
  if (sender) {
    sender.friends.push(receiver.id);
    const sentIdx = sender.sentRequests ? sender.sentRequests.indexOf(receiver.id) : -1;
    if (sentIdx !== -1) sender.sentRequests.splice(sentIdx, 1);
    
    // Notify sender in real-time
    getUserSocketIds(senderId).forEach(senderSid => {
      io.to(senderSid).emit('friend-request-accepted', { id: receiver.id, nickname: receiver.nickname });
    });
  }
  saveUsers(users);
  res.json({ success: true });
});

app.get('/api/online-friends', authenticate, (req, res) => {
  const users = getUsers();
  const user = users[req.userEmail];
  const onlineFriends = (user.friends || []).filter(fid => getUserSocketIds(fid).size > 0);
  res.json({ onlineFriends });
});

// --- Chat Messages API ---
app.get('/api/messages/:otherId', authenticate, (req, res) => {
  const users = getUsers();
  const me = users[req.userEmail];
  const otherId = req.params.otherId;
  if (!me) return res.status(401).json({ error: 'Unauthorized' });
  const messages = getMessages();
  const chatKey = [me.id, otherId].sort().join('_');
  const chatHistory = messages[chatKey] || [];
  res.json({ history: chatHistory });
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
const idToSocketIds = new Map(); // userId -> Set of socketIds
const socketIdToId = new Map();
const socketIdToNickname = new Map();

// Pending peer-to-peer invite state
const pendingInvitations = new Map(); // key: `${callerId}|${targetId}` -> {callerId,targetId,roomId,callerNickname,timeout}
const callerPendingTargets = new Map(); // callerId -> Set<targetId>

function getUserSocketIds(userId) {
  return idToSocketIds.get(userId) || new Set();
}

function getPendingKey(callerId, targetId) {
  return `${callerId}|${targetId}`;
}

function clearPendingInvitation(callerId, targetId, reason = 'cancelled') {
  const key = getPendingKey(callerId, targetId);
  const inv = pendingInvitations.get(key);
  if (!inv) return;
  clearTimeout(inv.timeout);
  pendingInvitations.delete(key);
  const callerTargets = callerPendingTargets.get(callerId);
  if (callerTargets) {
    callerTargets.delete(targetId);
    if (callerTargets.size === 0) callerPendingTargets.delete(callerId);
    else callerPendingTargets.set(callerId, callerTargets);
  }

  // Notify callee to clear invite popup
  getUserSocketIds(targetId).forEach(socketId => {
    io.to(socketId).emit('invitation-cancelled', { callerId, targetId, roomId: inv.roomId, reason });
    const sendMissed = ['missed', 'caller-left', 'caller-disconnected'].includes(reason);
    if (sendMissed) {
      io.to(socketId).emit('missed-call', {
        fromId: callerId,
        fromNickname: inv.callerNickname,
        targetId,
        timestamp: new Date().toISOString(),
        reason
      });
    }
  });
}

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('identify', ({ id }) => {
    const existing = idToSocketIds.get(id);
    const wasOnline = existing && existing.size > 0;
    if (existing) existing.add(socket.id);
    else idToSocketIds.set(id, new Set([socket.id]));
    socketIdToId.set(socket.id, id);
    console.log(`Socket ${socket.id} identified as ${id}`);

    if (!wasOnline) {
      // Notify friends that this user just came online
      try {
        const users = getUsers();
        const user = Object.values(users).find(u => u.id === id);
        if (user && user.friends) {
          user.friends.forEach(friendId => {
            getUserSocketIds(friendId).forEach(friendSid => {
              io.to(friendSid).emit('friend-online', { id });
            });
          });
        }
      } catch(e) {}
    }

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
    const id = socketIdToId.get(socket.id);
    if (id && callerPendingTargets.has(id)) {
      [...callerPendingTargets.get(id)].forEach(targetId => {
        clearPendingInvitation(id, targetId, 'caller-left');
      });
    }
    if (socket.roomId) {
      socket.to(socket.roomId).emit('user-left', { socketId: socket.id, number: id });
      socket.leave(socket.roomId);
      socket.roomId = null;
    }
  });

  // Screen sharing signaling
  socket.on('screenshare-started', () => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit('screenshare-started', { senderSocketId: socket.id });
    }
  });

  socket.on('screenshare-stopped', () => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit('screenshare-stopped', { senderSocketId: socket.id });
    }
  });

  // Direct Messaging
  socket.on('send-chat-msg', ({ targetId, message, senderNickname }) => {
    const senderId = socketIdToId.get(socket.id);
    if (!senderId) return;

    const messages = getMessages();
    const chatKey = [senderId, targetId].sort().join('_');
    if (!messages[chatKey]) messages[chatKey] = [];

    const newMsg = {
      senderId,
      senderNickname,
      message,
      timestamp: new Date().toISOString()
    };

    messages[chatKey].push(newMsg);
    saveMessages(messages);

    getUserSocketIds(targetId).forEach(targetSid => {
      io.to(targetSid).emit('receive-chat-msg', { senderId, senderNickname, message });
    });
  });

  // Invitation
  socket.on('invite-friend', ({ targetId, roomId, senderNickname, senderId }) => {
    const key = getPendingKey(senderId, targetId);
    const invite = {
      callerId: senderId,
      targetId,
      roomId,
      callerNickname: senderNickname,
      timeout: setTimeout(() => {
        if (pendingInvitations.has(key)) {
          clearPendingInvitation(senderId, targetId, 'missed');
        }
      }, 25000) // mark missed after 25s
    };
    pendingInvitations.set(key, invite);
    if (!callerPendingTargets.has(senderId)) callerPendingTargets.set(senderId, new Set());
    callerPendingTargets.get(senderId).add(targetId);

    getUserSocketIds(targetId).forEach(targetSid => {
      io.to(targetSid).emit('invitation', { callerNumber: senderId, callerNickname: senderNickname, roomId });
    });
  });

  socket.on('invite-accepted', ({ callerId, targetId }) => {
    clearPendingInvitation(callerId, targetId, 'accepted');
  });

  socket.on('reject-invitation', ({ targetId }) => {
    const calleeId = socketIdToId.get(socket.id);
    const callerId = targetId;
    getUserSocketIds(callerId).forEach(callerSid => {
      io.to(callerSid).emit('invitation-rejected', { fromId: calleeId });
    });
    clearPendingInvitation(callerId, calleeId, 'rejected');
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
      if (callerPendingTargets.has(id)) {
        [...callerPendingTargets.get(id)].forEach(targetId => {
          clearPendingInvitation(id, targetId, 'caller-disconnected');
        });
      }

      const sockets = getUserSocketIds(id);
      sockets.delete(socket.id);
      if (sockets.size > 0) {
        idToSocketIds.set(id, sockets);
      } else {
        idToSocketIds.delete(id);

        // Immediately broadcast offline for all friends
        try {
          const users = getUsers();
          const user = Object.values(users).find(u => u.id === id);
          if (user && user.friends) {
            user.friends.forEach(friendId => {
              getUserSocketIds(friendId).forEach(friendSid => {
                io.to(friendSid).emit('friend-offline', { id });
              });
            });
          }
        } catch(e) {}
      }
      socketIdToId.delete(socket.id);

      // If there are still sockets, do not send offline yet
      if (getUserSocketIds(id).size) {
        // no-op
      }
    }
    socketIdToNickname.delete(socket.id);
    if (socket.roomId) {
      socket.to(socket.roomId).emit('user-left', { socketId: socket.id, number: id });
    }
  });
});

const os = require('os');
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const interfaces = os.networkInterfaces();
  console.log(`\n\x1b[36m🚀 NestConnect Server is LIVE!\x1b[0m`);
  console.log(`\x1b[32mLocal:   http://localhost:${PORT}\x1b[0m`);
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`\x1b[32mNetwork: http://${iface.address}:${PORT}\x1b[0m`);
      }
    }
  }
  console.log(`\n\x1b[33mNote:\x1b[0m For WebRTC (video/audio) to work on other devices, you MUST use HTTPS or a secure tunnel.\n`);
});
