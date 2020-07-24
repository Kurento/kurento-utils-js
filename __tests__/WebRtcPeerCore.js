import { delay } from "nanodelay";
import {
  RTCPeerConnection,
  RTCSessionDescription,
  nonstandard,
} from "wrtc";

import WebRtcPeerCore from "../src/WebRtcPeerCore";

const logger = {
  debug() {},
  warn() {},
};

function setIceCandidateCallbacks(webRtcPeer, pc) {
  pc.addEventListener("icecandidate", function ({ candidate }) {
    if (candidate) webRtcPeer.addIceCandidate(candidate).catch(logger.warn);
  });
}

let peerConnection;
let track;
let webRtcPeer;

afterEach(function () {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (track) {
    track.stop();
    track = null;
  }

  if (webRtcPeer) {
    webRtcPeer.dispose();
    webRtcPeer = null;
  }
});

test("processAnswer with closed PeerConnection", function () {
  const webRtcPeerCore = new WebRtcPeerCore("recvonly", { logger });

  const promise = webRtcPeerCore.ready.then(function () {
    webRtcPeerCore.dispose();

    return webRtcPeerCore.processAnswer();
  });

  return expect(promise).rejects.toThrowErrorMatchingInlineSnapshot(
    `"PeerConnection is closed"`
  );
});

test("processOffer with closed PeerConnection", function () {
  const webRtcPeerCore = new WebRtcPeerCore("recvonly", { logger });

  const promise = webRtcPeerCore.ready.then(function () {
    webRtcPeerCore.dispose();

    return webRtcPeerCore.processOffer();
  });

  return expect(promise).rejects.toThrowErrorMatchingInlineSnapshot(
    `"PeerConnection is closed"`
  );
});

test('replaceStream', function()
{
  const webRtcPeerCore = new WebRtcPeerCore("sendonly", { logger });

  const stream = {
    getTracks()
    {
      return []
    },

    getVideoTracks()
    {
      return []
    }
  }

  return webRtcPeerCore.replaceStream(stream)
})

test('replaceTrack', function()
{
  const webRtcPeerCore = new WebRtcPeerCore("sendonly", { logger });

  return webRtcPeerCore.replaceVideoTrack()
})

test('send', function()
{
  const webRtcPeerCore = new WebRtcPeerCore("recvonly", { logger });

  webRtcPeerCore.send()
})
describe("Properties", function () {
  describe("currentFrame", function () {
    test("No remote video stream available", function () {
      webRtcPeer = new WebRtcPeerCore("recvonly", { logger });

      function func() {
        webRtcPeer.currentFrame;
      }

      expect(func).toThrowErrorMatchingInlineSnapshot(
        `"No remote video stream available"`
      );
    });

    test("Success", function () {
      webRtcPeer = new WebRtcPeerCore("recvonly", { logger });
      peerConnection = new RTCPeerConnection();
      setIceCandidateCallbacks(webRtcPeer, peerConnection);

      const source = new nonstandard.RTCVideoSource();

      return webRtcPeer.ready
        .then(function () {
          return webRtcPeer.generateOffer();
        })
        .then(function (sdpOffer) {
          const offer = new RTCSessionDescription({
            type: "offer",
            sdp: sdpOffer,
          });

          return peerConnection.setRemoteDescription(offer);
        })
        .then(function () {
          track = source.createTrack();

          peerConnection.addTrack(track);

          return peerConnection.createAnswer();
        })
        .then(function (answer) {
          return peerConnection.setLocalDescription(answer);
        })
        .then(function () {
          return webRtcPeer.processAnswer(peerConnection.localDescription.sdp);
        })
        .then(function () {
          const receiver = webRtcPeer.getReceiver();

          expect(receiver).toMatchInlineSnapshot(`RTCRtpReceiver {}`);

          const width = 320;
          const height = 240;
          const data = new Uint8ClampedArray(width * height * 1.5);
          const frame = { width, height, data };

          source.onFrame(frame);

          return delay(1000);
        })
        .then(function () {
          const { currentFrame } = webRtcPeer;

          const x = currentFrame.width / 2;
          const y = currentFrame.height / 2;

          const { data } = currentFrame
            .getContext("2d")
            .getImageData(x, y, 1, 1);
          expect(data).toMatchInlineSnapshot(`
            Uint8ClampedArray [
              0,
              135,
              0,
              255,
            ]
          `);
        });
    });
  });
});
