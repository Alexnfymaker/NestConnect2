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
  document.getElementById('my-number-header').textContent = user.id;
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
      user.friends.forEach(friend => {
        const fid = friend.id;
        const fname = friend.nickname;
        const initials = fname.substring(0, 2).toUpperCase();
        const card = document.createElement('div');
        card.className = 'contact-card';
        card.innerHTML = `
          <div class="contact-avatar">${initials}</div>
          <h3 style="font-size: 16px; margin-bottom: 4px;">${fname}</h3>
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

// Real-time Social Listeners
socket.on('friend-request-received', ({ fromNickname }) => {
  showToast(`New friend request from ${fromNickname}!`);
  refreshFriendsUI();
});

socket.on('friend-request-accepted', ({ nickname }) => {
  showToast(`${nickname} accepted your friend request!`);
  refreshFriendsUI();
});

socket.on('friend-online', ({ id }) => { refreshFriendsUI(); });
socket.on('friend-offline', ({ id }) => { refreshFriendsUI(); });

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
  }
});

window.openDirectChat = openDirectChat;
window.closeDirectChat = closeDirectChat;

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
    // Fallback: try audio-only if video fails
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
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
  joinRoom(roomId);
});

socket.on('invitation', ({ callerNumber, callerNickname, roomId }) => {
  inviterNumberEl.textContent = callerNickname || callerNumber;
  incomingInviteOverlay.classList.remove('hidden');
  
  // Play incoming call sound
  soundInvite.play().catch(e => console.log("Audio play blocked by browser. Interaction required."));

  document.getElementById('btn-accept-invite').onclick = () => {
    soundInvite.pause();
    soundInvite.currentTime = 0;
    incomingInviteOverlay.classList.add('hidden');
    joinRoom(roomId);
  };
  document.getElementById('btn-reject-invite').onclick = () => {
    soundInvite.pause();
    soundInvite.currentTime = 0;
    incomingInviteOverlay.classList.add('hidden');
    socket.emit('reject-invitation', { targetId: callerNumber });
  };
});

socket.on('invitation-rejected', ({ fromNumber }) => {
  if (dialNumber === fromNumber) {
    showToast(`Call declined by #${fromNumber}`);
    soundOutgoingRing.pause();
    soundOutgoingRing.currentTime = 0;
    const ringWrap = document.getElementById(`wrapper-ringing-${fromNumber}`);
    if (ringWrap) ringWrap.remove();
  }
});

async function joinRoom(roomId) {
  currentRoom = roomId;
  const hasMedia = await getMedia();
  switchScreen('room-screen');
  socket.emit('join-room', { roomId, nickname: currentUser.nickname, id: myNumber });
  soundJoinMeeting.play().catch(e => {}); 
}

function openSettings() {
  document.getElementById('settings-modal').classList.remove('hidden');
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
  peers[socketId] = { pc, number, nickname };
  
  // If currently screen sharing, send the screen track instead of camera
  if (isSharingScreen && screenStream) {
    const screenVideoTrack = screenStream.getVideoTracks()[0];
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) pc.addTrack(audioTrack, localStream);
    if (screenVideoTrack) pc.addTrack(screenVideoTrack, screenStream);
  } else {
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
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
      wrapper.onclick = () => openFullscreenVideo(e.streams[0], nickname);
      wrapper.oncontextmenu = (ev) => showVolumeContextMenu(ev, socketId, nickname);
      wrapper.innerHTML = `<video id="video-${socketId}" autoplay playsinline></video><div class="video-label">${nickname} <span style="opacity:0.6;font-size:10px;">#${number}</span></div>`;
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

function findVideoSender(pc) {
  // Try by current track first
  let sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
  if (sender) return sender;
  // Fallback: find by transceiver mid for video
  if (pc.getTransceivers) {
    const transceiver = pc.getTransceivers().find(t => t.sender && t.receiver && t.receiver.track && t.receiver.track.kind === 'video');
    if (transceiver) return transceiver.sender;
  }
  // Last resort: return the first sender (there's usually audio first, video second)
  const senders = pc.getSenders();
  if (senders.length >= 2) return senders[1]; // video is typically second
  return senders[0] || null;
}

btnScreenShare.onclick = async () => {
  if (!isSharingScreen) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = screenStream.getVideoTracks()[0];
      
      // Save the original camera track before replacing
      savedCameraTrack = localStream.getVideoTracks()[0];
      
      // Replace the video track in every peer connection
      let replacedCount = 0;
      for (const [id, p] of Object.entries(peers)) {
        const sender = findVideoSender(p.pc);
        if (sender) {
          try {
            await sender.replaceTrack(screenTrack);
            replacedCount++;
            console.log(`[ScreenShare] Replaced track for peer ${id}`);
          } catch (err) {
            console.error(`[ScreenShare] Failed to replace track for peer ${id}:`, err);
          }
        } else {
          console.warn(`[ScreenShare] No video sender found for peer ${id}`);
        }
      }
      
      // Show screen in local preview
      localVideo.srcObject = screenStream;
      isSharingScreen = true;
      btnScreenShare.classList.add('active');
      showToast(`Screen sharing started (${replacedCount} peer(s))`);
      
      // Auto-stop when user clicks "Stop sharing" in browser UI
      screenTrack.onended = () => stopScreenShare();
    } catch (e) {
      console.error('[ScreenShare] Error:', e);
      showToast('Screen sharing cancelled');
    }
  } else {
    stopScreenShare();
  }
};

async function stopScreenShare() {
  if (!isSharingScreen) return;
  isSharingScreen = false;
  btnScreenShare.classList.remove('active');
  
  // Stop screen stream tracks
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }
  
  // Restore the saved camera track to all peers
  if (savedCameraTrack) {
    for (const [id, p] of Object.entries(peers)) {
      const sender = findVideoSender(p.pc);
      if (sender) {
        try {
          await sender.replaceTrack(savedCameraTrack);
          console.log(`[ScreenShare] Restored camera for peer ${id}`);
        } catch (err) {
          console.error(`[ScreenShare] Failed to restore camera for peer ${id}:`, err);
        }
      }
    }
  }
  
  // Restore local preview
  localVideo.srcObject = localStream;
  showToast('Screen sharing stopped');
}

function openFullscreenVideo(stream, name) {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.9); z-index:20000; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px;';
  modal.innerHTML = `
    <video autoplay playsinline style="max-width:90%; max-height:85%; border-radius:12px; box-shadow: 0 20px 50px rgba(0,0,0,1)"></video>
    <div style="color:white; margin-top:20px; font-weight:700; font-size:18px;">${name}</div>
    <button style="position:absolute; top:30px; right:30px; background:white; color:black; border:none; border-radius:50%; width:44px; height:44px; cursor:pointer; font-weight:900;">X</button>
  `;
  const vid = modal.querySelector('video');
  vid.srcObject = stream;
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
async function populateDevices() {
  const ds = await navigator.mediaDevices.enumerateDevices();
  ds.forEach(d => {
    const o = document.createElement('option');
    o.value = d.deviceId; o.text = d.label || (d.kind === 'videoinput' ? 'Camera' : 'Mic');
    if (d.kind === 'videoinput') videoSourceSelect.add(o);
    else if (d.kind === 'audioinput') audioSourceSelect.add(o);
  });
}
