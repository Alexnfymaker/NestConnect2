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
// Chat removed per user request

// Direct Chat
const directChatModal    = document.getElementById('direct-chat-modal');
const directChatMessages = document.getElementById('direct-chat-messages');
const directChatInput    = document.getElementById('direct-chat-input');
const btnSendDirectChat  = document.getElementById('btn-send-direct-chat');
const chatFriendName     = document.getElementById('chat-friend-name');
const chatFriendAvatar   = document.getElementById('chat-friend-avatar');

let activeChatFriendId = null;

// Friends
const friendIdInput    = document.getElementById('friend-id-input');
const btnAddFriend     = document.getElementById('btn-add-friend');
const friendsListCont  = document.getElementById('friends-list');
const pendingRequestsList = document.getElementById('pending-requests-list');
const sentRequestsList    = document.getElementById('sent-requests-list');

// Incoming Invite
const incomingInviteOverlay = document.getElementById('incoming-invite-overlay');
const inviterNumberEl       = document.getElementById('inviter-number');
const btnRejectInvite       = document.getElementById('btn-reject-invite');
const btnAcceptInvite       = document.getElementById('btn-accept-invite');

// Settings
const settingsModal    = document.getElementById('settings-modal');
const videoSourceSelect = document.getElementById('video-source-select');
const audioSourceSelect = document.getElementById('audio-source-select');
const screenPickerModal = document.getElementById('screen-picker-modal');
const screenPickerList  = document.getElementById('screen-picker-list');
const btnClosePicker    = document.getElementById('btn-close-picker');

// Microphone Volume
let micGain = null;

// Room Codes
const joinRoomInput     = document.getElementById('join-room-input');
const btnJoinByCode     = document.getElementById('btn-join-by-code');
const roomCodeDisplay   = document.getElementById('room-code-display');

// Meeting Invitation
const meetingInviteModal = document.getElementById('meeting-invite-modal');
const inviteNexusIdInput = document.getElementById('invite-nexus-id');
const btnOpenInviteModal = document.getElementById('btn-open-invite-modal');
const btnSendMeetingInvite = document.getElementById('btn-send-meeting-invite');

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
const onlineFriends = new Set(); // store friend IDs known online
const missedCallCounts = new Map(); // friendId -> number of missed calls

let localStream = null;
let screenStream = null;
let isAudioMuted = false;
let isVideoMuted = false;
let isSharingScreen = false;

const peers = {};
const volumeNodes = {};
const speechIntervals = {};
let audioContext = null;

// Sound Effects
const soundLeave = new Audio('https://image2url.com/r2/default/audio/1774801535700-cb574d52-d50d-4a26-90ea-17da26aa2318.mp3');
const soundInvite = new Audio('https://image2url.com/r2/default/audio/1774801683234-d2ff66c9-a510-47d0-a6d0-267a4a641329.mp3');
soundInvite.loop = true;

const soundJoinMeeting = new Audio('https://ik.imagekit.io/00ezbwkcd/Someone%20is%20Joiniing%20Call.MP3');
const soundLeaveMeeting = new Audio('https://ik.imagekit.io/00ezbwkcd/Someone%20is%20leaving%20Call.MP3');
const soundOutgoingRing = new Audio('https://ik.imagekit.io/00ezbwkcd/YouCallingSmb.MP3?updatedAt=1774892001124');
soundOutgoingRing.loop = true;

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

  // Send native desktop notification if window is blurred
  if (!document.hasFocus() && Notification.permission === "granted") {
    new Notification("NestConnect", { body: msg, icon: '/favicon.ico' });
  }
}

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('nexus-theme', isDark ? 'dark' : 'light');
  showToast(isDark ? 'Dark Mode Enabled' : 'Light Mode Enabled (Default)');
}

function loadTheme() {
  if (localStorage.getItem('nexus-theme') === 'dark') {
    document.body.classList.add('dark-mode');
  }
}

function switchScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  
  // Update sidebar nav state
  sidebarNavItems.forEach(item => {
    item.classList.toggle('active', item.dataset.screen === screenId);
  });

  // Update header nav state
  document.querySelectorAll('.header-nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.screen === screenId);
  });

  const screen = document.getElementById(screenId);
  if (screen) screen.classList.add('active');

  // Handle Active Call Badge and Sidebar visibility
  const badge = document.getElementById('call-active-badge');
  if (screenId === 'login-screen') {
    nexusSidebar.classList.add('hidden');
    topBar.classList.add('hidden');
  } else if (currentRoom) {
    if (screenId === 'room-screen') {
      badge.classList.add('hidden');
      nexusSidebar.classList.add('hidden');
    } else {
      badge.classList.remove('hidden');
      nexusSidebar.classList.remove('hidden');
    }
  } else {
    badge.classList.add('hidden');
    nexusSidebar.classList.remove('hidden');
    topBar.classList.remove('hidden');
  }
}

// Header nav logic removed, handled by delegation in app.js footer

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
    const res = await fetch('/api/me', { credentials: 'include' });
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
      credentials: 'include',
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
  syncOnlineFriends();
  document.getElementById('my-number-header').textContent = user.id;
  switchScreen('dashboard-screen');
  refreshFriendsUI();

  // Request notification permission on first login
  if (Notification.permission !== "granted" && Notification.permission !== "denied") {
    Notification.requestPermission().then(val => {
      if (val === 'granted') showToast('Notifications enabled');
      else showToast('Notifications disabled for now');
    });
  }

  // After sign-in we explicitly notify friend online logic (for state debugging)
  showToast('You are online');
  if (Notification.permission === 'granted') {
    new Notification('NestConnect', { body: 'You are online and ready to receive calls/messages' });
  }
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
btnLogout.onclick = async () => { await fetch('/api/logout', { method: 'POST', credentials: 'include' }); location.reload(); };

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
      user.friends.forEach(friend => {
        const fid = friend.id;
        const fname = friend.nickname;
        const isOnline = !!friend.online || onlineFriends.has(fid);
        const initials = fname.substring(0, 2).toUpperCase();
        const missedCount = missedCallCounts.get(fid) || 0;
        const missedBadge = missedCount > 0 ? `<span style="font-size:12px;color:#fff;background:#e74c3c;border-radius:10px;padding:2px 6px;margin-left:6px;">${missedCount}</span>` : '';
        const card = document.createElement('div');
        card.className = 'contact-card';
        card.innerHTML = `
          <div class="contact-avatar">${initials}</div>
          <div class="contact-status-wrapper">
            <span class="contact-name">${fname}${missedBadge}</span>
            <span class="contact-online-dot ${isOnline ? 'online' : 'offline'}" title="${isOnline ? 'Online' : 'Offline'}"></span>
          </div>
          <p style="font-size: 12px; color: var(--text-3); margin-bottom: 20px;">ID: #${fid}</p>
          <div style="display: flex; gap: 8px;">
            <button class="icon-btn" style="flex:1" onclick="openDirectChat('${fid}', '${fname}')" title="Chat">
              <svg viewBox="0 0 24 24" width="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </button>
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

    // Incoming requests
    pendingRequestsList.innerHTML = '';
    if (user.friendRequests && user.friendRequests.length > 0) {
      user.friendRequests.forEach(rid => {
        const item = document.createElement('div');
        item.className = 'card';
        item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:16px; margin-bottom:8px; border:1px solid var(--border);';
        item.innerHTML = `<span>Request from ID: <strong>#${rid}</strong></span> <button onclick="acceptFriend('${rid}')" style="background:var(--success); color:white; padding:8px 16px; border-radius:8px; font-weight:700;">Accept</button>`;
        pendingRequestsList.appendChild(item);
      });
    } else {
      pendingRequestsList.innerHTML = `<p style="color:var(--text-3); font-size:13px;">No incoming requests.</p>`;
    }

    // Sent requests
    sentRequestsList.innerHTML = '';
    if (user.sentRequests && user.sentRequests.length > 0) {
      user.sentRequests.forEach(rid => {
        const item = document.createElement('div');
        item.className = 'card';
        item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:16px; margin-bottom:8px; border:1px solid var(--border); background: var(--bg-input); opacity: 0.8;';
        item.innerHTML = `<span>Sent to ID: <strong>#${rid}</strong></span> <span style="font-size:11px; font-weight:700; color:var(--text-3); text-transform:uppercase;">Pending</span>`;
        sentRequestsList.appendChild(item);
      });
    } else {
      sentRequestsList.innerHTML = `<p style="color:var(--text-3); font-size:13px;">No outgoing requests.</p>`;
    }
  } catch (e) {}
}

async function syncOnlineFriends() {
  try {
    const res = await fetch('/api/online-friends', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    onlineFriends.clear();
    (data.onlineFriends || []).forEach(fid => onlineFriends.add(fid));
    refreshFriendsUI();
  } catch (e) {
    console.error('Failed to sync online friends', e);
  }
}

socket.on('connect', () => {
  if (myNumber) {
    socket.emit('identify', { id: myNumber });
    syncOnlineFriends();
  }
});

socket.on('disconnect', () => {
  onlineFriends.clear();
  refreshFriendsUI();
});

// Real-time Social Listeners
socket.on('friend-request-received', ({ fromNickname }) => {
  showToast(`New friend request from ${fromNickname}!`);
  refreshFriendsUI();
});

socket.on('friend-request-accepted', ({ nickname }) => {
  showToast(`${nickname} accepted your friend request!`);
  refreshFriendsUI();
});

socket.on('friend-online', ({ id }) => {
  onlineFriends.add(id);
  refreshFriendsUI();
  showToast(`Friend #${id} is now online`);
  if (Notification.permission === 'granted') {
    new Notification('Friend Online', { body: `Friend #${id} is online now.` });
  }
});

socket.on('friend-offline', ({ id }) => {
  onlineFriends.delete(id);
  refreshFriendsUI();
  showToast(`Friend #${id} went offline`);
});

async function addFriend() {
  const targetId = friendIdInput.value.trim();
  if (targetId.length !== 6) return showToast('Invalid ID');
  const res = await fetch('/api/friends/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetId })
  });
  if (res.ok) { 
    showToast('Request sent!'); 
    friendIdInput.value = ''; 
    refreshFriendsUI(); 
  }
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
//  Direct Chat Logic
// ═══════════════════════════════════════
async function openDirectChat(friendId, nickname) {
  activeChatFriendId = friendId;
  missedCallCounts.set(friendId, 0);
  chatFriendName.textContent = nickname || `Friend #${friendId}`;
  chatFriendAvatar.textContent = (nickname || '??').substring(0, 2).toUpperCase();
  directChatModal.classList.remove('hidden');
  directChatMessages.innerHTML = '<p style="text-align: center; color: var(--text-3); font-size: 13px; margin-top: 100px;">Loading chat history...</p>';

  try {
    const res = await fetch(`/api/messages/${friendId}`);
    if (res.ok) {
      const data = await res.json();
      directChatMessages.innerHTML = '';
      if (data.history.length === 0) {
        directChatMessages.innerHTML = '<p style="text-align: center; color: var(--text-3); font-size: 13px; margin-top: 100px;">No messages yet. Say hello!</p>';
      } else {
        data.history.forEach(m => addDirectMessageUI(m.senderNickname, m.message, m.senderId === myNumber));
      }
    }
  } catch (e) {
    directChatMessages.innerHTML = '<p style="text-align: center; color: var(--danger); font-size: 13px; margin-top: 100px;">Failed to load history.</p>';
  }
}

function closeDirectChat() {
  directChatModal.classList.add('hidden');
  activeChatFriendId = null;
}

function addDirectMessageUI(nickname, message, isMe) {
  if (directChatMessages.querySelector('p')) directChatMessages.innerHTML = '';
  const div = document.createElement('div');
  div.style.cssText = `display: flex; flex-direction: column; margin-bottom: 16px; align-items: ${isMe ? 'flex-end' : 'flex-start'}`;
  div.innerHTML = `
    <span style="font-size: 9px; font-weight: 800; color: var(--text-3); text-transform: uppercase; margin-bottom: 4px;">${nickname}</span>
    <div style="background: ${isMe ? 'var(--accent)' : 'var(--bg-input)'}; color: ${isMe ? 'var(--bg)' : 'var(--text)'}; padding: 10px 14px; border-radius: 12px; font-size: 13px; max-width: 80%; border: ${isMe ? 'none' : '1px solid var(--border)'}">${message}</div>
  `;
  directChatMessages.appendChild(div);
  directChatMessages.scrollTop = directChatMessages.scrollHeight;
}

btnSendDirectChat.onclick = () => {
  const msg = directChatInput.value.trim();
  if (!msg || !activeChatFriendId) return;
  socket.emit('send-chat-msg', { targetId: activeChatFriendId, message: msg, senderNickname: currentUser.nickname });
  addDirectMessageUI('YOU', msg, true);
  directChatInput.value = '';
};

directChatInput.onkeydown = (e) => {
  if (e.key === 'Enter') btnSendDirectChat.click();
};

socket.on('receive-chat-msg', ({ senderId, senderNickname, message }) => {
  if (activeChatFriendId === senderId) {
    addDirectMessageUI(senderNickname, message, false);
  } else {
    showToast(`New message from ${senderNickname}`);
    if (Notification.permission === "granted") {
       new Notification(`Message from ${senderNickname}`, { body: message });
    }
  }
});

window.openDirectChat = openDirectChat;
window.closeDirectChat = closeDirectChat;

// ═══════════════════════════════════════
//  Meeting & Room
// ═══════════════════════════════════════

function createDummyVideoTrack() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    const drawInterval = setInterval(() => {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 40px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CAMERA OFF', canvas.width/2, canvas.height/2);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      const size = 100 + Math.sin(Date.now() / 500) * 20;
      ctx.beginPath();
      ctx.arc(canvas.width/2, canvas.height/2 + 80, size, 0, Math.PI * 2);
      ctx.fill();
    }, 100);
    const stream = canvas.captureStream ? canvas.captureStream(10) : canvas.mozCaptureStream(10);
    const track = stream.getVideoTracks()[0];
    const originalStop = track.stop.bind(track);
    track.stop = () => { clearInterval(drawInterval); originalStop(); };
    return track;
  } catch (e) { return null; }
}

async function getMedia() {
  if (localStream) return true;
  try {
    const v = videoSourceSelect.value;
    const a = audioSourceSelect.value;
    const originalStream = await navigator.mediaDevices.getUserMedia({
      video: v ? { deviceId: { ideal: v } } : true,
      audio: a ? { deviceId: { ideal: a } } : true
    });
    
    // Apply mic gain
    if (!audioContext) audioContext = new AudioContext();
    const audioTrack = originalStream.getAudioTracks()[0];
    if (audioTrack) {
      const source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
      micGain = audioContext.createGain();
      micGain.gain.value = parseFloat(localStorage.getItem('nexus-mic-volume') || 1);
      source.connect(micGain);
      const dest = audioContext.createMediaStreamDestination();
      micGain.connect(dest);
      localStream = new MediaStream([dest.stream.getAudioTracks()[0]]);
    } else {
      localStream = new MediaStream();
    }
    
    // Add video track
    const videoTrack = originalStream.getVideoTracks()[0];
    if (videoTrack) {
      localStream.addTrack(videoTrack);
    } else {
      const dummy = createDummyVideoTrack();
      if (dummy) localStream.addTrack(dummy);
    }
    
    localVideo.srcObject = localStream;
    monitorSpeech(localStream, 'wrapper-local', 'local');
    return true;
  } catch (e) {
    try {
      const originalStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      const audioTrack = originalStream.getAudioTracks()[0];
      if (!audioContext) audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
      micGain = audioContext.createGain();
      micGain.gain.value = parseFloat(localStorage.getItem('nexus-mic-volume') || 1);
      source.connect(micGain);
      const dest = audioContext.createMediaStreamDestination();
      micGain.connect(dest);
      localStream = new MediaStream([dest.stream.getAudioTracks()[0]]);
      
      const dummy = createDummyVideoTrack();
      if (dummy) localStream.addTrack(dummy);
      localVideo.srcObject = localStream;
      monitorSpeech(localStream, 'wrapper-local', 'local');
      showToast('Camera unavailable — joined with audio only.');
      return true;
    } catch (e2) {
      showToast('Media access denied. Cannot join call.');
      return false;
    }
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
  const btn = btnHostMeeting;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-spinner"></span> Connecting...';
  setTimeout(() => {
    socket.emit('create-room', { nickname: currentUser.nickname, id: myNumber });
    btn.disabled = false;
    btn.textContent = originalText;
  }, 2000);
};

btnDialVideo.onclick = btnDialAudio.onclick = () => {
  if (dialNumber.length !== 6) return showToast('Enter 6-digit target ID');
  const roomId = 'room_' + Math.random().toString(36).substring(2, 9);
  
  // Start outgoing ring sound
  soundOutgoingRing.play().catch(e => console.log("Sound play failed", e));
  
  socket.emit('create-room', { nickname: currentUser.nickname, id: myNumber });
  socket.once('room-created', ({ roomId }) => {
    socket.emit('invite-friend', { targetId: dialNumber, senderId: myNumber, senderNickname: currentUser.nickname, roomId });
    
    // Add ringing placeholder UI
    let wrapper = document.getElementById(`wrapper-ringing-${dialNumber}`);
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'video-wrapper is-ringing';
      wrapper.id = `wrapper-ringing-${dialNumber}`;
      wrapper.innerHTML = `<div class="video-label">Friend #${dialNumber}</div>`;
      videoGrid.appendChild(wrapper);
    }
  });
};

socket.on('room-created', ({ roomId }) => {
  roomCodeDisplay.textContent = roomId;
  joinRoom(roomId);
});

socket.on('invitation', ({ callerNumber, callerNickname, roomId }) => {
  inviterNumberEl.textContent = callerNickname || callerNumber;
  incomingInviteOverlay.classList.remove('hidden');
  
  if (Notification.permission === "granted") {
     new Notification("Incoming Call", { body: `${callerNickname || callerNumber} is calling you on NestConnect.` });
  }
  
  // Play incoming call sound
  soundInvite.play().catch(e => console.log("Audio play blocked by browser. Interaction required."));

  document.getElementById('btn-accept-invite').onclick = () => {
    soundInvite.pause();
    soundInvite.currentTime = 0;
    incomingInviteOverlay.classList.add('hidden');
    socket.emit('invite-accepted', { callerId: callerNumber, targetId: myNumber });
    joinRoom(roomId);
  };
  document.getElementById('btn-reject-invite').onclick = () => {
    soundInvite.pause();
    soundInvite.currentTime = 0;
    incomingInviteOverlay.classList.add('hidden');
    socket.emit('reject-invitation', { targetId: callerNumber });
  };
});

socket.on('invitation-cancelled', ({ callerId, reason }) => {
  if (!incomingInviteOverlay.classList.contains('hidden')) {
    incomingInviteOverlay.classList.add('hidden');
    soundInvite.pause();
    soundInvite.currentTime = 0;
    showToast(`Call from #${callerId} cancelled (${reason}).`);
  }
});

socket.on('missed-call', ({ fromId, fromNickname, timestamp, reason }) => {
  const formattedTime = new Date(timestamp).toLocaleTimeString();
  const message = `${fromNickname || 'Unknown'} (#${fromId}) tried to call you at ${formattedTime} (${reason}).`;
  showToast(message);

  const existing = missedCallCounts.get(fromId) || 0;
  missedCallCounts.set(fromId, existing + 1);

  if (activeChatFriendId === fromId) {
    missedCallCounts.set(fromId, 0);
    refreshFriendsUI();
    const entry = document.createElement('div');
    entry.style.cssText = 'font-size: 12px; color: var(--text-3); margin: 12px 0; text-align: center;';
    entry.textContent = message;
    directChatMessages.appendChild(entry);
    directChatMessages.scrollTop = directChatMessages.scrollHeight;
  } else {
    refreshFriendsUI();
  }
});

socket.on('invitation-rejected', ({ fromId }) => {
  if (dialNumber === fromId) {
    showToast(`Call declined by #${fromId}`);
    soundOutgoingRing.pause();
    soundOutgoingRing.currentTime = 0;
    const ringWrap = document.getElementById(`wrapper-ringing-${fromId}`);
    if (ringWrap) ringWrap.remove();
  }
});

async function joinRoom(roomId) {
  currentRoom = roomId;
  roomCodeDisplay.textContent = roomId;
  const hasMedia = await getMedia();
  switchScreen('room-screen');
  socket.emit('join-room', { roomId, nickname: currentUser.nickname, id: myNumber });
  soundJoinMeeting.play().catch(e => {}); 
}

// Join by code logic
btnJoinByCode.onclick = () => {
  const code = joinRoomInput.value.trim();
  if (code.length < 4) return showToast('Invalid room code');
  joinRoom(code);
};

// Meeting Invite logic
btnOpenInviteModal.onclick = () => {
  meetingInviteModal.classList.remove('hidden');
  inviteNexusIdInput.value = '';
};

btnSendMeetingInvite.onclick = () => {
  const targetId = inviteNexusIdInput.value.trim();
  if (targetId.length !== 6) return showToast('Enter 6-digit target ID');
  if (targetId === myNumber) return showToast('Cannot invite yourself');
  
  socket.emit('invite-friend', { targetId, senderId: myNumber, senderNickname: currentUser.nickname, roomId: currentRoom });
  meetingInviteModal.classList.add('hidden');
  showToast(`Invitation sent to #${targetId}`);
};

function openSettings() {
  settingsModal.classList.remove('hidden');
  
  // Add mic volume control if not exists
  if (!document.getElementById('mic-volume-container')) {
    const container = document.createElement('div');
    container.id = 'mic-volume-container';
    container.style.cssText = 'margin-top: 20px; padding: 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-input);';
    container.innerHTML = `
      <label for="mic-volume" style="display: block; margin-bottom: 8px; font-weight: 600; color: var(--text);">Microphone Volume</label>
      <input type="range" id="mic-volume" min="0" max="2" step="0.1" value="${localStorage.getItem('nexus-mic-volume') || 1}" style="width: 100%;">
      <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 12px; color: var(--text-3);">
        <span>Quiet</span>
        <span id="mic-volume-value">${localStorage.getItem('nexus-mic-volume') || 1}x</span>
        <span>Loud</span>
      </div>
    `;
    settingsModal.appendChild(container);
    
    const micVolumeInput = document.getElementById('mic-volume');
    const micVolumeValue = document.getElementById('mic-volume-value');
    micVolumeInput.oninput = () => {
      const val = parseFloat(micVolumeInput.value);
      micVolumeValue.textContent = val + 'x';
      localStorage.setItem('nexus-mic-volume', val);
      if (micGain) micGain.gain.value = val;
    };
  }
}

socket.on('room-joined', ({ roomId, users }) => {
  users.forEach(u => setupPeer(u.socketId, u.number, u.nickname, true));
  updateParticipantList();
});

socket.on('user-joined', (u) => {
  showToast(`${u.nickname} joined the call`);
  
  // Stop Outgoing ring sound if this is the person we called
  if (u.number === dialNumber) {
    soundOutgoingRing.pause();
    soundOutgoingRing.currentTime = 0;
    const ringWrap = document.getElementById(`wrapper-ringing-${u.number}`);
    if (ringWrap) ringWrap.remove();
  }
  
  soundJoinMeeting.play().catch(e => {});
  setupPeer(u.socketId, u.number, u.nickname, false);
  updateParticipantList();
});

function setupPeer(socketId, number, nickname, isOffer) {
  const pc = new RTCPeerConnection(iceServers);
  peers[socketId] = { pc, number, nickname, videoSender: null, audioGain: null };
  
  // Explicitly add tracks and store the video sender for screensharing updates
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    pc.addTrack(audioTrack, localStream);
  }

  const currentVideoTrack = (isSharingScreen && screenStream) ? screenStream.getVideoTracks()[0] : localStream.getVideoTracks()[0];
  if (currentVideoTrack) {
    peers[socketId].videoSender = pc.addTrack(currentVideoTrack, localStream);
  }
  
  pc.onicecandidate = (e) => {
    if (e.candidate) socket.emit('ice-candidate', { targetSocketId: socketId, candidate: e.candidate });
  };
  
  pc.ontrack = (e) => {
    let wrapper = document.getElementById(`wrapper-${socketId}`);
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'video-wrapper';
      wrapper.id = `wrapper-${socketId}`;
      wrapper.onclick = () => openFullscreenVideo(`video-${socketId}`, nickname);
      wrapper.innerHTML = `
        <video id="video-${socketId}" autoplay playsinline></video>
        <div class="video-label">${nickname} <span style="opacity:0.6;font-size:10px;">#${number}</span></div>
        <div class="video-volume-control">
          <input type="range" class="peer-volume-slider" min="0" max="1" step="0.1" value="1" data-peer="${socketId}">
        </div>
      `;
      videoGrid.appendChild(wrapper);
      
      // Attach volume change handler
      const volumeSlider = wrapper.querySelector('.peer-volume-slider');
      volumeSlider.oninput = () => {
        const gain = parseFloat(volumeSlider.value);
        if (peers[socketId].audioGain) {
          peers[socketId].audioGain.gain.value = gain;
        }
      };
    }
    
    if (e.track.kind === 'audio') {
      // Create gain node for audio volume control
      if (!audioContext) audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(e.streams[0]);
      peers[socketId].audioGain = audioContext.createGain();
      peers[socketId].audioGain.gain.value = 1; // default
      source.connect(peers[socketId].audioGain);
      peers[socketId].audioGain.connect(audioContext.destination);
    } else if (e.track.kind === 'video') {
      const vid = wrapper.querySelector('video');
      vid.srcObject = e.streams[0];
      monitorSpeech(e.streams[0], `wrapper-${socketId}`, socketId);
    }
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
  soundLeaveMeeting.play().catch(e => {});
  updateParticipantList();
});

function updateParticipantList() {
  pList.innerHTML = `<div class="participant-item">
    <div class="participant-avatar" style="background:var(--accent);color:var(--bg);">ME</div>
    <div class="participant-info"><span class="participant-name">You (${currentUser.nickname})</span><span class="participant-id">#${myNumber}</span></div>
    <svg viewBox="0 0 24 24" width="14" fill="none" stroke="var(--success)" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
  </div>`;
  Object.values(peers).forEach(p => {
    const div = document.createElement('div');
    div.className = 'participant-item';
    div.innerHTML = `
      <div class="participant-avatar">${p.nickname.substring(0,1).toUpperCase()}</div>
      <div class="participant-info"><span class="participant-name">${p.nickname}</span><span class="participant-id">#${p.number}</span></div>
      <svg viewBox="0 0 24 24" width="14" fill="none" stroke="var(--success)" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
    `;
    pList.appendChild(div);
  });
}

btnLeave.onclick = () => {
  socket.emit('leave-room');
  soundLeave.play().catch(e => {});
  // Use a very short delay so the sound starts but user feels immediate action
  setTimeout(() => {
    location.reload();
  }, 300);
};

// Chat functionality removed per user request

// Media toggles
btnMute.onclick = () => {
  isAudioMuted = !isAudioMuted;
  localStream.getAudioTracks()[0].enabled = !isAudioMuted;
  btnMute.classList.toggle('active', !isAudioMuted);
  btnMute.querySelector('.icon-mic-on').classList.toggle('hidden', isAudioMuted);
  btnMute.querySelector('.icon-mic-off').classList.toggle('hidden', !isAudioMuted);
};

btnVideo.onclick = () => {
  const videoTrack = localStream.getVideoTracks()[0];
  if (!videoTrack) return showToast('No camera available');
  isVideoMuted = !isVideoMuted;
  videoTrack.enabled = !isVideoMuted;
  btnVideo.classList.toggle('active', !isVideoMuted);
  btnVideo.querySelector('.icon-vid-on').classList.toggle('hidden', isVideoMuted);
  btnVideo.querySelector('.icon-vid-off').classList.toggle('hidden', !isVideoMuted);
};

// Screen sharing
let savedCameraTrack = null; // Store original camera track

btnScreenShare.onclick = async () => {
  if (!isSharingScreen) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = screenStream.getVideoTracks()[0];
      
      let replacedCount = 0;
      for (const [id, p] of Object.entries(peers)) {
        const sender = p.pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          try {
            await sender.replaceTrack(screenTrack);
            replacedCount++;
          } catch (err) {
            console.warn(`replaceTrack failed for peer ${id}, renegotiating...`, err);
            p.pc.removeTrack(sender);
            p.pc.addTrack(screenTrack, localStream);
            const offer = await p.pc.createOffer();
            await p.pc.setLocalDescription(offer);
            socket.emit('offer', { targetSocketId: id, offer, senderNumber: myNumber, senderNickname: currentUser.nickname });
          }
        } else {
          p.pc.addTrack(screenTrack, localStream);
          const offer = await p.pc.createOffer();
          await p.pc.setLocalDescription(offer);
          socket.emit('offer', { targetSocketId: id, offer, senderNumber: myNumber, senderNickname: currentUser.nickname });
        }
      }
      
      localVideo.srcObject = screenStream;
      localVideo.style.objectFit = 'contain';
      document.getElementById('wrapper-local').classList.add('sharing');
      isSharingScreen = true;
      btnScreenShare.classList.add('active');
      showToast(`Screen sharing started`);
      
      socket.emit('screenshare-started');
      screenTrack.onended = () => stopScreenShare();
    } catch (e) {
      console.error('[ScreenShare] Error:', e);
      if (e.name !== 'NotAllowedError') showToast('Screen sharing failed');
    }
  } else {
    stopScreenShare();
  }
};

async function stopScreenShare() {
  if (!isSharingScreen) return;
  isSharingScreen = false;
  btnScreenShare.classList.remove('active');
  document.getElementById('wrapper-local').classList.remove('sharing');
  
  socket.emit('screenshare-stopped');
  
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }
  
  const originalVideoTrack = localStream.getVideoTracks()[0];
  if (originalVideoTrack) {
    for (const [id, p] of Object.entries(peers)) {
      const sender = p.pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        try {
          await sender.replaceTrack(originalVideoTrack);
        } catch (err) {
          p.pc.removeTrack(sender);
          p.pc.addTrack(originalVideoTrack, localStream);
          const offer = await p.pc.createOffer();
          await p.pc.setLocalDescription(offer);
          socket.emit('offer', { targetSocketId: id, offer, senderNumber: myNumber, senderNickname: currentUser.nickname });
        }
      }
    }
  }
  
  localVideo.srcObject = localStream;
  localVideo.style.objectFit = 'cover';
  showToast('Screen sharing stopped');
}

socket.on('screenshare-started', ({ senderSocketId }) => {
  const vid = document.getElementById(`video-${senderSocketId}`);
  if (vid) {
    vid.style.objectFit = 'contain';
    // Force browser to re-bind the decoder to the new track
    const stream = vid.srcObject;
    vid.srcObject = null;
    vid.srcObject = stream;
    vid.play().catch(e => console.error('Play failed:', e));
  }
  showToast(`A peer started screen sharing`);
});

socket.on('screenshare-stopped', ({ senderSocketId }) => {
  const vid = document.getElementById(`video-${senderSocketId}`);
  if (vid) {
    vid.style.objectFit = 'cover';
    // Force browser to re-bind back to the camera track
    const stream = vid.srcObject;
    vid.srcObject = null;
    vid.srcObject = stream;
    vid.play().catch(e => console.error('Play failed:', e));
  }
});

function openFullscreenVideo(vidId, name) {
  const sourceVid = document.getElementById(vidId);
  if (!sourceVid || !sourceVid.srcObject) return;
  
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.95); z-index:40000; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px;';
  modal.innerHTML = `
    <video autoplay playsinline style="max-width:95%; max-height:90%; border-radius:12px; box-shadow: 0 20px 50px rgba(0,0,0,1); object-fit: contain;"></video>
    <div style="color:white; margin-top:20px; font-weight:700; font-size:18px;">${name}</div>
    <button style="position:absolute; top:30px; right:30px; background:white; color:black; border:none; border-radius:50%; width:44px; height:44px; cursor:pointer; font-weight:900;">X</button>
  `;
  const vid = modal.querySelector('video');
  vid.srcObject = sourceVid.srcObject;
  modal.querySelector('button').onclick = () => modal.remove();
  document.body.appendChild(modal);
}

function showVolumeContextMenu(e, id, name) {
  e.preventDefault();
  // Close any existing menus
  const existing = document.querySelector('.context-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.top = `${e.clientY}px`;
  menu.style.left = `${e.clientX}px`;

  const videoEl = document.getElementById(id === 'local' ? 'local-video' : `video-${id}`);
  const currentVol = videoEl ? videoEl.volume : 1;

  menu.innerHTML = `
    <div class="context-menu-item">
      <label class="context-menu-label">${name}</label>
      <div class="volume-control">
        <svg viewBox="0 0 24 24" width="16" fill="none" stroke="var(--text-3)" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
        <input type="range" class="volume-slider" min="0" max="1" step="0.1" value="${currentVol}">
      </div>
    </div>
  `;

  const slider = menu.querySelector('.volume-slider');
  slider.oninput = () => {
    if (videoEl) videoEl.volume = slider.value;
  };

  document.body.appendChild(menu);
}

// Close context menu on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('.context-menu')) {
    const existing = document.querySelector('.context-menu');
    if (existing) existing.remove();
  }
});

// Navigation Delegation
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-screen]');
  if (btn) {
    const screenId = btn.getAttribute('data-screen');
    if (screenId) switchScreen(screenId);
  }
});

checkMe();
loadTheme();
populateDevices();

// ── Screen Picker Handler for Electron ──
if (window.electronBridge) {
  window.electronBridge.onShowScreenPicker((sources) => {
    screenPickerList.innerHTML = '';
    sources.forEach(src => {
      const btn = document.createElement('div');
      btn.className = 'screen-picker-item';
      btn.innerHTML = `
        <img src="${src.thumbnail}">
        <span>${src.name}</span>
      `;
      btn.onclick = () => {
        window.electronBridge.selectScreen(src.id);
        screenPickerModal.classList.add('hidden');
      };
      screenPickerList.appendChild(btn);
    });
    screenPickerModal.classList.remove('hidden');
  });
}

btnClosePicker.onclick = () => {
  if (window.electronBridge) window.electronBridge.cancelScreenPicker();
  screenPickerModal.classList.add('hidden');
};

async function populateDevices() {
  const ds = await navigator.mediaDevices.enumerateDevices();
  ds.forEach(d => {
    const o = document.createElement('option');
    o.value = d.deviceId; o.text = d.label || (d.kind === 'videoinput' ? 'Camera' : 'Mic');
    if (d.kind === 'videoinput') videoSourceSelect.add(o);
    else if (d.kind === 'audioinput') audioSourceSelect.add(o);
  });
}
