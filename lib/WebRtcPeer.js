/*
 * (C) Copyright 2014-2015 Kurento (http://kurento.org/)
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
 */

const {EventEmitter} = require('events')

const freeice = require('freeice')
const sdpTranslator = require('sdp-translator')
const UAParser = require('ua-parser-js')
const uuidv4 = require('uuid/v4')

const recursive = require('merge').recursive.bind(undefined, true)

const logger = (typeof window === 'undefined') ? console : window.Logger || console

// const gUM = navigator.mediaDevices.getUserMedia || function (constraints) {
//   return new Promise(navigator.getUserMedia(constraints, function (stream) {
//     videoStream = stream
//     start()
//   }).eror(callback));
// }

try {
  require('kurento-browser-extensions')
} catch (error) {
  if (typeof getScreenConstraints === 'undefined') {
    logger.warn('screen sharing is not available')

    getScreenConstraints = function getScreenConstraints(sendSource, callback) {
      callback(new Error("This library is not enabled for screen sharing"))
    }
  }
}

const MEDIA_CONSTRAINTS = {
  audio: true,
  video: {
    width: 640,
    framerate: 15
  }
}

// Somehow, the UAParser constructor gets an empty window object.
// We need to pass the user agent string in order to get information
const ua = (typeof window !== 'undefined' && window.navigator) ? window.navigator.userAgent : ''
const parser = new UAParser(ua)
const browser = parser.getBrowser()

function insertScriptSrcInHtmlDom(scriptSrc) {
  //Create a script tag
  const script = document.createElement('script');
  // Assign a URL to the script element
  script.src = scriptSrc;
  // Get the first script tag on the page (we'll insert our new one before it)
  const ref = document.querySelector('script');
  // Insert the new node before the reference node
  ref.parentNode.insertBefore(script, ref);
}

function importScriptsDependsOnBrowser() {
  if (browser.name === 'IE') {
    insertScriptSrcInHtmlDom(
      "https://cdn.temasys.io/adapterjs/0.15.x/adapter.debug.js");
  }
}

importScriptsDependsOnBrowser();
let usePlanB = false
if (browser.name === 'Chrome' || browser.name === 'Chromium') {
  logger.debug(browser.name + ": using SDP PlanB")
  usePlanB = true
}

function noop(error) {
  if (error) logger.error(error)
}

function trackStop(track) {
  track.stop && track.stop()
}

function streamStop(stream) {
  stream.getTracks().forEach(trackStop)
}

/**
 * Returns a string representation of a SessionDescription object.
 */
function dumpSDP(description) {
  if (typeof description === 'undefined' || description === null) {
    return ''
  }

  return 'type: ' + description.type + '\r\n' + description.sdp
}

exports.bufferizeCandidates = function bufferizeCandidates(pc, onerror) {
  const candidatesQueue = []

  function setSignalingstatechangeAccordingWwebBrowser(functionToExecute, pc) {
    if (typeof AdapterJS !== 'undefined' && AdapterJS.webrtcDetectedBrowser ===
      'IE' && AdapterJS.webrtcDetectedVersion >= 9) {
      pc.onsignalingstatechange = functionToExecute;
    } else {
      pc.addEventListener('signalingstatechange', functionToExecute);
    }
  }

  function signalingstatechangeFunction() {
    if (pc.signalingState === 'stable') {
      while (candidatesQueue.length) {
        const entry = candidatesQueue.shift();
        pc.addIceCandidate(entry.candidate, entry.callback, entry.callback);
      }
    }
  };

  setSignalingstatechangeAccordingWwebBrowser(signalingstatechangeFunction, pc);

  return function (candidate, callback) {
    callback = callback || onerror;

    switch (pc.signalingState) {
    case 'closed':
      callback(new Error('PeerConnection object is closed'));
      break;

    case 'stable':
      // PeerConnection objects are initially on 'stable' state, but we can only
      // add them the ICE candidates after they have a remote description, so if
      // we don't have it, we queue the ICE candidates until the PeerConnection
      // objects are ready
      if (pc.remoteDescription) {
        pc.addIceCandidate(candidate, callback, callback);
        break;
      }

    default:
      candidatesQueue.push({
        candidate: candidate,
        callback: callback
      });
    }
  };
}

/* Simulcast utilities */

function removeFIDFromOffer(sdp) {
  const n = sdp.indexOf("a=ssrc-group:FID");

  if (n > 0) {
    return sdp.slice(0, n);
  } else {
    return sdp;
  }
}

function getSimulcastInfo(videoStream) {
  const videoTracks = videoStream.getVideoTracks();
  if (!videoTracks.length) {
    logger.warn('No video tracks available in the video stream')
    return ''
  }
  const lines = [
    'a=x-google-flag:conference',
    'a=ssrc-group:SIM 1 2 3',
    'a=ssrc:1 cname:localVideo',
    'a=ssrc:1 msid:' + videoStream.id + ' ' + videoTracks[0].id,
    'a=ssrc:1 mslabel:' + videoStream.id,
    'a=ssrc:1 label:' + videoTracks[0].id,
    'a=ssrc:2 cname:localVideo',
    'a=ssrc:2 msid:' + videoStream.id + ' ' + videoTracks[0].id,
    'a=ssrc:2 mslabel:' + videoStream.id,
    'a=ssrc:2 label:' + videoTracks[0].id,
    'a=ssrc:3 cname:localVideo',
    'a=ssrc:3 msid:' + videoStream.id + ' ' + videoTracks[0].id,
    'a=ssrc:3 mslabel:' + videoStream.id,
    'a=ssrc:3 label:' + videoTracks[0].id
  ];

  lines.push('');

  return lines.join('\n');
}

function sleep(milliseconds) {
  const start = new Date().getTime();
  for (let i = 0; i < 1e7; i++) {
    if ((new Date().getTime() - start) > milliseconds) {
      break;
    }
  }
}

function setIceCandidateAccordingWebBrowser(functionToExecute, pc) {
  if (typeof AdapterJS !== 'undefined' && AdapterJS.webrtcDetectedBrowser ===
    'IE' && AdapterJS.webrtcDetectedVersion >= 9) {
    pc.onicecandidate = functionToExecute;
  } else {
    pc.addEventListener('icecandidate', functionToExecute);
  }

}

function getMediaEnabled(type) {
  // [ToDo] Should return undefined if not all tracks have the same value?

  if (!this.peerConnection) return

  const streams = this.peerConnection.getLocalStreams()
  if (!streams.length) return

  for (let stream of streams)
    for (let track of stream[`get${type}Tracks`]())
      if (!track.enabled) return false

  return true
}

function setMediaEnabled(type, value) {
  for (let stream of this.peerConnection.getLocalStreams())
    for(let track of stream[`get${type}Tracks`]())
      track.enabled = value
}


/**
 * Wrapper object of an RTCPeerConnection. This object is aimed to simplify the
 * development of WebRTC-based applications.
 *
 * @constructor module:kurentoUtils.WebRtcPeer
 *
 * @param {String} mode Mode in which the PeerConnection will be configured.
 *  Valid values are: 'recv', 'send', and 'sendRecv'
 * @param localVideo Video tag for the local stream
 * @param remoteVideo Video tag for the remote stream
 * @param {MediaStream} videoStream Stream to be used as primary source
 *  (typically video and audio, or only video if combined with audioStream) for
 *  localVideo and to be added as stream to the RTCPeerConnection
 * @param {MediaStream} audioStream Stream to be used as second source
 *  (typically for audio) for localVideo and to be added as stream to the
 *  RTCPeerConnection
 */
class WebRtcPeer extends EventEmitter
{
  #id  // read only
  #interop
  #dataChannel
  #localVideo
  #mediaConstraints
  #multistream
  #peerConnection
  #remoteVideo
  #simulcast

  constructor(mode, options, callback) {
    super()

    if (options instanceof Function) {
      callback = options
      options = undefined
    }

    options = options || {}
    callback = (callback || noop).bind(this)

    const guid = uuidv4()

    this.#id = options.id || guid
    this.#localVideo = options.localVideo
    this.#mediaConstraints = options.mediaConstraints
    this.#multistream = options.multistream
    this.#peerConnection = options.peerConnection
    this.#remoteVideo = options.remoteVideo
    this.#simulcast = options.simulcast

    this.#interop = new sdpTranslator.Interop()

    const {
      audioStream,
      dataChannelConfig,
      dataChannels,
      oncandidategatheringdone,
      onicecandidate,
      onstreamended,
      sendSource = 'webcam'
    } = options

    let {videoStream} = options

    const configuration = recursive({
      iceServers: freeice()
    },
    options.configuration)

    if (onstreamended) this.on('streamended', onstreamended)
    if (onicecandidate) this.on('icecandidate', onicecandidate)
    if (oncandidategatheringdone) {
      this.on('candidategatheringdone', oncandidategatheringdone)
    }

    const candidatesQueueOut = []
    let candidategatheringdone = false

    // Init PeerConnection
    if (!this.#peerConnection) {
      this.#peerConnection = new RTCPeerConnection(configuration);

      if (dataChannels && !this.#dataChannel) {
        let dcId = `WebRtcPeer-${this.#id}`
        let dcOptions = undefined

        if (dataChannelConfig) {
          dcId = dataChannelConfig.id || dcId
          dcOptions = dataChannelConfig.options
        }

        this.#dataChannel = this.#peerConnection.createDataChannel(dcId, dcOptions);

        if (dataChannelConfig) {
          this.#dataChannel.onopen = dataChannelConfig.onopen;
          this.#dataChannel.onclose = dataChannelConfig.onclose;
          this.#dataChannel.onmessage = dataChannelConfig.onmessage;
          this.#dataChannel.onbufferedamountlow = dataChannelConfig.onbufferedamountlow;
          this.#dataChannel.onerror = dataChannelConfig.onerror || noop;
        }
      }
    }

    // Shims over the now deprecated getLocalStreams() and getRemoteStreams()
    // (usage of these methods should be dropped altogether)
    if (!this.#peerConnection.getLocalStreams && this.#peerConnection.getSenders) {
      this.#peerConnection.getLocalStreams = function () {
        const stream = new MediaStream();

        this.getSenders().forEach(function ({track}) {
          stream.addTrack(track);
        });

        return [stream];
      };
    }
    if (!this.#peerConnection.getRemoteStreams && this.#peerConnection.getReceivers) {
      this.#peerConnection.getRemoteStreams = function () {
        const stream = new MediaStream();

        this.getReceivers().forEach(function ({track}) {
          stream.addTrack(track);
        });

        return [stream];
      };
    }

    // If event.candidate == null, it means that candidate gathering has finished
    // and RTCPeerConnection.iceGatheringState == "complete".
    // Such candidate does not need to be sent to the remote peer.
    // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/icecandidate_event#Indicating_that_ICE_gathering_is_complete
    setIceCandidateAccordingWebBrowser(({candidate}) => {
      if (EventEmitter.listenerCount(this, 'icecandidate') || EventEmitter
        .listenerCount(this, 'candidategatheringdone')) {
        if (candidate) {
          let cand;
          if (this.#multistream && usePlanB) {
            cand = this.#interop.candidateToUnifiedPlan(candidate);
          } else {
            cand = candidate;
          }
          if (typeof AdapterJS === 'undefined') {
            this.emit('icecandidate', cand);
          }
          candidategatheringdone = false;
        } else if (!candidategatheringdone) {
          if (typeof AdapterJS !== 'undefined' && AdapterJS
            .webrtcDetectedBrowser === 'IE' && AdapterJS
            .webrtcDetectedVersion >= 9) {
            EventEmitter.prototype.emit('candidategatheringdone', cand);
          } else {
            this.emit('candidategatheringdone');
          }
          candidategatheringdone = true;
        }
      }

      // Not listening to 'icecandidate' or 'candidategatheringdone' events, queue
      // the candidate until one of them is listened
      else if (!candidategatheringdone) {
        candidatesQueueOut.push(candidate);
        if (!candidate)
          candidategatheringdone = true;
      }
    }, this.#peerConnection);

    const self = this

    function streamEndedListener() {
      self.emit('streamended', this);
    };

    if (videoStream) {
      videoStream.addEventListener('ended', streamEndedListener);
      this.#peerConnection.addStream(videoStream);
    }

    if (audioStream) {
      audioStream.addEventListener('ended', streamEndedListener);
      this.#peerConnection.addStream(audioStream);
    }

    this.#peerConnection.onaddstream = options.onaddstream
    this.#peerConnection.onnegotiationneeded = options.onnegotiationneeded

    this.on('newListener', function (event, listener) {
      if (event === 'icecandidate' || event === 'candidategatheringdone') {
        while (candidatesQueueOut.length) {
          const candidate = candidatesQueueOut.shift()

          if (!candidate === (event === 'candidategatheringdone')) {
            listener(candidate)
          }
        }
      }
    })

    const addIceCandidate = bufferizeCandidates(this.#peerConnection)


    //
    // Priviledged methods
    //

    /**
     * This function creates the RTCPeerConnection object taking into account the
     * properties received in the constructor. It starts the SDP negotiation
     * process: generates the SDP offer and invokes the onsdpoffer callback. This
     * callback is expected to send the SDP offer, in order to obtain an SDP
     * answer from another peer.
     */
    const start = () => {
      if (this.#peerConnection.signalingState === 'closed') {
        callback(
          'The peer connection object is in "closed" state. This is most likely due to an invocation of the dispose method before accepting in the dialogue'
        )
      }

      if (videoStream && this.#localVideo) {
        this.showLocalVideo()
      }

      if (videoStream) {
        videoStream.getTracks().forEach(track => {
          this.#peerConnection.addTrack(track, videoStream);
        });
      }

      if (audioStream) {
        audioStream.getTracks().forEach(track => {
          this.#peerConnection.addTrack(track, audioStream);
        });
      }

      // [Hack] https://code.google.com/p/chromium/issues/detail?id=443558
      const browser = parser.getBrowser()

      if (mode === 'sendonly' &&
        (browser.name === 'Chrome' || browser.name === 'Chromium') &&
        browser.major === 39) {
        mode = 'sendrecv'
      }

      callback()
    }

    if (mode !== 'recvonly' && !videoStream && !audioStream) {
      function getMedia(constraints) {
        if (constraints === undefined) {
          constraints = MEDIA_CONSTRAINTS
        }
        if (typeof AdapterJS !== 'undefined' && AdapterJS
          .webrtcDetectedBrowser === 'IE' && AdapterJS.webrtcDetectedVersion >= 9
        ) {
          navigator.getUserMedia(constraints, function (stream) {
            videoStream = stream;

            start();
          }, callback);
        } else {
          navigator.mediaDevices.getUserMedia(constraints).then(function (
            stream) {
            videoStream = stream;

            start();
          }).catch(callback);
        }
      }

      if (sendSource === 'webcam') {
        getMedia(this.#mediaConstraints)
      } else {
        getScreenConstraints(sendSource, (error, constraints) => {
          if (error)
            return callback(error)

          getMedia(recursive.apply(undefined, [constraints, this.#mediaConstraints]))
        }, guid)
      }
    } else {
      setTimeout(start, 0)
    }
  }


  //
  // Public API
  //

  get audioEnabled() {
    return getMediaEnabled.call(this, 'Audio')
  }
  set audioEnabled(value) {
    return setMediaEnabled.call(this, 'Audio', value)
  }

  /**
   * @member {(external:ImageData|undefined)} currentFrame
   */
  get currentFrame() {
    // [ToDo] Find solution when we have a remote stream but we didn't set
    // a remoteVideo tag
    if (!this.#remoteVideo) return;

    if (this.#remoteVideo.readyState < this.#remoteVideo.HAVE_CURRENT_DATA)
      throw new Error('No video stream data available')

    const canvas = document.createElement('canvas')
    canvas.width = this.#remoteVideo.videoWidth
    canvas.height = this.#remoteVideo.videoHeight

    canvas.getContext('2d').drawImage(this.#remoteVideo, 0, 0)

    return canvas
  }

  get dataChannel() {
    return dataChannel
  }

  get enabled() {
    return this.audioEnabled && this.videoEnabled
  }
  set enabled(value) {
    this.audioEnabled = this.videoEnabled = value
  }

  get id() {
    return this.#id
  }

  get localSessionDescriptor() {
    const pc = this.#peerConnection

    if (pc) return pc.localDescription
  }

  get localVideo() {
    return this.#localVideo
  }

  get peerConnection() {
    return this.#peerConnection
  }

  get remoteSessionDescriptor() {
    const pc = this.#peerConnection

    if (pc) return pc.remoteDescription
  }

  get remoteVideo() {
    return this.#remoteVideo
  }

  get videoEnabled() {
    return getMediaEnabled.call(this, 'Video')
  }
  set videoEnabled(value) {
    return setMediaEnabled.call(this, 'Video', value)
  }

  /**
   * Callback function invoked when an ICE candidate is received. Developers are
   * expected to invoke this function in order to complete the SDP negotiation.
   *
   * @function module:kurentoUtils.WebRtcPeer.prototype.addIceCandidate
   *
   * @param iceCandidate - Literal object with the ICE candidate description
   * @param callback - Called when the ICE candidate has been added.
   */
  addIceCandidate(iceCandidate, callback) {
    let candidate

    if (this.#multistream && usePlanB) {
      candidate = this.#interop.candidateToPlanB(iceCandidate)
    } else {
      candidate = new RTCIceCandidate(iceCandidate)
    }

    logger.debug('Remote ICE candidate received', iceCandidate)

    callback = (callback || noop).bind(this)

    addIceCandidate(candidate, callback)
  }

  /**
   * @description This method frees the resources used by WebRtcPeer.
   *
   * @function module:kurentoUtils.WebRtcPeer.prototype.dispose
   */
  dispose() {
    logger.debug('Disposing WebRtcPeer')

    const pc = this.#peerConnection
    const dc = this.#dataChannel

    try {
      if (dc) {
        if (dc.readyState === 'closed') return

        dc.close()
      }

      if (pc) {
        if (pc.signalingState === 'closed') return

        pc.getLocalStreams().forEach(streamStop)

        // FIXME This is not yet implemented in firefox
        // if(videoStream) pc.removeStream(videoStream);
        // if(audioStream) pc.removeStream(audioStream);

        pc.close()
      }
    } catch (err) {
      logger.warn('Exception disposing webrtc peer ' + err)
    }

    if (typeof AdapterJS === 'undefined') {
      if (this.#localVideo) {
        this.#localVideo.pause();
        this.#localVideo.srcObject = null;

        this.#localVideo.load();
        this.#localVideo.muted = false;
      }

      if (this.#remoteVideo) {
        this.#remoteVideo.pause();
        this.#remoteVideo.srcObject = null;

        this.#remoteVideo.load();
      }

      this.removeAllListeners();

      if (typeof window !== 'undefined' && window.cancelChooseDesktopMedia !== undefined) {
        window.cancelChooseDesktopMedia(guid)
      }
    }
  }

  generateOffer(callback) {
    callback = callback.bind(this)

    if (mode === 'recvonly') {
      /* Add reception tracks on the RTCPeerConnection. Send tracks are
       * unconditionally added to "sendonly" and "sendrecv" modes, in the
       * constructor's "start()" method, but nothing is done for "recvonly".
       *
       * Here, we add new transceivers to receive audio and/or video, so the
       * SDP Offer that will be generated by the PC includes these medias
       * with the "a=recvonly" attribute.
       */
      const useAudio =
        (this.#mediaConstraints && typeof this.#mediaConstraints.audio === 'boolean') ?
        this.#mediaConstraints.audio : true
      const useVideo =
        (this.#mediaConstraints && typeof this.#mediaConstraints.video === 'boolean') ?
        this.#mediaConstraints.video : true

      if (useAudio) {
        this.#peerConnection.addTransceiver('audio', {
          direction: 'recvonly'
        });
      }

      if (useVideo) {
        this.#peerConnection.addTransceiver('video', {
          direction: 'recvonly'
        });
      }
    }

    if (typeof AdapterJS !== 'undefined' && AdapterJS
      .webrtcDetectedBrowser === 'IE' && AdapterJS.webrtcDetectedVersion >= 9
    ) {
      this.#peerConnection.createOffer((offer) => {
        logger.debug('Created SDP offer');
        logger.debug('Local description set\n', this.#peerConnection.localDescription);

        this.#peerConnection.setLocalDescription(offer, () => {
          sleep(1000);

          const {localDescription} = this.#peerConnection;

          logger.debug('Local description set\n', localDescription.sdp);

          if (this.#multistream && usePlanB) {
            localDescription = this.#interop.toUnifiedPlan(localDescription);
            logger.debug('offer::origPlanB->UnifiedPlan', dumpSDP(
              localDescription));
          }

          callback(null, localDescription.sdp, this.processAnswer.bind(this));
        },
          callback);
      }, callback);
    } else {
      this.#peerConnection.createOffer()
        .then(offer => {
          logger.debug('Created SDP offer');
          offer = this.#mangleSdpToAddSimulcast(offer);
          return this.#peerConnection.setLocalDescription(offer);
        })
        .then(() => {
          let {localDescription} = this.#peerConnection;
          logger.debug('Local description set\n', localDescription.sdp);

          if (this.#multistream && usePlanB) {
            localDescription = this.#interop.toUnifiedPlan(localDescription);
            logger.debug('offer::origPlanB->UnifiedPlan', dumpSDP(
              localDescription));
          }
          callback(null, localDescription.sdp, this.processAnswer.bind(this));
        })
        .catch(callback);
    }
  }

  getLocalStream(index) {
    const pc = this.#peerConnection

    if (pc) return pc.getLocalStreams()[index || 0]
  }

  getRemoteStream(index) {
    const pc = this.#peerConnection

    if (pc) return pc.getRemoteStreams()[index || 0]
  }

  /**
   * Callback function invoked when a SDP answer is received. Developers are
   * expected to invoke this function in order to complete the SDP negotiation.
   *
   * @function module:kurentoUtils.WebRtcPeer.prototype.processAnswer
   *
   * @param sdpAnswer - Description of sdpAnswer
   * @param callback -
   *            Invoked after the SDP answer is processed, or there is an error.
   */
  processAnswer(sdpAnswer, callback) {
    callback = (callback || noop).bind(this)

    const answer = new RTCSessionDescription({
      type: 'answer',
      sdp: sdpAnswer
    })

    if (this.#multistream && usePlanB) {
      const planBAnswer = this.#interop.toPlanB(answer)
      logger.debug('asnwer::planB', dumpSDP(planBAnswer))
      answer = planBAnswer
    }

    logger.debug('SDP answer received, setting remote description')

    if (this.#peerConnection.signalingState === 'closed') {
      return callback('PeerConnection is closed')
    }

    this.#peerConnection.setRemoteDescription(answer, () => {
      this.#setRemoteVideo()

      callback()
    },
    callback)
  }

  /**
   * Callback function invoked when a SDP offer is received. Developers are
   * expected to invoke this function in order to complete the SDP negotiation.
   *
   * @function module:kurentoUtils.WebRtcPeer.prototype.processOffer
   *
   * @param sdpOffer - Description of sdpOffer
   * @param callback - Called when the remote description has been set
   *  successfully.
   */
  processOffer(sdpOffer, callback) {
    callback = callback.bind(this)

    let offer = new RTCSessionDescription({
      type: 'offer',
      sdp: sdpOffer
    })

    if (this.#multistream && usePlanB) {
      const planBOffer = this.#interop.toPlanB(offer)
      logger.debug('offer::planB', dumpSDP(planBOffer))
      offer = planBOffer
    }

    logger.debug('SDP offer received, setting remote description')

    if (this.#peerConnection.signalingState === 'closed') {
      return callback('PeerConnection is closed')
    }

    this.#peerConnection.setRemoteDescription(offer)
    .then(this.#setRemoteVideo.bind(this.#setRemoteVideo))
    .then(this.#peerConnection.createAnswer.bind(this.#peerConnection))
    .then(answer => {
      answer = this.#mangleSdpToAddSimulcast(answer)
      logger.debug('Created SDP answer')
      return this.#peerConnection.setLocalDescription(answer)
    })
    .then(() => {
      let {localDescription} = this.#peerConnection
      if (this.#multistream && usePlanB) {
        localDescription = this.#interop.toUnifiedPlan(localDescription)
        logger.debug('answer::origPlanB->UnifiedPlan', dumpSDP(
          localDescription))
      }
      logger.debug('Local description set\n', localDescription.sdp)
      callback(null, localDescription.sdp)
    }).catch(callback)
  }

  send(data) {
    if (this.#dataChannel && this.#dataChannel.readyState === 'open') {
      this.#dataChannel.send(data)
    } else {
      logger.warn(
        'Trying to send data over a non-existing or closed data channel')
    }
  }

  showLocalVideo() {
    this.#localVideo.srcObject = videoStream
    this.#localVideo.muted = true

    if (typeof AdapterJS !== 'undefined' && AdapterJS
      .webrtcDetectedBrowser === 'IE' && AdapterJS.webrtcDetectedVersion >= 9
    ) {
      this.#localVideo = attachMediaStream(this.#localVideo, videoStream);
    }
  }


  //
  // Private API
  //

  #mangleSdpToAddSimulcast(answer) {
    if (this.#simulcast) {
      if (browser.name === 'Chrome' || browser.name === 'Chromium') {
        logger.debug('Adding multicast info')

        answer = new RTCSessionDescription({
          'type': answer.type,
          'sdp': removeFIDFromOffer(answer.sdp) + getSimulcastInfo(
            videoStream)
        })
      } else {
        logger.warn('Simulcast is only available in Chrome browser.')
      }
    }

    return answer
  }

  #setRemoteVideo() {
    if (!this.#remoteVideo) return

    this.#remoteVideo.pause()

    const [stream] = this.#peerConnection.getRemoteStreams()

    this.#remoteVideo.srcObject = stream
    logger.debug('Remote stream:', stream)

    if (typeof AdapterJS !== 'undefined' && AdapterJS
      .webrtcDetectedBrowser === 'IE' && AdapterJS.webrtcDetectedVersion >= 9
    ) {
      this.#remoteVideo = attachMediaStream(this.#remoteVideo, stream);
    } else {
      this.#remoteVideo.load();
    }
  }
}


//
// Specialized child classes
//

exports.WebRtcPeerRecvonly = class extends WebRtcPeer
{
  constructor(options, callback) {
    super('recvonly', options, callback)
  }
}

exports.WebRtcPeerSendonly = class extends WebRtcPeer
{
  constructor(options, callback) {
    super('sendonly', options, callback)
  }
}

exports.WebRtcPeerSendrecv = class extends WebRtcPeer
{
  constructor(options, callback) {
    super('sendrecv', options, callback)
  }
}
