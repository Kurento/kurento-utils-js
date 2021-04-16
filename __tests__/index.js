/*
 * (C) Copyright 2015 Kurento (http://kurento.org/)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

/**
 * {@link WebRtcPeer} test suite.
 *
 * <p>
 * Methods tested:
 * <ul>
 * <li>{@link WebRtcEndpoint#getLocalSessionDescriptor()}
 * </ul>
 * <p>
 * Events tested:
 * <ul>
 * <li>{@link WebRtcEndpoint#addMediaSessionStartListener(MediaEventListener)}
 * <li>
 * {@link HttpEndpoint#addMediaSessionTerminatedListener(MediaEventListener)}
 * </ul>
 *
 *
 * @author Jesús Leganés Combarro "piranna" (piranna@gmail.com)
 * @since 4.2.4
 */

import { delay } from 'nanodelay'
// import pEvent from 'p-event'
import {
  MediaStream,
  RTCPeerConnection,
  RTCSessionDescription,
  mediaDevices,
} from "wrtc";

import {
  createCanvas, WebRtcPeer, WebRtcPeerCore, WebRtcPeerRecvonly,
  WebRtcPeerSendonly, WebRtcPeerSendrecv
} from "../src";

import RTCAudioSourceSineWave from "../testutils/rtcaudiosourcesinewave";

const logger = {
  debug(){},
  warn(){}
}

function setIceCandidateCallbacks(webRtcPeer, pc) {
  pc.addEventListener("icecandidate", function ({ candidate }) {
    if (candidate) webRtcPeer.addIceCandidate(candidate).catch(logger.warn);
  });
}

let peerConnection;
let track
let track2
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

  if (track2) {
    track2.stop();
    track2 = null;
  }

  if (webRtcPeer) {
    webRtcPeer.dispose();
    webRtcPeer = null;
  }
});

describe("Child classes", function () {
  describe("WebRtcPeerRecvonly", function () {
    describe('inheritance', function()
    {
      test('`new`', function()
      {
        webRtcPeer = new WebRtcPeerRecvonly({logger})

        expect(webRtcPeer).toBeInstanceOf(WebRtcPeerCore)
        expect(webRtcPeer).toBeInstanceOf(WebRtcPeer)
        expect(webRtcPeer).toBeInstanceOf(WebRtcPeerRecvonly)
      })

      test('not `new`', function()
      {
        webRtcPeer = WebRtcPeerRecvonly({logger})

        expect(webRtcPeer).toBeInstanceOf(WebRtcPeerCore)
        expect(webRtcPeer).toBeInstanceOf(WebRtcPeer)
        expect(webRtcPeer).toBeInstanceOf(WebRtcPeerRecvonly)
      })
    })

    test("behaviour", function () {
      expect.assertions(1);

      const options = {
        configuration: {
          iceServers: [],
        },
        logger
      };

      webRtcPeer = new WebRtcPeerRecvonly(options);
      peerConnection = new RTCPeerConnection();
      setIceCandidateCallbacks(webRtcPeer, peerConnection);

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
        track = new RTCAudioSourceSineWave().createTrack();

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
      });
    });
  });

  describe("WebRtcPeerSendonly", function () {
    describe('inheritance', function()
    {
      test('`new`', function()
      {
        webRtcPeer = new WebRtcPeerSendonly({logger})

        expect(webRtcPeer).toBeInstanceOf(WebRtcPeerCore)
        expect(webRtcPeer).toBeInstanceOf(WebRtcPeer)
        expect(webRtcPeer).toBeInstanceOf(WebRtcPeerSendonly)
      })

      test('not `new`', function()
      {
        webRtcPeer = WebRtcPeerSendonly({logger})

        expect(webRtcPeer).toBeInstanceOf(WebRtcPeerCore)
        expect(webRtcPeer).toBeInstanceOf(WebRtcPeer)
        expect(webRtcPeer).toBeInstanceOf(WebRtcPeerSendonly)
      })
    })

    test("behaviour", function () {
      expect.assertions(2);

      track = new RTCAudioSourceSineWave().createTrack();

      const audioStream = new MediaStream();
      audioStream.addTrack(track);

      const options = {
        audioStream,
        configuration: {
          iceServers: [],
        },
        logger
      };

      webRtcPeer = new WebRtcPeerSendonly(options);
      peerConnection = new RTCPeerConnection();
      setIceCandidateCallbacks(webRtcPeer, peerConnection);

      return webRtcPeer.ready
      .then(function () {
        return webRtcPeer.generateOffer();
      })
      .then(function (sdpOffer) {
        const sender = webRtcPeer.getSender();

        expect(sender.track).toBe(track);

        const offer = new RTCSessionDescription({
          type: "offer",
          sdp: sdpOffer,
        });

        return peerConnection.setRemoteDescription(offer);
      })
      .then(function () {
        const receivers = peerConnection.getReceivers();

        expect(receivers).toMatchInlineSnapshot(`
          Array [
            RTCRtpReceiver {},
          ]
        `);

        return peerConnection.createAnswer();
      })
      .then(function (answer) {
        return peerConnection.setLocalDescription(answer);
      })
      .then(function () {
        return webRtcPeer.processAnswer(peerConnection.localDescription.sdp);
      });
    });
  });

  describe("WebRtcPeerSendrecv", function () {
    describe('inheritance', function()
    {
      test('`new`', function()
      {
        webRtcPeer = new WebRtcPeerSendrecv({logger})

        expect(webRtcPeer).toBeInstanceOf(WebRtcPeerCore)
        expect(webRtcPeer).toBeInstanceOf(WebRtcPeer)
        expect(webRtcPeer).toBeInstanceOf(WebRtcPeerSendrecv)
      })

      test('not `new`', function()
      {
        webRtcPeer = WebRtcPeerSendrecv({logger})

        expect(webRtcPeer).toBeInstanceOf(WebRtcPeerCore)
        expect(webRtcPeer).toBeInstanceOf(WebRtcPeer)
        expect(webRtcPeer).toBeInstanceOf(WebRtcPeerSendrecv)
      })
    })

    test("behaviour", function () {
      expect.assertions(3);

      track = new RTCAudioSourceSineWave().createTrack();

      const audioStream = new MediaStream();
      audioStream.addTrack(track);

      const options = {
        audioStream,
        configuration: {
          iceServers: [],
        },
        logger
      };

      webRtcPeer = new WebRtcPeerSendrecv(options);
      peerConnection = new RTCPeerConnection();
      setIceCandidateCallbacks(webRtcPeer, peerConnection);

      return webRtcPeer.ready
      .then(function () {
        return webRtcPeer.generateOffer();
      })
      .then(function (sdpOffer) {
        const sender = webRtcPeer.getSender();

        expect(sender.track).toBe(track);

        const offer = new RTCSessionDescription({
          type: "offer",
          sdp: sdpOffer,
        });

        return peerConnection.setRemoteDescription(offer);
      })
      .then(function () {
        const receivers = peerConnection.getReceivers();

        expect(receivers).toMatchInlineSnapshot(`
          Array [
            RTCRtpReceiver {},
          ]
        `);

        track2 = new RTCAudioSourceSineWave().createTrack();

        peerConnection.addTrack(track2);

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
      });
    });
  });
});

describe("Methods", function () {
  test("processOffer", function () {
    expect.assertions(1);

    webRtcPeer = new WebRtcPeerRecvonly({logger});
    peerConnection = new RTCPeerConnection();
    setIceCandidateCallbacks(webRtcPeer, peerConnection);

    return webRtcPeer.ready
    .then(function () {
      track = new RTCAudioSourceSineWave().createTrack();

      peerConnection.addTrack(track);

      return peerConnection.createOffer();
    })
    .then(function (offer) {
      return peerConnection.setLocalDescription(offer);
    })
    .then(function () {
      return webRtcPeer.processOffer(peerConnection.localDescription.sdp);
    })
    .then(function (sdp) {
      const answer = new RTCSessionDescription({sdp, type: "answer"});

      return peerConnection.setRemoteDescription(answer);
    })
    .then(function () {
      const receiver = webRtcPeer.getReceiver();

      expect(receiver).toMatchInlineSnapshot(`RTCRtpReceiver {}`);
    });
  });
});

describe("Properties", function () {
  test("currentFrame", function () {
    // expect.assertions(2);

    const video = document.createElement("video");

    const options = {
      configuration: {
        iceServers: [],
      },
      logger,
      remoteVideo: video,
    };

    webRtcPeer = new WebRtcPeerRecvonly(options);
    peerConnection = new RTCPeerConnection();
    setIceCandidateCallbacks(webRtcPeer, peerConnection);

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
      const mediaConstraints = {
        audio: false,
        fake: true,
        video: {
          width: {
            min: 1024,
            ideal: 1280,
            max: 1920,
          },
          height: {
            min: 576,
            ideal: 720,
            max: 1080,
          },
        },
      };

      return mediaDevices.getUserMedia(mediaConstraints);
    })
    .then(function (stream) {
      for (const track of stream.getTracks()) peerConnection.addTrack(track);

      return peerConnection.createAnswer();
    })
    .then(function (answer) {
      return peerConnection.setLocalDescription(answer);
    })
    .then(function () {
      return webRtcPeer.processAnswer(peerConnection.localDescription.sdp);
    })
    // .then(function () {
    //   const receiver = webRtcPeer.getReceiver();

    //   expect(receiver).toMatchInlineSnapshot(`RTCRtpReceiver {}`);

    //   return pEvent(video, "playing")
    // })
    // .then(function()
    // {
    //   return delay(1000)
    // })
    // .then(function()
    // {
    //   const {currentFrame} = webRtcPeer;

    //   const x = currentFrame.width / 2;
    //   const y = currentFrame.height / 2;

    //   const {data} = currentFrame.getContext("2d").getImageData(x, y, 1, 1)
    //   expect(data).toBe([0, 0, 0, 0])
    // })
  });

  test("enabled", function () {
    expect.assertions(4);

    track = new RTCAudioSourceSineWave().createTrack();

    const audioStream = new MediaStream();
    audioStream.addTrack(track);

    const options = {
      audioStream,
      configuration: {
        iceServers: [],
      },
      logger
    };

    webRtcPeer = new WebRtcPeerSendonly(options);

    return webRtcPeer.ready.then(function () {
      expect(webRtcPeer.audioEnabled).toBeTruthy();

      webRtcPeer.enabled = false;
      expect(webRtcPeer.audioEnabled).toBeFalsy();

      webRtcPeer.enabled = true;
      expect(webRtcPeer.audioEnabled).toBeTruthy();

      webRtcPeer.audioEnabled = false;
      expect(webRtcPeer.enabled).toBeFalsy();
    });
  });

  test("audioEnabled", function () {
    expect.assertions(3);

    track = new RTCAudioSourceSineWave().createTrack();

    const audioStream = new MediaStream();
    audioStream.addTrack(track);

    const options = {
      audioStream,
      configuration: {
        iceServers: [],
      },
      logger
    };

    webRtcPeer = new WebRtcPeerSendonly(options);

    return webRtcPeer.ready.then(function () {
      const { track } = webRtcPeer.getSender();

      expect(track.enabled).toBeTruthy();

      webRtcPeer.audioEnabled = false;
      expect(track.enabled).toBeFalsy();

      webRtcPeer.audioEnabled = true;
      expect(track.enabled).toBeTruthy();
    });
  });

  test("videoEnabled", function () {
    // expect.assertions(3);

    const TIMEOUT = 500; // ms

    const video = document.createElement("video");
    const canvas = createCanvas();
    // const context = canvas.getContext("2d");

    const options = {
      configuration: {
        iceServers: [],
      },
      localVideo: video,
      logger,
      mediaConstraints: {
        audio: false,
        video: true,
        fake: true,
      },
    };

    webRtcPeer = new WebRtcPeerSendonly(options);

    return webRtcPeer.ready
    // .then(function () {
    //   return pEvent(video, "playing")
    // })
    // .then(function()
    // {
    //   return delay(TIMEOUT)
    // })
    .then(function()
    {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // const x = video.videoWidth / 2;
      // const y = video.videoHeight / 2;

      // context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

      // const {data} = context.getImageData(x, y, 1, 1)
      // expect(data).not.toBe([0, 0, 0, 0])

      webRtcPeer.videoEnabled = false;

      return delay(TIMEOUT)
    })
    .then(function()
    {
      // context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

      // const {data} = context.getImageData(x, y, 1, 1)
      // expect(data).toBe([0, 0, 0, 255])

      webRtcPeer.videoEnabled = true;

      // return delay(TIMEOUT)
    })
    // .then(function()
    // {
    //   context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

    //   const {data} = context.getImageData(x, y, 1, 1)
    //   expect(data).not.toBe([0, 0, 0, 255])
    // })
  });
});
