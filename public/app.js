const socket = io();

// ═══════════════════════════════════════
//  DOM References
// ═══════════════════════════════════════

// Persistents
const nexusSidebar   = document.getElementById('nexus-sidebar');
const topBar         = document.getElementById('top-bar');
const dashboardScreen = document.getElementById('dashboard-screen');
const roomScreen      = document.getElementById('room-screen');
const contactsScreen  = document.getElementById('contacts-screen');
const loginScreen      = document.getElementById('login-screen');

// Auth UI
const loginEmailInput = document.getElementById('login-email');
const loginPassInput  = document.getElementById('login-password');
const loginNickInput  = document.getElementById('login-nickname');
const nicknameGroup   = document.getElementById('nickname-group');
const btnAuthMain     = document.getElementById('btn-auth-main');
const authTitle       = document.getElementById('auth-title');
const goToRegister    = document.getElementById('go-to-register');
const btnLogout       = document.getElementById('btn-logout');

// Sidebar and Header
const localNicknameLabel = document.getElementById('local-nickname-label');
const sidebarAvatar      = document.getElementById('sidebar-avatar');
const sidebarNavItems    = document.querySelectorAll('.nav-item[data-screen]');

// Dialer
const dialerOutput      = document.getElementById('dialer-output');
const dialBtns         = document.querySelectorAll('.dial-btn');
const btnDialAudio     = document.getElementById('btn-dial-audio');
const btnDialVideo     = document.getElementById('btn-dial-video');
const btnHostMeeting  = document.getElementById('btn-host-meeting');

// Room
const videoGrid        = document.getElementById('video-grid');
const localVideo       = document.getElementById('local-video');
const btnMute          = document.getElementById('btn-mute');
const btnVideo         = document.getElementById('btn-video');
const btnScreenShare   = document.getElementById('btn-screen-share');
const btnLeave         = document.getElementById('btn-leave');
const pList            = document.getElementById('participant-list');
const roomMessages     = document.getElementById('room-messages');
const roomChatInput    = document.getElementById('room-chat-input');
const btnSendRoomChat  = document.getElementById('btn-send-room-chat');

// Friends
const friendIdInput    = document.getElementById('friend-id-input');
const btnAddFriend     = document.getElementById('btn-add-friend');
const friendsListCont  = document.getElementById('friends-list');
const pendingRequestsList = document.getElementById('pending-requests');

// Incoming Invite
const incomingInviteOverlay = document.getElementById('incoming-invite-overlay');
const inviterNumberEl       = document.getElementById('inviter-number');
const btnRejectInvite       = document.getElementById('btn-reject-invite');
const btnAcceptInvite       = document.getElementById('btn-accept-invite');

// Settings
const settingsModal    = document.getElementById('settings-modal');
const videoSourceSelect = document.getElementById('video-source-select');
const audioSourceSelect = document.getElementById('audio-source-select');

// Utilities
const toastEl = document.getElementById('toast');

// ═══════════════════════════════════════
//  State
// ═══════════════════════════════════════
let currentUser = null;
let isRegisterMode = false;
let myNumber = '';
let currentRoom = null;
let dialNumber = '';

let localStream = null;
let screenStream = null;
let isAudioMuted = false;
let isVideoMuted = false;
let isSharingScreen = false;

const peers = {};
const volumeNodes = {};
const speechIntervals = {};
let audioContext = null;

const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ]
};

// ═══════════════════════════════════════
//  Core App Logic
// ═══════════════════════════════════════

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  setTimeout(() => toastEl.classList.add('hidden'), 3500);
}

function switchScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  sidebarNavItems.forEach(item => {
    item.classList.toggle('active', item.dataset.screen === screenId);
  });
  const screen = document.getElementById(screenId);
  if (screen) screen.classList.add('active');
}

// Dialpad logic
dialBtns.forEach(btn => {
  btn.onclick = () => {
    if (dialNumber.length < 6) {
      dialNumber += btn.dataset.val;
      dialerOutput.textContent = dialNumber;
    }
  };
});
dialerOutput.onclick = () => { dialNumber = ''; dialerOutput.textContent = '--'; };

// ═══════════════════════════════════════
//  Auth Integration
// ═══════════════════════════════════════
async function checkMe() {
  try {
    const res = await fetch('/api/me');
    if (res.ok) onLoggedIn(await res.json());
    else { loginScreen.style.display = 'flex'; switchScreen('login-screen'); }
  } catch (e) { switchScreen('login-screen'); }
}

async function handleAuth() {
  const email = loginEmailInput.value.trim();
  const password = loginPassInput.value.trim();
  const nickname = loginNickInput.value.trim();
  if (!email || !password) return showToast('Email and Password required');
  const endpoint = isRegisterMode ? '/api/register' : '/api/login';
  const body = isRegisterMode ? { email, password, nickname } : { email, password };
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      if (isRegisterMode) { showToast('Account created! Logging in...'); isRegisterMode = false; handleAuth(); }
      else checkMe();
    } else {
      const d = await res.json();
      showToast(d.error || 'Authentication failed');
    }
  } catch (e) { showToast('Server connection error'); }
}

function onLoggedIn(user) {
  currentUser = user;
  myNumber = user.id;
  
  localNicknameLabel.textContent = user.nickname;
  sidebarAvatar.textContent = user.nickname.substring(0, 2).toUpperCase();
  
  // Update sidebar branding etc
  nexusSidebar.classList.remove('hidden');
  topBar.classList.remove('hidden');
  loginScreen.style.display = 'none';

  socket.emit('identify', { id: user.id });
  switchScreen('dashboard-screen');
  refreshFriendsUI();
}

function toggleAuthMode(reg) {
  isRegisterMode = reg;
  authTitle.textContent = reg ? 'Create Nexus Account' : 'Nexus RTC Login';
  btnAuthMain.textContent = reg ? 'Register' : 'Login';
  nicknameGroup.classList.toggle('hidden', !reg);
  document.getElementById('toggle-text').innerHTML = reg 
    ? 'Already have an account? <a href="#" id="go-to-register" style="color:var(--accent);font-weight:600;">Login</a>'
    : 'Don\'t have an account? <a href="#" id="go-to-register" style="color:var(--accent);font-weight:600;">Register Now</a>';
  document.getElementById('go-to-register').onclick = (e) => { e.preventDefault(); toggleAuthMode(!isRegisterMode); };
}

btnAuthMain.onclick = handleAuth;
goToRegister.onclick = (e) => { e.preventDefault(); toggleAuthMode(!isRegisterMode); };
btnLogout.onclick = async () => { await fetch('/api/logout', { method: 'POST' }); location.reload(); };

// ═══════════════════════════════════════
//  Friends & Contacts
// ═══════════════════════════════════════
async function refreshFriendsUI() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) return;
    const user = await res.json();
    currentUser = user;

    // Render contacts to grid
    friendsListCont.innerHTML = '';
    if (!user.friends || user.friends.length === 0) {
      friendsListCont.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-3); padding: 40px;">No contacts added yet. Use the 6-digit ID to find friends.</div>`;
    } else {
      user.friends.forEach(fid => {
        const initials = fid.substring(0, 2);
        const card = document.createElement('div');
        card.className = 'contact-card';
        card.innerHTML = `
          <div class="contact-avatar">${initials}</div>
          <h3 style="font-size: 16px; margin-bottom: 4px;">Friend #${fid}</h3>
          <p style="font-size: 12px; color: var(--text-3); margin-bottom: 20px;">Private Contact</p>
          <div style="display: flex; gap: 8px;">
            <button class="icon-btn" style="flex:1" onclick="dialNumberFromContact('${fid}', 'audio')">
              <svg viewBox="0 0 24 24" width="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67z"/></svg>
            </button>
            <button class="icon-btn" style="flex:1" onclick="dialNumberFromContact('${fid}', 'video')">
              <svg viewBox="0 0 24 24" width="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
            </button>
          </div>
        `;
        friendsListCont.appendChild(card);
      });
    }

    // Pending requests
    pendingRequestsList.innerHTML = '';
    if (user.friendRequests && user.friendRequests.length > 0) {
      user.friendRequests.forEach(rid => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background:var(--bg-card); padding:16px; border-radius:12px; margin-bottom:8px; border:1px solid var(--border);';
        item.innerHTML = `<span>Request from ID: <strong>${rid}</strong></span> <button onclick="acceptFriend('${rid}')" style="background:var(--success); color:white; padding:8px 16px; border-radius:8px; font-weight:700;">Accept</button>`;
        pendingRequestsList.appendChild(item);
      });
    } else {
      pendingRequestsList.innerHTML = `<p style="color:var(--text-3); font-size:13px;">No new requests.</p>`;
    }
  } catch (e) {}
}

async function addFriend() {
  const targetId = friendIdInput.value.trim();
  if (targetId.length !== 6) return showToast('Invalid ID');
  const res = await fetch('/api/friends/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetId })
  });
  if (res.ok) { showToast('Request sent!'); friendIdInput.value = ''; }
  else { const d = await res.json(); showToast(d.error || 'Failed'); }
}

async function acceptFriend(senderId) {
  const res = await fetch('/api/friends/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ senderId })
  });
  if (res.ok) { showToast('Friend Accepted!'); refreshFriendsUI(); }
}

btnAddFriend.onclick = addFriend;
window.dialNumberFromContact = (id, type) => {
  dialNumber = id;
  dialerOutput.textContent = id;
  if (type === 'audio') btnDialAudio.click();
  else btnDialVideo.click();
};

// ═══════════════════════════════════════
//  Meeting & Room
// ═══════════════════════════════════════
async function getMedia() {
  if (localStream) return true;
  try {
    const v = videoSourceSelect.value;
    const a = audioSourceSelect.value;
    localStream = await navigator.mediaDevices.getUserMedia({
      video: v ? { deviceId: { ideal: v } } : true,
      audio: a ? { deviceId: { ideal: a } } : true
    });
    localVideo.srcObject = localStream;
    monitorSpeech(localStream, 'wrapper-local', 'local');
    return true;
  } catch (e) {
    showToast('Media access denied. Using fallback.');
    return false;
  }
}

function monitorSpeech(stream, wrapperId, peerId) {
  if (!stream.getAudioTracks().length) return;
  if (!audioContext) audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  speechIntervals[peerId] = setInterval(() => {
    const w = document.getElementById(wrapperId);
    if (!w) return clearInterval(speechIntervals[peerId]);
    analyser.getByteFrequencyData(data);
    let avg = data.reduce((a, b) => a + b) / data.length;
    w.classList.toggle('is-speaking', avg > 15);
  }, 100);
}

btnHostMeeting.onclick = () => {
  socket.emit('create-room', { nickname: currentUser.nickname, id: myNumber });
};

btnDialVideo.onclick = btnDialAudio.onclick = () => {
  if (dialNumber.length !== 6) return showToast('Enter 6-digit target ID');
  const roomId = 'room_' + Math.random().toString(36).substring(2, 9);
  socket.emit('create-room', { nickname: currentUser.nickname, id: myNumber });
  socket.once('room-created', ({ roomId }) => {
    socket.emit('invite-friend', { targetId: dialNumber, senderId: myNumber, senderNickname: currentUser.nickname, roomId });
  });
};

socket.on('room-created', ({ roomId }) => {
  joinRoom(roomId);
});

socket.on('invitation', ({ callerNumber, roomId }) => {
  inviterNumberEl.textContent = callerNumber;
  incomingInviteOverlay.classList.remove('hidden');
  document.getElementById('btn-accept-invite').onclick = () => {
    incomingInviteOverlay.classList.add('hidden');
    joinRoom(roomId);
  };
  document.getElementById('btn-reject-invite').onclick = () => {
    incomingInviteOverlay.classList.add('hidden');
  };
});

async function joinRoom(roomId) {
  currentRoom = roomId;
  const hasMedia = await getMedia();
  switchScreen('room-screen');
  nexusSidebar.classList.add('hidden');
  topBar.classList.add('hidden');
  socket.emit('join-room', { roomId, nickname: currentUser.nickname, id: myNumber });
}

socket.on('room-joined', ({ roomId, users }) => {
  users.forEach(u => setupPeer(u.socketId, u.number, u.nickname, true));
  updateParticipantList();
});

socket.on('user-joined', (u) => {
  showToast(`${u.nickname} joined the call`);
  setupPeer(u.socketId, u.number, u.nickname, false);
  updateParticipantList();
});

function setupPeer(socketId, number, nickname, isOffer) {
  const pc = new RTCPeerConnection(iceServers);
  peers[socketId] = { pc, number, nickname };
  
  localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
  
  pc.onicecandidate = (e) => {
    if (e.candidate) socket.emit('ice-candidate', { targetSocketId: socketId, candidate: e.candidate });
  };
  
  pc.ontrack = (e) => {
    let wrapper = document.getElementById(`wrapper-${socketId}`);
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'video-wrapper';
      wrapper.id = `wrapper-${socketId}`;
      wrapper.innerHTML = `<video id="video-${socketId}" autoplay playsinline></video><div class="video-label">${nickname}</div>`;
      videoGrid.appendChild(wrapper);
    }
    const vid = wrapper.querySelector('video');
    vid.srcObject = e.streams[0];
    monitorSpeech(e.streams[0], `wrapper-${socketId}`, socketId);
  };

  if (isOffer) {
    pc.createOffer().then(offer => {
      pc.setLocalDescription(offer);
      socket.emit('offer', { targetSocketId: socketId, offer, senderNumber: myNumber, senderNickname: currentUser.nickname });
    });
  }
}

socket.on('offer', async ({ senderSocketId, offer, senderNumber, senderNickname }) => {
  let peer = peers[senderSocketId];
  if (!peer) {
    setupPeer(senderSocketId, senderNumber, senderNickname, false);
    peer = peers[senderSocketId];
  }
  await peer.pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peer.pc.createAnswer();
  await peer.pc.setLocalDescription(answer);
  socket.emit('answer', { targetSocketId: senderSocketId, answer });
});

socket.on('answer', ({ senderSocketId, answer }) => {
  peers[senderSocketId]?.pc.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('ice-candidate', ({ senderSocketId, candidate }) => {
  peers[senderSocketId]?.pc.addIceCandidate(new RTCIceCandidate(candidate));
});

socket.on('user-left', ({ socketId }) => {
  const wrapper = document.getElementById(`wrapper-${socketId}`);
  if (wrapper) wrapper.remove();
  if (peers[socketId]) { peers[socketId].pc.close(); delete peers[socketId]; }
  updateParticipantList();
});

function updateParticipantList() {
  pList.innerHTML = `<div style="display:flex; align-items:center; gap:12px; padding:4px; border-radius:8px; background:rgba(255,255,255,0.05);">
    <div style="width:32px;height:32px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;">ME</div>
    <div style="flex:1; font-size:13px; font-weight:600;">You</div>
    <svg viewBox="0 0 24 24" width="14" fill="none" stroke="var(--success)" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
  </div>`;
  Object.values(peers).forEach(p => {
    const div = document.createElement('div');
    div.style.cssText = 'display:flex; align-items:center; gap:12px; padding:4px;';
    div.innerHTML = `
      <div style="width:32px;height:32px;border-radius:50%;background:var(--bg-input);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:1px solid var(--border);">${p.nickname.substring(0,1).toUpperCase()}</div>
      <div style="flex:1; font-size:13px;">${p.nickname}</div>
      <svg viewBox="0 0 24 24" width="14" fill="none" stroke="var(--text-3)" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
    `;
    pList.appendChild(div);
  });
}

btnLeave.onclick = () => {
  socket.emit('leave-room');
  location.reload();
};

// Messaging
btnSendRoomChat.onclick = () => {
  const msg = roomChatInput.value.trim();
  if (!msg) return;
  socket.emit('room-chat', { msg, sender: currentUser.nickname });
  addRoomMessage('You', msg, true);
  roomChatInput.value = '';
};

socket.on('room-chat', ({ msg, sender }) => addRoomMessage(sender, msg, false));

function addRoomMessage(sender, msg, isMe) {
  if (roomMessages.querySelector('p')) roomMessages.innerHTML = '';
  const div = document.createElement('div');
  div.style.marginBottom = '12px';
  div.innerHTML = `<span style="font-weight:700; color:${isMe ? 'var(--accent)' : 'var(--text-2)'}; font-size:11px;">${sender.toUpperCase()}</span><p style="margin-top:2px;">${msg}</p>`;
  roomMessages.appendChild(div);
  roomMessages.scrollTop = roomMessages.scrollHeight;
}

// Media toggles
btnMute.onclick = () => {
  isAudioMuted = !isAudioMuted;
  localStream.getAudioTracks()[0].enabled = !isAudioMuted;
  btnMute.classList.toggle('active', !isAudioMuted);
  btnMute.querySelector('.icon-mic-on').classList.toggle('hidden', isAudioMuted);
  btnMute.querySelector('.icon-mic-off').classList.toggle('hidden', !isAudioMuted);
};

btnVideo.onclick = () => {
  isVideoMuted = !isVideoMuted;
  localStream.getVideoTracks()[0].enabled = !isVideoMuted;
  btnVideo.classList.toggle('active', !isVideoMuted);
  btnVideo.querySelector('.icon-vid-on').classList.toggle('hidden', isVideoMuted);
  btnVideo.querySelector('.icon-vid-off').classList.toggle('hidden', !isVideoMuted);
};

// Sidebar Nav
sidebarNavItems.forEach(i => {
  i.onclick = () => switchScreen(i.dataset.screen);
});

checkMe();
populateDevices();
async function populateDevices() {
  const ds = await navigator.mediaDevices.enumerateDevices();
  ds.forEach(d => {
    const o = document.createElement('option');
    o.value = d.deviceId; o.text = d.label || (d.kind === 'videoinput' ? 'Camera' : 'Mic');
    if (d.kind === 'videoinput') videoSourceSelect.add(o);
    else if (d.kind === 'audioinput') audioSourceSelect.add(o);
  });
}
