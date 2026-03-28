const socket = io();

// UI Elements
const dashboardScreen = document.getElementById('dashboard-screen');
const roomScreen = document.getElementById('room-screen');
const myNumberEl = document.getElementById('my-number');
const currentRoomIdEl = document.getElementById('current-room-id');
const videoGrid = document.getElementById('video-grid');
const localVideo = document.getElementById('local-video');
const localNumberLabel = document.getElementById('local-number-label');

const btnHostMeeting = document.getElementById('btn-host-meeting');
const btnJoinMeeting = document.getElementById('btn-join-meeting');
const roomCodeInput = document.getElementById('room-code-input');
const btnMute = document.getElementById('btn-mute');
const btnVideo = document.getElementById('btn-video');
const btnScreenShare = document.getElementById('btn-screen-share');
const btnLeave = document.getElementById('btn-leave');

const btnOpenInvite = document.getElementById('btn-open-invite');
const inviteModal = document.getElementById('invite-modal');
const btnCancelInvite = document.getElementById('btn-cancel-invite');
const btnSendInvite = document.getElementById('btn-send-invite');
const inviteNumberInput = document.getElementById('invite-number');

const incomingInviteOverlay = document.getElementById('incoming-invite-overlay');
const inviterNumberEl = document.getElementById('inviter-number');
const btnRejectInvite = document.getElementById('btn-reject-invite');
const btnAcceptInvite = document.getElementById('btn-accept-invite');

const toastEl = document.getElementById('toast');

// State
let myNumber = '';
let currentRoom = null;
let currentInviteRoom = null;
let currentInviter = null;

let localStream = null;
let screenStream = null;
let isAudioMuted = false;
let isVideoMuted = false;
let isSharingScreen = false;

let audioContext = null;
const speechIntervals = {};

// Dictionary map of socket.id -> RTCPeerConnection and Video Element data
const peers = {}; 

const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ]
};

// Utils
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
  dashboardScreen.classList.remove('active');
  roomScreen.classList.remove('active');
  screen.classList.add('active');
}

function monitorSpeech(stream, wrapperId, peerId = 'local') {
  if (!stream.getAudioTracks().length) return; 

  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === 'suspended') audioContext.resume();

  if (speechIntervals[peerId]) clearInterval(speechIntervals[peerId]);

  try {
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.5;
    
    // Create source from the stream directly
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser); 
    
    // Fix for Chrome/Edge WebRTC audio bug: WebAudio API intercepts the remote stream and mutes it.
    // We must route remote streams explicitly to the speakers.
    if (peerId !== 'local') {
      analyser.connect(audioContext.destination);
      const videoEl = document.getElementById(`video-${peerId}`);
      if (videoEl) videoEl.muted = true; // prevent double playback
    }
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    speechIntervals[peerId] = setInterval(() => {
      const wrapper = document.getElementById(wrapperId);
      if (!wrapper) {
        clearInterval(speechIntervals[peerId]);
        return;
      }
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const average = sum / dataArray.length;
      
      // Threshold for speaking
      if (average > 10) wrapper.classList.add('is-speaking');
      else wrapper.classList.remove('is-speaking');
    }, 150);
  } catch (err) {
    console.error('Error attaching speech monitor:', err);
  }
}

// Media
async function getMedia() {
  if (!navigator.mediaDevices) {
    showToast('Browser blocked camera/mic (Requires secure HTTPS or localhost).');
    return false;
  }
  
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
    localVideo.srcObject = localStream;
    // Set fallback video state
    toggleAudio(false);
    toggleVideo(false);
    monitorSpeech(localStream, 'wrapper-local', 'local');
    return true;
  } catch (err) {
    console.warn('Could not get video+audio, trying audio only...');
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      localVideo.srcObject = localStream;
      toggleVideo(true); // Force mute UI
      monitorSpeech(localStream, 'wrapper-local', 'local');
      showToast('Camera not available, starting with Audio only.');
      return true;
    } catch (err2) {
      showToast('Failed to access camera/microphone.');
      return false;
    }
  }
}

function stopMedia() {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }
  localVideo.srcObject = null;
}

function toggleAudio(forceMute = null) {
  if (!localStream) return;
  isAudioMuted = forceMute !== null ? forceMute : !isAudioMuted;
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) audioTrack.enabled = !isAudioMuted;
  
  const iconOn = btnMute.querySelector('.icon-mic-on');
  const iconOff = btnMute.querySelector('.icon-mic-off');
  
  if (isAudioMuted) {
    iconOn.classList.add('hidden');
    iconOff.classList.remove('hidden');
    btnMute.classList.add('disabled');
  } else {
    iconOn.classList.remove('hidden');
    iconOff.classList.add('hidden');
    btnMute.classList.remove('disabled');
  }
}

function toggleVideo(forceMute = null) {
  if (!localStream) return;
  if (isSharingScreen) {
    showToast('Cannot toggle camera while sharing screen');
    return;
  }
  isVideoMuted = forceMute !== null ? forceMute : !isVideoMuted;
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) videoTrack.enabled = !isVideoMuted;
  
  const iconOn = btnVideo.querySelector('.icon-vid-on');
  const iconOff = btnVideo.querySelector('.icon-vid-off');
  
  if (isVideoMuted) {
    iconOn.classList.add('hidden');
    iconOff.classList.remove('hidden');
    btnVideo.classList.add('disabled');
  } else {
    iconOn.classList.remove('hidden');
    iconOff.classList.add('hidden');
    btnVideo.classList.remove('disabled');
  }
}

async function startScreenShare() {
  if (isVideoMuted) return showToast('Cannot share screen while video is disabled');
  try {
    // Request only video to prevent NotAllowedError in many browsers when sharing specific windows
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    isSharingScreen = true;
    
    const newVideoTrack = screenStream.getVideoTracks()[0];
    
    // Replace track in peer connections with robust fallback
    for (const peer of Object.values(peers)) {
      const sender = peer.pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        try {
          await sender.replaceTrack(newVideoTrack);
        } catch (err) {
          console.warn('replaceTrack failed, renegotiating...', err);
          peer.pc.removeTrack(sender);
          peer.pc.addTrack(newVideoTrack, localStream);
        }
      } else {
        peer.pc.addTrack(newVideoTrack, localStream);
      }
    }
    
    localVideo.srcObject = screenStream;
    document.getElementById('wrapper-local').classList.add('sharing');
    btnScreenShare.classList.add('disabled');
    
    newVideoTrack.onended = stopScreenShare;
  } catch(e) {
    if (e.name !== 'NotAllowedError') {
      console.error('Screen share error', e);
      showToast('Screen sharing failed to start');
    }
  }
}

async function stopScreenShare() {
  if (!isSharingScreen) return;
  isSharingScreen = false;
  
  const originalVideoTrack = localStream.getVideoTracks()[0];
  for (const peer of Object.values(peers)) {
    const sender = peer.pc.getSenders().find(s => s.track && s.track.kind === 'video');
    if (sender && originalVideoTrack) {
      try {
        await sender.replaceTrack(originalVideoTrack);
      } catch (err) {
        peer.pc.removeTrack(sender);
        peer.pc.addTrack(originalVideoTrack, localStream);
      }
    }
  }
  
  localVideo.srcObject = localStream;
  document.getElementById('wrapper-local').classList.remove('sharing');
  btnScreenShare.classList.remove('disabled');
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }
}

btnMute.addEventListener('click', () => toggleAudio());
btnVideo.addEventListener('click', () => toggleVideo());
btnScreenShare.addEventListener('click', () => isSharingScreen ? stopScreenShare() : startScreenShare());

// Mesh WebRTC Functions
function createPeerConnection(targetSocketId, targetNumber) {
  const pc = new RTCPeerConnection(iceServers);
  const pendingIceCandidates = [];
  
  // Add tracks robustly resolving screenshare overrides for new joins
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) pc.addTrack(audioTrack, localStream);
    
    const videoTrack = isSharingScreen && screenStream ? screenStream.getVideoTracks()[0] : localStream.getVideoTracks()[0];
    if (videoTrack) pc.addTrack(videoTrack, localStream);
  }

  // Handle Renegotiation
  pc.onnegotiationneeded = async () => {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('offer', { targetSocketId, offer });
    } catch (err) {
      console.error('Renegotiation error:', err);
    }
  };

  // ICE Handling
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', { targetSocketId, candidate: event.candidate });
    }
  };

  // On remote track
  pc.ontrack = (event) => {
    let videoEl = document.getElementById(`video-${targetSocketId}`);
    if (!videoEl) {
      addVideoStream(targetSocketId, targetNumber);
      videoEl = document.getElementById(`video-${targetSocketId}`);
    }
    videoEl.srcObject = event.streams[0];
    
    // Attach audio monitor for active speaker ring
    monitorSpeech(event.streams[0], `wrapper-${targetSocketId}`, targetSocketId);
  };

  peers[targetSocketId] = { pc, pendingIceCandidates, targetNumber };
  return pc;
}

function destroyPeerConnection(targetSocketId) {
  if (peers[targetSocketId]) {
    peers[targetSocketId].pc.close();
    delete peers[targetSocketId];
  }
  const wrapper = document.getElementById(`wrapper-${targetSocketId}`);
  if (wrapper) wrapper.remove();
}

function addVideoStream(socketId, number) {
  if (document.getElementById(`wrapper-${socketId}`)) return; // already exists
  const wrapper = document.createElement('div');
  wrapper.className = 'video-wrapper glass-panel';
  wrapper.id = `wrapper-${socketId}`;
  wrapper.innerHTML = `
    <video id="video-${socketId}" autoplay playsinline></video>
    <div class="video-label">${number}</div>
  `;
  videoGrid.appendChild(wrapper);
}

// Room logic
async function joinRoom(roomId) {
  const hasMedia = await getMedia();
  if (!hasMedia) return;
  socket.emit('join-room', { roomId });
}

function leaveRoom() {
  socket.emit('leave-room');
  Object.keys(peers).forEach(targetSocketId => destroyPeerConnection(targetSocketId));
  stopMedia();
  isSharingScreen = false;
  currentRoom = null;
  currentRoomIdEl.textContent = '';
  showScreen(dashboardScreen);
}

// Socket Events
socket.on('assigned-number', ({ number }) => {
  myNumber = number;
  myNumberEl.textContent = number;
  localNumberLabel.textContent = number;
});

// Dashboard Actions
btnHostMeeting.addEventListener('click', async () => {
  const hasMedia = await getMedia();
  if (!hasMedia) return;
  socket.emit('create-room');
});

btnJoinMeeting.addEventListener('click', async () => {
  const roomId = roomCodeInput.value.trim();
  if (!roomId) return showToast('Please enter a room code');
  const hasMedia = await getMedia();
  if (!hasMedia) return;
  socket.emit('join-room', { roomId });
});

socket.on('room-created', ({ roomId }) => {
  currentRoom = roomId;
  currentRoomIdEl.textContent = roomId;
  showScreen(roomScreen);
});

socket.on('room-joined', ({ roomId, users }) => {
  currentRoom = roomId;
  currentRoomIdEl.textContent = roomId;
  showScreen(roomScreen);
  // Prepare connections for all users currently in the room
  users.forEach(user => {
    addVideoStream(user.socketId, user.number);
    createPeerConnection(user.socketId, user.number);
  });
});

// An existing user triggers an offer when a new user joins
socket.on('user-joined', async ({ socketId, number }) => {
  showToast(`User ${number} joined the meeting`);
  addVideoStream(socketId, number);
  const pc = createPeerConnection(socketId, number);
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('offer', { targetSocketId: socketId, offer });
  } catch (err) {
    console.error('Failed creating offer', err);
  }
});

socket.on('user-left', ({ socketId, number }) => {
  showToast(`User ${number} left`);
  destroyPeerConnection(socketId);
});

// WebRTC Signaling
socket.on('offer', async ({ senderSocketId, senderNumber, offer }) => {
  // A new user receiving offers from existing users
  let peer = peers[senderSocketId];
  if (!peer) {
    addVideoStream(senderSocketId, senderNumber);
    createPeerConnection(senderSocketId, senderNumber);
    peer = peers[senderSocketId];
  }
  
  try {
    await peer.pc.setRemoteDescription(new RTCSessionDescription(offer));
    // Drain candidates
    for (const c of peer.pendingIceCandidates) {
      try { await peer.pc.addIceCandidate(new RTCIceCandidate(c)); } catch(e){}
    }
    peer.pendingIceCandidates = [];
    
    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);
    socket.emit('answer', { targetSocketId: senderSocketId, answer });
  } catch (err) {
    console.error('Error handling offer', err);
  }
});

socket.on('answer', async ({ senderSocketId, answer }) => {
  const peer = peers[senderSocketId];
  if (peer) {
    try {
      await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
      for (const c of peer.pendingIceCandidates) {
        try { await peer.pc.addIceCandidate(new RTCIceCandidate(c)); } catch(e){}
      }
      peer.pendingIceCandidates = [];
    } catch (err) {
      console.error('Error handling answer', err);
    }
  }
});

socket.on('ice-candidate', async ({ senderSocketId, candidate }) => {
  const peer = peers[senderSocketId];
  if (peer) {
    if (peer.pc.remoteDescription) {
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) { console.error(err); }
    } else {
      peer.pendingIceCandidates.push(candidate);
    }
  }
});

// Invite Modal Logic
btnOpenInvite.addEventListener('click', () => {
  inviteModal.classList.remove('hidden');
  inviteNumberInput.value = '';
});

btnCancelInvite.addEventListener('click', () => {
  inviteModal.classList.add('hidden');
});

btnSendInvite.addEventListener('click', () => {
  const targetNumber = inviteNumberInput.value.trim();
  if (targetNumber.length !== 6) return showToast('Enter a valid 6-digit number');
  if (targetNumber === myNumber) return showToast('Cannot invite yourself');
  
  socket.emit('invite-user', { targetNumber, roomId: currentRoom });
  inviteModal.classList.add('hidden');
  showToast(`Sent invitation to ${targetNumber}`);
});

// Incoming Invites
socket.on('invitation', ({ callerNumber, roomId }) => {
  currentInviter = callerNumber;
  currentInviteRoom = roomId;
  inviterNumberEl.textContent = callerNumber;
  incomingInviteOverlay.classList.remove('hidden');
});

socket.on('invite-rejected', ({ number }) => {
  showToast(`User ${number} rejected the invitation`);
});

btnRejectInvite.addEventListener('click', () => {
  socket.emit('reject-invite', { targetNumber: currentInviter });
  incomingInviteOverlay.classList.add('hidden');
  currentInviter = null;
  currentInviteRoom = null;
});

btnAcceptInvite.addEventListener('click', () => {
  incomingInviteOverlay.classList.add('hidden');
  joinRoom(currentInviteRoom);
});

btnLeave.addEventListener('click', () => {
  if(confirm('Are you sure you want to leave the meeting?')) {
    leaveRoom();
  }
});

socket.on('call-error', ({ message }) => {
  showToast(message);
  if (!currentRoom) stopMedia();
});
