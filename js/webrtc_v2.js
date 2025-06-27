
const socket = io("wss://https://webrtc-signaling-0vp7.onrender.com"); // Actual Render deployment URL
let localVideo = document.getElementById('localVideo');
let remoteVideo = document.getElementById('remoteVideo');
let peer = null;
let localStream, remoteStream = new MediaStream();
let dataChannel, recorder, recordedChunks = [];
let seconds = 0, timerInterval;

// Start camera + mic
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  localStream = stream;
  localVideo.srcObject = stream;
  startConnection();
});

function startConnection() {
  peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
  dataChannel = peer.createDataChannel("chat");

  peer.ondatachannel = e => {
    e.channel.onmessage = msg => {
      let chat = document.getElementById("chatMessages");
      chat.innerHTML += "<div><b>Peer:</b> " + msg.data + "</div>";
      chat.scrollTop = chat.scrollHeight;
    };
  };

  dataChannel.onopen = () => console.log("Chat ready");

  peer.ontrack = e => remoteStream.addTrack(e.track);
  peer.onicecandidate = e => {
    if (e.candidate) socket.emit("ice", { room, candidate: e.candidate });
  };

  socket.emit("join", room);

  socket.on("offer", async (data) => {
    await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socket.emit("answer", { room, answer });
  });

  socket.on("answer", async (data) => {
    await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
  });

  socket.on("ice", async (data) => {
    try {
      await peer.addIceCandidate(data.candidate);
    } catch (err) {
      console.error("ICE error:", err);
    }
  });

  socket.on("ready", async () => {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit("offer", { room, offer });
  });

  startTimer();
}

document.getElementById("sendChat").onclick = () => {
  let input = document.getElementById("chatInput");
  let msg = input.value.trim();
  if (msg && dataChannel.readyState === "open") {
    dataChannel.send(msg);
    document.getElementById("chatMessages").innerHTML += "<div><b>You:</b> " + msg + "</div>";
    input.value = "";
  }
};

document.getElementById("shareScreen").onclick = async () => {
  const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  const screenTrack = screenStream.getVideoTracks()[0];
  peer.getSenders().find(s => s.track.kind === "video").replaceTrack(screenTrack);
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
  setTimeout(() => recorder.stop(), 60000); // stop after 1 min
};

document.getElementById("endCall").onclick = () => {
  stopTimer();
  peer.close();
  socket.disconnect();
  location.reload();
};

function startTimer() {
  timerInterval = setInterval(() => {
    seconds++;
    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    document.getElementById("callTimer").textContent = `${m}:${s}`;
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
}
