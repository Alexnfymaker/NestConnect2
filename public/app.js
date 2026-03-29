const socket = io();

// ═══════════════════════════════════════
//  DOM References
// ═══════════════════════════════════════

// Screens
const loginScreen   = document.getElementById('login-screen');
const mainApp       = document.getElementById('main-app');
const dashboardScreen = document.getElementById('dashboard-screen');
const chatScreen    = document.getElementById('chat-screen');
const roomScreen    = document.getElementById('room-screen');

// Auth UI
const loginEmailInput = document.getElementById('login-email');
const loginPassInput  = document.getElementById('login-password');
const loginNickInput  = document.getElementById('login-nickname');
const nicknameGroup   = document.getElementById('nickname-group');
const btnAuthMain     = document.getElementById('btn-auth-main');
const authTitle       = document.getElementById('auth-title');
const goToRegister    = document.getElementById('go-to-register');
const btnLogout       = document.getElementById('btn-logout');

// Dashboard
const myNumberEl      = document.getElementById('my-number');
const btnHostMeeting  = document.getElementById('btn-host-meeting');
const btnJoinMeeting  = document.getElementById('btn-join-meeting');
const roomCodeInput   = document.getElementById('room-code-input');
const friendIdInput   = document.getElementById('friend-id-input');
const btnAddFriend    = document.getElementById('btn-add-friend');
const pendingRequestsList = document.getElementById('pending-requests');

// Chat
const friendsListContainer = document.getElementById('friends-list');
const chatMessagesContainer = document.getElementById('chat-messages');
const chatHeader       = document.getElementById('chat-header');
const chattingWithLabel = document.getElementById('chatting-with');
const btnInviteFriend  = document.getElementById('btn-invite-friend');
const chatForm         = document.getElementById('chat-form');
const chatInput        = document.getElementById('chat-input');
const btnSendChat      = document.getElementById('btn-send-chat');

// Room
const currentRoomIdEl  = document.getElementById('current-room-id');
const videoGrid        = document.getElementById('video-grid');
const localVideo       = document.getElementById('local-video');
const localNumberLabel = document.getElementById('local-number-label');
const localNicknameLabel = document.getElementById('local-nickname-label');
const btnMute          = document.getElementById('btn-mute');
const btnVideo         = document.getElementById('btn-video');
const btnScreenShare   = document.getElementById('btn-screen-share');
const btnLeave         = document.getElementById('btn-leave');

// Toast
const toastEl = document.getElementById('toast');

// Zoom Modal
const zoomOverlay  = document.getElementById('zoom-overlay');
const zoomVideo    = document.getElementById('zoom-video');
const zoomInfoLabel = document.getElementById('zoom-info-label');
const btnCloseZoom = document.getElementById('btn-close-zoom');

// Volume Modal
const volumeModal      = document.getElementById('volume-modal');
const volumeSlider     = document.getElementById('volume-slider');
const volumePercent    = document.getElementById('volume-percent');
const volumeTargetName = document.getElementById('volume-target-name');
const btnCloseVolume   = document.getElementById('btn-close-volume');

// Incoming Invite
const incomingInviteOverlay = document.getElementById('incoming-invite-overlay');
const inviterNumberEl       = document.getElementById('inviter-number');
const btnRejectInvite       = document.getElementById('btn-reject-invite');
const btnAcceptInvite       = document.getElementById('btn-accept-invite');

// Call Active Pill
const callActivePill = document.getElementById('call-active-pill');

// Sounds
const audioLeave = document.getElementById('audio-leave');
const audioRing  = document.getElementById('audio-ring');

// ═══════════════════════════════════════
//  State
// ═══════════════════════════════════════
let currentUser = null;
let isRegisterMode = false;
let activeChatFriendId = null;
const chatHistory = {}; // friendId -> [{type,msg}]

let myNumber = '';
let currentRoom = null;
let currentInviteRoom = null;
let currentInviter = null;
let currentlyZoomedWrapper = null;
let activeVolumePeerId = null;

let localStream = null;
let screenStream = null;
let isAudioMuted = false;
let isVideoMuted = false;
let isSharingScreen = false;

let audioContext = null;
const speechIntervals = {};
const volumeNodes = {};
const peers = {};

const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ]
};

// ═══════════════════════════════════════
//  Utilities
// ═══════════════════════════════════════
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  toastEl.classList.add('show');
  setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => toastEl.classList.add('hidden'), 300);
  }, 4000);
}

function showScreen(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
  // Show the pill whenever we navigate away from the room screen while in a call
  if (currentRoom && screen.id !== 'room-screen') {
    callActivePill.classList.remove('hidden');
  } else {
    callActivePill.classList.add('hidden');
  }
}

function showAppScreen(screen) {
  showScreen(screen);
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.screen === screen.id);
  });
}

// ═══════════════════════════════════════
//  Auth
// ═══════════════════════════════════════
async function checkMe() {
  try {
    const res = await fetch('/api/me');
    if (res.ok) {
      onLoggedIn(await res.json());
    } else {
      mainApp.classList.add('hidden');
      mainApp.style.display = 'none';
      loginScreen.style.display = 'flex';
      showScreen(loginScreen);
    }
  } catch (e) {
    mainApp.classList.add('hidden');
    mainApp.style.display = 'none';
    loginScreen.style.display = 'flex';
    showScreen(loginScreen);
  }
}

async function handleAuth() {
  const email = loginEmailInput.value.trim();
  const password = loginPassInput.value.trim();
  const nickname = loginNickInput.value.trim();
  if (!email || !password) return showToast('Fill in email & password');
  if (isRegisterMode && !nickname) return showToast('Pick a nickname');

  const endpoint = isRegisterMode ? '/api/register' : '/api/login';
  const body = isRegisterMode ? { email, password, nickname } : { email, password };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.ok) {
      if (isRegisterMode) {
        showToast('Account created! Please login.');
        toggleAuthMode(false);
      } else {
        checkMe();
      }
    } else {
      showToast(data.error || 'Authentication failed');
    }
  } catch (e) {
    showToast('Server error');
  }
}

function onLoggedIn(user) {
  currentUser = user;
  myNumber = user.id;
  myNumberEl.textContent = user.id;
  localNumberLabel.textContent = user.id;
  localNicknameLabel.textContent = user.nickname;

  socket.emit('identify', { id: user.id });

  // Explicitly hide login and show main app
  loginScreen.classList.remove('active');
  loginScreen.style.display = 'none'; // Force hide
  mainApp.classList.remove('hidden');
  mainApp.style.display = 'flex'; // Force show as flex
  
  showAppScreen(dashboardScreen);
  // Directly populate UI from the already-fetched user object, then refresh
  renderFriendsFromUser(user);
  // Also do a full refresh to make sure everything is up to date
  updateFriendsUI();
}

function renderFriendsFromUser(user) {
  // Pending requests on dashboard
  pendingRequestsList.innerHTML = '';
  if (!user.friendRequests || user.friendRequests.length === 0) {
    pendingRequestsList.innerHTML = '<p class="dash-sub" style="margin-top:4px">No pending requests</p>';
  } else {
    user.friendRequests.forEach(rid => {
      const div = document.createElement('div');
      div.className = 'request-item';
      div.innerHTML = `<span>ID: <strong>${rid}</strong></span><button class="btn-accept-small">Accept</button>`;
      div.querySelector('button').onclick = () => acceptFriend(rid);
      pendingRequestsList.appendChild(div);
    });
  }

  // Friends list in chat sidebar
  friendsListContainer.innerHTML = '';
  if (!user.friends || user.friends.length === 0) {
    friendsListContainer.innerHTML = '<p class="dash-sub" style="padding:20px">No friends yet — add one via ID!</p>';
  } else {
    user.friends.forEach(fid => {
      const div = document.createElement('div');
      div.className = `friend-item ${activeChatFriendId === fid ? 'active' : ''}`;
      const initials = fid.substring(0, 2);
      div.innerHTML = `
        <div class="friend-avatar">${initials}</div>
        <div class="friend-info">
          <span class="friend-name">Friend #${fid}</span>
          <span class="friend-status">Click to chat</span>
        </div>`;
      div.onclick = () => selectChat(fid);
      friendsListContainer.appendChild(div);
    });
  }
}

function toggleAuthMode(reg) {
  isRegisterMode = reg;
  authTitle.textContent = reg ? 'Create Account' : 'Login to NestConnect';
  btnAuthMain.textContent = reg ? 'Register' : 'Login';
  nicknameGroup.classList.toggle('hidden', !reg);
  document.getElementById('toggle-text').innerHTML = reg
    ? 'Already have an account? <a href="#" id="go-to-register">Login</a>'
    : 'Don\'t have an account? <a href="#" id="go-to-register">Register</a>';
  document.getElementById('go-to-register').onclick = (e) => {
    e.preventDefault();
    toggleAuthMode(!isRegisterMode);
  };
}

btnAuthMain.addEventListener('click', handleAuth);
// Allow Enter key to submit auth form
loginPassInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleAuth(); });
loginEmailInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleAuth(); });

goToRegister.addEventListener('click', e => { e.preventDefault(); toggleAuthMode(!isRegisterMode); });
btnLogout.addEventListener('click', async () => { await fetch('/api/logout', { method: 'POST' }); location.reload(); });

// ═══════════════════════════════════════
//  Navigation
// ═══════════════════════════════════════
// Return to active call from anywhere (called via onclick on the pill)
function returnToCall() {
  if (currentRoom) {
    showAppScreen(roomScreen);
  }
}
window.returnToCall = returnToCall;

document.querySelectorAll('.nav-link').forEach(link => {
  link.onclick = (e) => {
    e.preventDefault();
    const targetId = e.currentTarget.dataset.screen;
    if (targetId) {
      showAppScreen(document.getElementById(targetId));
      if (targetId === 'chat-screen') updateFriendsUI();
    }
  };
});

// ═══════════════════════════════════════
//  Friends & Chat
// ═══════════════════════════════════════
async function updateFriendsUI() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) return;
    const user = await res.json();
    currentUser = user;

    // Pending requests on dashboard
    pendingRequestsList.innerHTML = '';
    if (user.friendRequests.length === 0) {
      pendingRequestsList.innerHTML = '<p class="dash-sub" style="margin-top:4px">No pending requests</p>';
    } else {
      user.friendRequests.forEach(rid => {
        const div = document.createElement('div');
        div.className = 'request-item';
        div.innerHTML = `<span>ID: <strong>${rid}</strong></span><button class="btn-accept-small">Accept</button>`;
        div.querySelector('button').onclick = () => acceptFriend(rid);
        pendingRequestsList.appendChild(div);
      });
    }

    // Friends list in chat sidebar
    friendsListContainer.innerHTML = '';
    if (user.friends.length === 0) {
      friendsListContainer.innerHTML = '<p class="dash-sub" style="padding:20px">No friends yet — add one via ID!</p>';
    } else {
      user.friends.forEach(fid => {
        const div = document.createElement('div');
        div.className = `friend-item ${activeChatFriendId === fid ? 'active' : ''}`;
        const initials = fid.substring(0, 2);
        div.innerHTML = `
          <div class="friend-avatar">${initials}</div>
          <div class="friend-info">
            <span class="friend-name">Friend #${fid}</span>
            <span class="friend-status">Click to chat</span>
          </div>`;
        div.onclick = () => selectChat(fid);
        friendsListContainer.appendChild(div);
      });
    }
  } catch (e) {
    console.error('Failed to update friends UI', e);
  }
}

async function addFriend() {
  const targetId = friendIdInput.value.trim();
  if (targetId.length !== 6) return showToast('Enter a valid 6-digit ID');
  if (targetId === myNumber) return showToast('You can\'t add yourself');
  try {
    const res = await fetch('/api/friends/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetId })
    });
    const d = await res.json();
    if (res.ok) { showToast('Friend request sent!'); friendIdInput.value = ''; }
    else showToast(d.error || 'Failed to send request');
  } catch (e) { showToast('Server error'); }
}

async function acceptFriend(senderId) {
  try {
    const res = await fetch('/api/friends/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderId })
    });
    if (res.ok) { showToast('Friend accepted!'); updateFriendsUI(); }
  } catch (e) { showToast('Server error'); }
}

btnAddFriend.onclick = addFriend;

function selectChat(fid) {
  activeChatFriendId = fid;
  updateFriendsUI();
  chatHeader.classList.remove('hidden');
  chatForm.classList.remove('hidden');
  btnInviteFriend.classList.remove('hidden');
  chattingWithLabel.textContent = `Friend #${fid}`;

  // Restore chat history
  chatMessagesContainer.innerHTML = '';
  const history = chatHistory[fid] || [];
  if (history.length === 0) {
    chatMessagesContainer.innerHTML = '<div class="no-chat-selected">No messages yet — say hi!</div>';
  } else {
    history.forEach(h => addChatBubble(h.type, h.msg, false));
  }
}

function addChatBubble(type, msg, save = true) {
  // Remove the placeholder if present
  const placeholder = chatMessagesContainer.querySelector('.no-chat-selected');
  if (placeholder) placeholder.remove();

  const div = document.createElement('div');
  div.className = `chat-bubble ${type}`;
  div.textContent = msg;
  chatMessagesContainer.appendChild(div);
  chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

  if (save && activeChatFriendId) {
    if (!chatHistory[activeChatFriendId]) chatHistory[activeChatFriendId] = [];
    chatHistory[activeChatFriendId].push({ type, msg });
  }
}

btnSendChat.onclick = sendChatMessage;
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendChatMessage(); });

function sendChatMessage() {
  const msg = chatInput.value.trim();
  if (!msg || !activeChatFriendId) return;
  socket.emit('send-chat-msg', { targetId: activeChatFriendId, message: msg, senderNickname: currentUser.nickname });
  addChatBubble('local', msg);
  chatInput.value = '';
}

socket.on('receive-chat-msg', ({ senderId, senderNickname, message }) => {
  // Save to history
  if (!chatHistory[senderId]) chatHistory[senderId] = [];
  chatHistory[senderId].push({ type: 'remote', msg: message });

  if (activeChatFriendId === senderId) {
    addChatBubble('remote', message, false); // already saved above
  } else {
    showToast(`${senderNickname}: ${message}`);
  }
});

// ═══════════════════════════════════════
//  Media
// ═══════════════════════════════════════
function createDummyVideoTrack() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 480;
    const ctx = canvas.getContext('2d');
    const drawInterval = setInterval(() => {
      ctx.fillStyle = '#111111';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ffffff'; ctx.font = '30px Arial'; ctx.textAlign = 'center';
      ctx.fillText('Camera Off', canvas.width / 2, canvas.height / 2);
    }, 100);
    const stream = canvas.captureStream ? canvas.captureStream(10) : canvas.mozCaptureStream(10);
    const track = stream.getVideoTracks()[0];
    const originalStop = track.stop.bind(track);
    track.stop = () => { clearInterval(drawInterval); originalStop(); };
    return track;
  } catch (e) { return null; }
}

async function getMedia() {
  if (!navigator.mediaDevices) {
    showToast('Browser blocked camera/mic (HTTPS required).');
    return false;
  }
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
    if (!localStream.getVideoTracks().length) {
      const dummy = createDummyVideoTrack();
      if (dummy) localStream.addTrack(dummy);
    }
    localVideo.srcObject = localStream;
    toggleAudio(false);
    toggleVideo(false);
    monitorSpeech(localStream, 'wrapper-local', 'local');
    return true;
  } catch (err) {
    console.warn('No video+audio, trying audio only...');
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      const dummy = createDummyVideoTrack();
      if (dummy) localStream.addTrack(dummy);
      localVideo.srcObject = localStream;
      toggleVideo(true);
      monitorSpeech(localStream, 'wrapper-local', 'local');
      showToast('Camera not available — audio only.');
      return true;
    } catch (err2) {
      showToast('Failed to access camera/microphone.');
      return false;
    }
  }
}

function stopMedia() {
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
  localVideo.srcObject = null;
}

// ═══════════════════════════════════════
//  Audio/Video Toggles
// ═══════════════════════════════════════
function toggleAudio(forceMute = null) {
  if (!localStream) return;
  isAudioMuted = forceMute !== null ? forceMute : !isAudioMuted;
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) audioTrack.enabled = !isAudioMuted;
  const iconOn = btnMute.querySelector('.icon-mic-on');
  const iconOff = btnMute.querySelector('.icon-mic-off');
  if (isAudioMuted) { iconOn.classList.add('hidden'); iconOff.classList.remove('hidden'); btnMute.classList.add('disabled'); }
  else { iconOn.classList.remove('hidden'); iconOff.classList.add('hidden'); btnMute.classList.remove('disabled'); }
}

function toggleVideo(forceMute = null) {
  if (!localStream) return;
  if (isSharingScreen) { showToast('Cannot toggle camera while sharing screen'); return; }
  isVideoMuted = forceMute !== null ? forceMute : !isVideoMuted;
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) videoTrack.enabled = !isVideoMuted;
  const iconOn = btnVideo.querySelector('.icon-vid-on');
  const iconOff = btnVideo.querySelector('.icon-vid-off');
  if (isVideoMuted) { iconOn.classList.add('hidden'); iconOff.classList.remove('hidden'); btnVideo.classList.add('disabled'); }
  else { iconOn.classList.remove('hidden'); iconOff.classList.add('hidden'); btnVideo.classList.remove('disabled'); }
}

btnMute.addEventListener('click', () => toggleAudio());
btnVideo.addEventListener('click', () => toggleVideo());

// ═══════════════════════════════════════
//  Screen Sharing
// ═══════════════════════════════════════
async function startScreenShare() {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    isSharingScreen = true;
    const newVideoTrack = screenStream.getVideoTracks()[0];
    for (const [targetSocketId, peer] of Object.entries(peers)) {
      const sender = peer.pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        try { await sender.replaceTrack(newVideoTrack); }
        catch (err) {
          peer.pc.removeTrack(sender);
          peer.pc.addTrack(newVideoTrack, localStream);
          const offer = await peer.pc.createOffer();
          await peer.pc.setLocalDescription(offer);
          socket.emit('offer', { targetSocketId, offer, senderNumber: myNumber, senderNickname: currentUser.nickname });
        }
      }
    }
    localVideo.srcObject = screenStream;
    document.getElementById('wrapper-local').classList.add('sharing');
    newVideoTrack.onended = stopScreenShare;
  } catch (e) {
    if (e.name !== 'NotAllowedError') showToast('Screen sharing failed');
  }
}

async function stopScreenShare() {
  if (!isSharingScreen) return;
  isSharingScreen = false;
  const originalVideoTrack = localStream.getVideoTracks()[0];
  for (const [targetSocketId, peer] of Object.entries(peers)) {
    const sender = peer.pc.getSenders().find(s => s.track && s.track.kind === 'video');
    if (sender && originalVideoTrack) {
      try { await sender.replaceTrack(originalVideoTrack); }
      catch (err) { console.warn('replaceTrack fail on stop share', err); }
    }
  }
  localVideo.srcObject = localStream;
  document.getElementById('wrapper-local').classList.remove('sharing');
  if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
}

btnScreenShare.addEventListener('click', () => isSharingScreen ? stopScreenShare() : startScreenShare());

// ═══════════════════════════════════════
//  Speech Monitoring (GainNode per peer)
// ═══════════════════════════════════════
function monitorSpeech(stream, wrapperId, peerId = 'local') {
  if (!stream.getAudioTracks().length) return;
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') audioContext.resume();
  if (speechIntervals[peerId]) clearInterval(speechIntervals[peerId]);

  try {
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.5;
    const source = audioContext.createMediaStreamSource(stream);

    if (peerId !== 'local') {
      let gainNode = volumeNodes[peerId];
      if (!gainNode) {
        gainNode = audioContext.createGain();
        gainNode.gain.value = 1.0;
        volumeNodes[peerId] = gainNode;
      }
      source.connect(gainNode);
      gainNode.connect(analyser);
      analyser.connect(audioContext.destination);
      const videoEl = document.getElementById(`video-${peerId}`);
      if (videoEl) videoEl.muted = true;
    } else {
      source.connect(analyser);
    }

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    speechIntervals[peerId] = setInterval(() => {
      const wrapper = document.getElementById(wrapperId);
      if (!wrapper) { clearInterval(speechIntervals[peerId]); return; }
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const average = sum / dataArray.length;
      if (average > 10) wrapper.classList.add('is-speaking');
      else wrapper.classList.remove('is-speaking');
    }, 150);
  } catch (err) { console.error('Speech monitor error:', err); }
}

// ═══════════════════════════════════════
//  WebRTC Mesh
// ═══════════════════════════════════════
function createPeerConnection(targetSocketId, targetNumber) {
  const pc = new RTCPeerConnection(iceServers);
  const pendingIceCandidates = [];

  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) pc.addTrack(audioTrack, localStream);
    const videoTrack = isSharingScreen && screenStream ? screenStream.getVideoTracks()[0] : localStream.getVideoTracks()[0];
    if (videoTrack) pc.addTrack(videoTrack, localStream);
  }

  pc.onicecandidate = (event) => {
    if (event.candidate) socket.emit('ice-candidate', { targetSocketId, candidate: event.candidate });
  };

  pc.ontrack = (event) => {
    let videoEl = document.getElementById(`video-${targetSocketId}`);
    if (!videoEl) {
      addVideoStream(targetSocketId, targetNumber);
      videoEl = document.getElementById(`video-${targetSocketId}`);
    }
    videoEl.srcObject = event.streams[0];
    monitorSpeech(event.streams[0], `wrapper-${targetSocketId}`, targetSocketId);
  };

  peers[targetSocketId] = { pc, pendingIceCandidates, targetNumber };
  return pc;
}

function destroyPeerConnection(targetSocketId) {
  if (peers[targetSocketId]) { peers[targetSocketId].pc.close(); delete peers[targetSocketId]; }
  if (speechIntervals[targetSocketId]) { clearInterval(speechIntervals[targetSocketId]); delete speechIntervals[targetSocketId]; }
  delete volumeNodes[targetSocketId];
  const wrapper = document.getElementById(`wrapper-${targetSocketId}`);
  if (wrapper) wrapper.remove();
}

function addVideoStream(socketId, number, nickname = 'User') {
  if (document.getElementById(`wrapper-${socketId}`)) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'video-wrapper glass-panel';
  wrapper.id = `wrapper-${socketId}`;
  wrapper.innerHTML = `
    <video id="video-${socketId}" autoplay playsinline></video>
    <div class="video-label">${nickname} (${number})</div>
  `;

  // Left click -> zoom modal
  wrapper.addEventListener('click', () => openZoomModal(wrapper, `${nickname} (${number})`));

  // Right click -> volume control
  wrapper.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (socketId === 'local') return;
    activeVolumePeerId = socketId;
    volumeTargetName.textContent = `${nickname} (${number})`;
    const currentVol = volumeNodes[socketId] ? volumeNodes[socketId].gain.value : 1.0;
    volumeSlider.value = currentVol;
    volumePercent.textContent = Math.round(currentVol * 100) + '%';
    volumeModal.classList.remove('hidden');
  });

  videoGrid.appendChild(wrapper);
}

// ═══════════════════════════════════════
//  Zoom Modal
// ═══════════════════════════════════════
function openZoomModal(wrapper, infoText) {
  const originalVideo = wrapper.querySelector('video');
  if (!originalVideo || !originalVideo.srcObject) return;
  zoomVideo.srcObject = originalVideo.srcObject;
  zoomInfoLabel.textContent = infoText;
  if (wrapper.id === 'wrapper-local' && !isSharingScreen) zoomVideo.style.transform = 'scaleX(-1)';
  else zoomVideo.style.transform = 'none';
  zoomOverlay.classList.remove('hidden');
  currentlyZoomedWrapper = wrapper;
}

function closeZoomModal() {
  zoomOverlay.classList.add('hidden');
  zoomVideo.srcObject = null;
  currentlyZoomedWrapper = null;
}

btnCloseZoom.addEventListener('click', closeZoomModal);
zoomOverlay.addEventListener('click', (e) => { if (e.target === zoomOverlay) closeZoomModal(); });

// Local video zoom
document.getElementById('wrapper-local').addEventListener('click', function () {
  const label = localNicknameLabel.textContent;
  const num = localNumberLabel.textContent;
  openZoomModal(this, `${label} (${num})`);
});

// ═══════════════════════════════════════
//  Room Logic
// ═══════════════════════════════════════
function leaveRoom() {
  socket.emit('leave-room');
  Object.keys(peers).forEach(id => destroyPeerConnection(id));
  stopMedia();
  isSharingScreen = false;
  currentRoom = null;
  currentRoomIdEl.textContent = '';
  // Play leave sound
  try { audioLeave.currentTime = 0; audioLeave.play().catch(() => {}); } catch(e) {}
  showAppScreen(dashboardScreen);
}

// Dashboard buttons
btnHostMeeting.addEventListener('click', async () => {
  const hasMedia = await getMedia();
  if (!hasMedia) return;
  socket.emit('create-room', { 
    nickname: currentUser.nickname, 
    id: currentUser.id 
  });
});

btnJoinMeeting.addEventListener('click', async () => {
  const code = roomCodeInput.value.trim();
  if (!code) return showToast('Enter a room code');
  const hasMedia = await getMedia();
  if (!hasMedia) return;
  socket.emit('join-room', { roomId: code, nickname: currentUser.nickname, id: myNumber });
});

btnLeave.addEventListener('click', () => {
  if (confirm('Leave the meeting?')) leaveRoom();
});

// Chat invite friend to current meeting
btnInviteFriend.addEventListener('click', () => {
  if (!currentRoom) {
    // Create a meeting first, then invite
    (async () => {
      const hasMedia = await getMedia();
      if (!hasMedia) return;
      socket.emit('create-room', { nickname: currentUser.nickname, id: myNumber });
      // We'll send the invite after room-created fires (see socket handler below)
      showToast('Creating meeting...');
    })();
    return;
  }
  socket.emit('invite-friend', { targetId: activeChatFriendId, roomId: currentRoom, senderNickname: currentUser.nickname, senderId: myNumber });
  showToast('Meeting invite sent!');
});

// ═══════════════════════════════════════
//  Socket Events — Room
// ═══════════════════════════════════════
socket.on('room-created', ({ roomId }) => {
  currentRoom = roomId;
  currentRoomIdEl.textContent = roomId;
  showScreen(roomScreen);

  // If we were trying to invite a friend, do it now
  if (activeChatFriendId) {
    socket.emit('invite-friend', { targetId: activeChatFriendId, roomId: currentRoom, senderNickname: currentUser.nickname, senderId: myNumber });
    showToast(`Invite sent to #${activeChatFriendId}`);
  }
});

socket.on('room-joined', ({ roomId, users }) => {
  currentRoom = roomId;
  currentRoomIdEl.textContent = roomId;
  showScreen(roomScreen);
  users.forEach(user => {
    addVideoStream(user.socketId, user.number, user.nickname);
    createPeerConnection(user.socketId, user.number);
  });
});

socket.on('user-joined', async ({ socketId, number, nickname }) => {
  showToast(`${nickname || 'User'} joined the meeting`);
  addVideoStream(socketId, number, nickname);
  const pc = createPeerConnection(socketId, number);
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('offer', { targetSocketId: socketId, offer, senderNumber: myNumber, senderNickname: currentUser.nickname });
  } catch (err) { console.error('Failed creating offer', err); }
});

socket.on('user-left', ({ socketId, number }) => {
  showToast(`User ${number || ''} left`);
  destroyPeerConnection(socketId);
});

// ═══════════════════════════════════════
//  Socket Events — WebRTC Signaling
// ═══════════════════════════════════════
socket.on('offer', async ({ senderSocketId, senderNumber, senderNickname, offer }) => {
  let peer = peers[senderSocketId];
  if (!peer) {
    addVideoStream(senderSocketId, senderNumber, senderNickname);
    createPeerConnection(senderSocketId, senderNumber);
    peer = peers[senderSocketId];
  }
  try {
    await peer.pc.setRemoteDescription(new RTCSessionDescription(offer));
    for (const c of peer.pendingIceCandidates) {
      try { await peer.pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) {}
    }
    peer.pendingIceCandidates = [];
    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);
    socket.emit('answer', { targetSocketId: senderSocketId, answer });
  } catch (err) { console.error('Error handling offer', err); }
});

socket.on('answer', async ({ senderSocketId, answer }) => {
  const peer = peers[senderSocketId];
  if (peer) {
    try {
      await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
      for (const c of peer.pendingIceCandidates) {
        try { await peer.pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) {}
      }
      peer.pendingIceCandidates = [];
    } catch (err) { console.error('Error handling answer', err); }
  }
});

socket.on('ice-candidate', async ({ senderSocketId, candidate }) => {
  const peer = peers[senderSocketId];
  if (peer) {
    if (peer.pc.remoteDescription) {
      try { await peer.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (err) { console.error(err); }
    } else {
      peer.pendingIceCandidates.push(candidate);
    }
  }
});

// ═══════════════════════════════════════
//  Socket Events — Invitations
// ═══════════════════════════════════════
socket.on('invitation', ({ callerNickname, callerNumber, roomId }) => {
  currentInviteRoom = roomId;
  currentInviter = callerNumber;
  inviterNumberEl.textContent = `${callerNickname} (${callerNumber})`;
  incomingInviteOverlay.classList.remove('hidden');
  // Play ring sound on loop
  try { audioRing.currentTime = 0; audioRing.play().catch(() => {}); } catch(e) {}
});

btnAcceptInvite.addEventListener('click', async () => {
  incomingInviteOverlay.classList.add('hidden');
  // Stop ring sound
  try { audioRing.pause(); audioRing.currentTime = 0; } catch(e) {}
  const hasMedia = await getMedia();
  if (!hasMedia) return;
  socket.emit('join-room', { roomId: currentInviteRoom, nickname: currentUser.nickname, id: myNumber });
});

btnRejectInvite.addEventListener('click', () => {
  incomingInviteOverlay.classList.add('hidden');
  // Stop ring sound
  try { audioRing.pause(); audioRing.currentTime = 0; } catch(e) {}
  currentInviteRoom = null;
  currentInviter = null;
});

socket.on('call-error', ({ message }) => {
  showToast(message);
  if (!currentRoom) stopMedia();
});

// ═══════════════════════════════════════
//  Volume Control
// ═══════════════════════════════════════
volumeSlider.addEventListener('input', () => {
  const val = parseFloat(volumeSlider.value);
  volumePercent.textContent = Math.round(val * 100) + '%';
  if (activeVolumePeerId && volumeNodes[activeVolumePeerId]) {
    volumeNodes[activeVolumePeerId].gain.value = val;
  }
});

btnCloseVolume.addEventListener('click', () => {
  volumeModal.classList.add('hidden');
  activeVolumePeerId = null;
});

// ═══════════════════════════════════════
//  Theme Toggle
// ═══════════════════════════════════════
document.getElementById('btn-theme-toggle').addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
});

// ═══════════════════════════════════════
//  Bootstrap
// ═══════════════════════════════════════
checkMe();
