async function getMicrophoneAudioStream() {
  return new Promise((resolve, reject) => {
    const getUserMedia = navigator.getUserMedia
      || navigator.webkitGetUserMedia
      || navigator.mozGetUserMedia  

    getUserMedia(
      {audio: true, video: false},
      stream => resolve(stream),
      err => reject(err),
    )
  })
}

const HOST = "host"
const CALL = "call"
const mode = window.location.hash.length > 1 ? HOST : CALL

async function getNextClick(button) {
  return new Promise((resolve) => {
    button.addEventListener("click", onClick)
    function onClick() {
      button.removeEventListener("click", onClick)
      resolve()
    }
  })
}

if (mode === HOST) {
  console.log("starting host")
  $("button#call").innerText = "Answer"
  $("input").parentElement.removeChild($("input"))
  sha256(window.location.hash.slice(1)).then((hostId) => {
    console.log("hostId", hostId)
    const peer = new Peer(hostId);
    peer.on("error", console.error)
    peer.on("call", function(call) {
      $("button#call").removeAttribute("disabled")
      call.on("stream", playStream)

      getNextClick($("button#call")).then(() => {
        getMicrophoneAudioStream()
          .then(micStream => call.answer(micStream))
          .catch((err) => console.error("Could not get microphone audio", err))
      })
    })
  })
}

if (mode === CALL) {
  const peer = new Peer();
  peer.on("error", console.error)
  peer.on("open", () => $("button#call").removeAttribute("disabled"))
  getNextClick($("button#call")).then(() => {
    Promise.all([
      sha256($("input").value),
      getMicrophoneAudioStream()
        .catch((err) => console.error("Could not get microphone audio", err)),
    ]).then(([hostId, micStream]) => {
      console.log("calling peer", hostId)
      const call = peer.call(hostId, micStream)
      call.on('stream', remoteStream => {
        playStream(remoteStream)
      })
    })
  })
}

function playStream(audioStream) {
  const audio = new Audio()
  audio.srcObject = audioStream
  audio.play()
}

async function sha256(message) {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
}  

function $(selector) {
  return document.querySelector(selector)
}