
const socket = io("wss://webrtc-signaling-0vp7.onrender.com"); // Replace with your actual Render URL
const room = new URLSearchParams(window.location.search).get("room") || "default";

let peer = null;
let localStream, remoteStream = new MediaStream();
let dataChannel;
let recorder, recordedChunks = [];
let isMuted = false;
let seconds = 0, timerInterval = null;

const ringingScreen = document.getElementById("ringingScreen");
const mainUI = document.getElementById("mainUI");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const callTimer = document.getElementById("callTimer");

document.getElementById("acceptCall").onclick = () => {
  ringingScreen.style.display = "none";
  mainUI.style.display = "block";
  startCameraAndJoin();
};

document.getElementById("rejectCall").onclick = () => {
  ringingScreen.innerHTML = "<h2>Call Rejected</h2>";
  socket.disconnect();
};

document.getElementById("sendChat").onclick = () => {
  const msg = chatInput.value.trim();
  if (msg && dataChannel?.readyState === "open") {
    dataChannel.send(msg);
    chatMessages.innerHTML += `<div><b>You:</b> ${msg}</div>`;
    chatInput.value = "";
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
};

document.getElementById("shareScreen").onclick = async () => {
  const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  const screenTrack = screenStream.getVideoTracks()[0];
  const sender = peer.getSenders().find(s => s.track.kind === "video");
  sender.replaceTrack(screenTrack);
};

document.getElementById("recordCall").onclick = () => {
  recorder = new MediaRecorder(localStream);
  recorder.ondataavailable = e => recordedChunks.push(e.data);
  recorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "call_recording.webm";
    a.click();
  };
  recorder.start();
  setTimeout(() => recorder.stop(), 60000); // 1 minute
};

document.getElementById("toggleAudio").onclick = () => {
  isMuted = !isMuted;
  localStream.getAudioTracks()[0].enabled = !isMuted;
  document.getElementById("toggleAudio").textContent = isMuted ? "🔈 Unmute" : "🔇 Mute";
};

document.getElementById("endCall").onclick = () => {
  stopTimer();
  peer?.close();
  socket?.disconnect();
  location.reload();
};

function startCameraAndJoin() {
  navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
    localStream = stream;
    localVideo.srcObject = stream;
    startConnection();
  });
}

function startConnection() {
  peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
  dataChannel = peer.createDataChannel("chat");

  dataChannel.onmessage = e => {
    chatMessages.innerHTML += `<div><b>Peer:</b> ${e.data}</div>`;
    chatMessages.scrollTop = chatMessages.scrollHeight;
  };

  peer.ondatachannel = e => {
    e.channel.onmessage = msg => {
      chatMessages.innerHTML += `<div><b>Peer:</b> ${msg.data}</div>`;
    };
  };

  peer.ontrack = e => remoteStream.addTrack(e.track);

  peer.onicecandidate = e => {
    if (e.candidate) socket.emit("ice", { room, candidate: e.candidate });
  };

  socket.emit("join", room);

  socket.on("ready", async () => {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit("offer", { room, offer });
  });

  socket.on("offer", async data => {
    await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socket.emit("answer", { room, answer });
  });

  socket.on("answer", async data => {
    await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
  });

  socket.on("ice", async data => {
    try {
      await peer.addIceCandidate(data.candidate);
    } catch (err) {
      console.error("ICE error:", err);
    }
  });

  startTimer();
}

function startTimer() {
  timerInterval = setInterval(() => {
    seconds++;
    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    callTimer.textContent = `${m}:${s}`;
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
}
