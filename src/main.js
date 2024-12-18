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

let callCount = 0

if (mode === HOST) {
  console.log("starting host")
  $("button#call").innerText = "Answer"
  $("button#call").style.width = "7em"
  $("#call-count").style.display = "block"
  $("input").parentElement.removeChild($("input"))

  const audioCtx = new AudioContext();
  let micGain;
  getMicrophoneAudioStream()
    .then(micStream => {
      const micAudioSource = audioCtx.createMediaStreamSource(micStream)
      micGain = audioCtx.createGain()
      micGain.gain.setValueAtTime(0, 0)
      micAudioSource.connect(micGain)

      const micWithGain = audioCtx.createMediaStreamDestination()
      micGain.connect(micWithGain)

      makePeerId(window.location.hash.slice(1)).then((hostId) => {
        console.log("hostId", hostId)
        const peer = new KeepAlivePeer(hostId);
        peer.on("error", console.error)
        peer.on("call", function(call) {
          callCount++
          $("#call-count").innerText = "Active calls: " + callCount
          $("button#call").removeAttribute("disabled")

          call.on("stream", playStream)
          call.on("error", console.error)
          call.on("close", () => {
            callCount--
            $("#call-count").innerText = "Active calls: " + callCount
            if (callCount === 0) {
              $("button#call").setAttribute("disabled", "true")
              micGain.gain.setValueAtTime(0, 0)
            }
          })
          call.answer(micWithGain.stream)

          getNextClick($("button#call")).then(() => {
            micGain.gain.setValueAtTime(1, 0)
          })
        })
      })
    })
    .catch((err) => console.error("Could not get microphone audio", err))
}

if (mode === CALL) {
  $("input").value = localStorage.callee || ""
  $("input").addEventListener("change", () => {
    localStorage.callee = $("input").value
  })
  const peer = new Peer();
  peer.on("error", (err) => {
    console.error(err)
    $("#error").innerText = $("input").value + " is offline."
    $("#status").className = ""
    getNextClick($("button#call")).then(initiateCall)
  })
  peer.on("open", () => $("button#call").removeAttribute("disabled"))
  getNextClick($("button#call")).then(initiateCall)

  function initiateCall() {
    $("#error").innerText = ""
    Promise.all([
      makePeerId($("input").value),
      getMicrophoneAudioStream()
        .catch((err) => console.error("Could not get microphone audio", err)),
    ]).then(([hostId, micStream]) => {
      console.log("calling peer", hostId)
      $("#status").className = "dialing"
      const call = peer.call(hostId, micStream)
      call.on("stream", () => {
        $("#status").className = "connected"
        getNextClick($("button#call")).then(() => {
          if (call.open) {
            call.close()
            $("#status").className = ""
            $("#error").innerText = ""
            getNextClick($("button#call")).then(initiateCall)
          }
        })
      })
      call.on("error", (err) => {
        $("#status").className = ""
        $("#error").innerText = "Error: call dropped."
      })
    })
  }
}

class KeepAlivePeer {
  constructor(hostId) {
    this.peer = this._createPeer(hostId)
    this.errorCallback = () => {}
    this.callCallback = () => {}
  }

  on(event, cb) {
    switch (event) {
      case "error":
        this.onError(cb)
        break
      case "call":
        this.onCall(cb)
        break
    }
  }

  onError(cb) {
    this.errorCallback = cb
  }

  onCall(cb) {
    this.callCallback = cb
  }

  _createPeer(hostId) {
    console.log("KeepAlivePeer: creating new peer " + hostId)
    const peer = new Peer(hostId)

    peer.on("error", (error) => {
      console.log("KeepAlivePeer: got error", error)
      if (peer.destroyed) {
        console.log("KeepAlivePeer: peer is already destroyed. Doing nothing.")
        return
      }
      peer.destroy()
      this.peer = this._createPeer(hostId)
      this.errorCallback(error)
    })

    peer.on("call", (call) => {
      console.log("KeepAlivePeer: got call", call)
      if (peer.destroyed) {
        console.log("KeepAlivePeer: peer is already destroyed. Doing nothing.")
        return
      }
      this.callCallback(call)
    })

    return peer
  }
}

async function makePeerId(name) {
  return sha256("com.benchristel.hotline." + name.trim())
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