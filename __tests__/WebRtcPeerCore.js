import WebRtcPeerCore from "../src/WebRtcPeerCore";

const logger = {
  debug() {},
  warn() {},
};

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
