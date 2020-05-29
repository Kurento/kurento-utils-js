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

/**
 * This module contains a set of reusable components that have been found useful
 * during the development of the WebRTC applications with Kurento.
 *
 * @module kurentoUtils
 *
 * @copyright 2014 Kurento (http://kurento.org/)
 * @license ALv2
 */

import EventEmitter from 'events'

import 'webrtc-adapter'

import freeice from 'freeice'
import merge from 'merge'
import sdpTranslator from 'sdp-translator'
import UAParser from 'ua-parser-js'
import uuid from 'uuid'

const {v4} = uuide


const recursive = merge.recursive.bind(undefined, true)

const logger = typeof window !== 'undefined' && window.Logger || console


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
const {name} = parser.getBrowser()

const usePlanB = name === 'Chrome' || name === 'Chromium'
if (usePlanB) logger.debug(name + ": using SDP PlanB")


/**
 * Returns a string representation of a SessionDescription object.
 */
function dumpSDP(description) {
  if (description == null) return ''

  return `type: ${description.type}\r\n${description.sdp}`
}

/* Simulcast utilities */

function removeFIDFromOffer(sdp) {
  const n = sdp.indexOf("a=ssrc-group:FID");

  if (!n) return sdp;

  return sdp.slice(0, n);
}

function getSimulcastInfo(videoStream) {
  const videoTracks = videoStream.getVideoTracks();

  if (!videoTracks.length) {
    logger.warn('No video tracks available in the video stream')
    return ''
  }

  const [{id}] = videoTracks

  return [
    'a=x-google-flag:conference',
    'a=ssrc-group:SIM 1 2 3',
    'a=ssrc:1 cname:localVideo',
    'a=ssrc:1 msid:' + videoStream.id + ' ' + id,
    'a=ssrc:1 mslabel:' + videoStream.id,
    'a=ssrc:1 label:' + id,
    'a=ssrc:2 cname:localVideo',
    'a=ssrc:2 msid:' + videoStream.id + ' ' + id,
    'a=ssrc:2 mslabel:' + videoStream.id,
    'a=ssrc:2 label:' + id,
    'a=ssrc:3 cname:localVideo',
    'a=ssrc:3 msid:' + videoStream.id + ' ' + id,
    'a=ssrc:3 mslabel:' + videoStream.id,
    'a=ssrc:3 label:' + id,
    ''
  ].join('\n');
}

function getMediaEnabled(type) {
  // [ToDo] Should return undefined if not all tracks have the same value?

  const tracks = this.peerConnection.getSenders()
  if (!tracks.length) return

  type = type.toLowerCase()

  for (const track of tracks)
    if(track.kind === type)
      if (!enabled) return false

  return true
}

function setMediaEnabled(type, value) {
  type = type.toLowerCase()

  for (const track of this.peerConnection.getSenders())
    if(track.kind === type)
      track.enabled = value
}


/**
 * Wrapper object of an RTCPeerConnection. This object is aimed to simplify the
 * development of WebRTC-based applications.
 */
class WebRtcPeer extends EventEmitter
{
  /**
   * @constructor module:kurentoUtils.WebRtcPeer
   *
   * @param {String} mode Mode in which the PeerConnection will be configured.
   *  Valid values are: 'recv', 'send', and 'sendRecv'
   * @param localVideo Video tag for the local stream
   * @param remoteVideo Video tag for the remote stream
   * @param {MediaStream} videoStream Stream to be used as primary source
   *  (typically video and audio, or only video if combined with audioStream)
   *  for localVideo and to be added as stream to the RTCPeerConnection
   * @param {MediaStream} audioStream Stream to be used as second source
   *  (typically for audio) for localVideo and to be added as stream to the
   *  RTCPeerConnection
   */
  constructor(
    mode,
    {
      audioStream,
      configuration,
      dataChannelConfig = {},
      dataChannels,
      freeice: freeiceOpts,
      id = v4(),
      localVideo,
      mediaConstraints = MEDIA_CONSTRAINTS,
      multistream,
      oncandidategatheringdone,
      onicecandidate,
      onnegotiationneeded,
      onstreamended,
      ontrack,
      peerConnection,
      remoteVideo,
      sendSource = 'webcam',
      simulcast,
      videoStream
    } = {}
  ) {
    super()

    this.#audioStream = audioStream
    this.#id = id
    this.#localVideo = localVideo
    this.#mediaConstraints = mediaConstraints
    this.#mode = mode
    this.#multistream = multistream
    this.#peerConnection = peerConnection
    this.#remoteVideo = remoteVideo
    this.#simulcast = simulcast
    this.#videoStream = videoStream

    this.#interop = new sdpTranslator.Interop()

    const peeconnectionConfiguration = recursive({
      iceServers: freeice(freeiceOpts)
    },
    configuration)

    if (onstreamended) this.on('streamended', onstreamended)
    if (onicecandidate) this.on('icecandidate', onicecandidate)
    if (oncandidategatheringdone)
      this.on('candidategatheringdone', oncandidategatheringdone)

    let candidategatheringdone = false

    // Init PeerConnection
    if (!this.#peerConnection) {
      this.#peerConnection = new RTCPeerConnection(peeconnectionConfiguration);

      if (dataChannels) {
        const {
          id = `WebRtcPeer-${this.#id}`,
          onbufferedamountlow,
          onclose,
          onerror = logger.error,
          onmessage,
          onopen,
          options
        } = dataChannelConfig

        this.#dataChannel = this.#peerConnection.createDataChannel(id, options);

        this.#dataChannel.addEventListener('open', onopen)
        this.#dataChannel.addEventListener('close', onclose)
        this.#dataChannel.addEventListener('message', onmessage)
        this.#dataChannel.addEventListener('bufferedamountlow', onbufferedamountlow)
        this.#dataChannel.addEventListener('error', onerror)
      }
    }

    const candidatesQueueOut = []

    // If event.candidate == null, it means that candidate gathering has
    // finished and RTCPeerConnection.iceGatheringState === "complete".
    // Such candidate does not need to be sent to the remote peer.
    // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/icecandidate_event#Indicating_that_ICE_gathering_is_complete
    this.#peerConnection.addEventListener('icecandidate', ({candidate}) => {
      if (EventEmitter.listenerCount(this, 'icecandidate') || EventEmitter
        .listenerCount(this, 'candidategatheringdone')) {
        if (candidate) {
          if (this.#multistream && usePlanB)
            candidate = this.#interop.candidateToUnifiedPlan(candidate);

          this.emit('icecandidate', candidate);
          candidategatheringdone = false;
        } else if (!candidategatheringdone) {
          this.emit('candidategatheringdone');
          candidategatheringdone = true;
        }
      }

      // Not listening to 'icecandidate' or 'candidategatheringdone' events,
      // queue the candidate until one of them is listened
      else if (!candidategatheringdone) {
        candidatesQueueOut.push(candidate);

        if (!candidate) candidategatheringdone = true;
      }
    });

    if(onnegotiationneeded)
      this.#peerConnection.addEventListener('negotiationneeded', onnegotiationneeded)
    if(ontrack)
      this.#peerConnection.addEventListener('track', ontrack)

    this.on('newListener', function (event, listener) {
      if (event !== 'icecandidate' && event !== 'candidategatheringdone') return

      while (candidatesQueueOut.length) {
        const candidate = candidatesQueueOut.shift()

        if (!candidate === (event === 'candidategatheringdone'))
          listener(candidate)
      }
    })

    this.#then = Promise.resolve()
    .then(() =>
    {
      if (this.#mode === 'recvonly' || this.#videoStream || this.#audioStream) return

      const method = sendSource === 'webcam' ? 'getUserMedia' : 'getDisplayMedia'

      return navigator.mediaDevices[method](this.#mediaConstraints)
      .then(stream => this.#videoStream = stream)
    })
    .then(this.#start)
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
    return this.#dataChannel
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
    return this.#peerConnection.localDescription
  }

  get localVideo() {
    return this.#localVideo
  }

  get peerConnection() {
    return this.#peerConnection
  }

  get remoteSessionDescriptor() {
    return this.#peerConnection.remoteDescription
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
   * @param candidate - Literal object with the ICE candidate description
   */
  addIceCandidate(candidate) {
    logger.debug('Remote ICE candidate received', candidate)

    if (this.#multistream && usePlanB)
      candidate = this.#interop.candidateToPlanB(candidate)

    return this.#peerConnection.addIceCandidate(candidate)
  }

  /**
   * @description This method frees the resources used by WebRtcPeer.
   *
   * @function module:kurentoUtils.WebRtcPeer.prototype.dispose
   */
  dispose() {
    logger.debug('Disposing WebRtcPeer')

    const pc = this.#peerConnection

    if (pc.connectionState === 'closed') return

    try {
      for(const {track} of pc.getSenders()) track.stop()

      pc.close()
    } catch (err) {
      logger.warn('Exception disposing webrtc peer ' + err)
    }

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

    if (typeof window !== 'undefined' && window.cancelChooseDesktopMedia)
      window.cancelChooseDesktopMedia(this.#id)
  }

  generateOffer() {
    if (this.#mode === 'recvonly') {
      /* Add reception tracks on the RTCPeerConnection. Send tracks are
       * unconditionally added to "sendonly" and "sendrecv" modes, in the
       * constructor's "start()" method, but nothing is done for "recvonly".
       *
       * Here, we add new transceivers to receive audio and/or video, so the
       * SDP Offer that will be generated by the PC includes these medias
       * with the "a=recvonly" attribute.
       */
      const useAudio = typeof this.#mediaConstraints.audio === 'boolean'
                     ? this.#mediaConstraints.audio : true
      const useVideo = typeof this.#mediaConstraints.video === 'boolean'
                     ? this.#mediaConstraints.video : true

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

    return this.#peerConnection.createOffer()
    .then(offer => {
      offer = this.#mangleSdpToAddSimulcast(offer);
      logger.debug('Created SDP offer:', offer);

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

      return localDescription.sdp
    })
  }

  getReceivers(index) {
    return this.#peerConnection.getReceivers()[index || 0]
  }

  getSenders(index) {
    return this.#peerConnection.getSenders()[index || 0]
  }

  /**
   * Callback function invoked when a SDP answer is received. Developers are
   * expected to invoke this function in order to complete the SDP negotiation.
   *
   * @function module:kurentoUtils.WebRtcPeer.prototype.processAnswer
   *
   * @param sdp - Description of sdpAnswer
   */
  processAnswer(sdp) {
    const answer = new RTCSessionDescription({
      type: 'answer',
      sdp
    })

    if (this.#multistream && usePlanB) {
      const planBAnswer = this.#interop.toPlanB(answer)
      logger.debug('asnwer::planB', dumpSDP(planBAnswer))
      answer = planBAnswer
    }

    logger.debug('SDP answer received, setting remote description')

    if (this.#peerConnection.connectionState === 'closed')
      return Promise.reject(new Error('PeerConnection is closed'))

    return this.#peerConnection.setRemoteDescription(answer)
    .then(this.#setRemoteVideo)
  }

  /**
   * Callback function invoked when a SDP offer is received. Developers are
   * expected to invoke this function in order to complete the SDP negotiation.
   *
   * @function module:kurentoUtils.WebRtcPeer.prototype.processOffer
   *
   * @param sdp - Description of sdpOffer
   */
  processOffer(sdp) {
    let offer = new RTCSessionDescription({
      type: 'offer',
      sdp
    })

    if (this.#multistream && usePlanB) {
      const planBOffer = this.#interop.toPlanB(offer)
      logger.debug('offer::planB', dumpSDP(planBOffer))
      offer = planBOffer
    }

    logger.debug('SDP offer received, setting remote description')

    if (this.#peerConnection.connectionState === 'closed')
      return Promise.reject(new Error('PeerConnection is closed'))

    return this.#peerConnection.setRemoteDescription(offer)
    .then(this.#setRemoteVideo)
    .then(this.#peerConnection.createAnswer.bind(this.#peerConnection))
    .then(answer => {
      answer = this.#mangleSdpToAddSimulcast(answer)
      logger.debug('Created SDP answer', answer)

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

      return localDescription.sdp
    })
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
    this.#localVideo.srcObject = this.#videoStream
    this.#localVideo.muted = true
  }

  then(onSuccess, onFailure) {
    return this.#then.then(onSuccess, onFailure)
  }


  //
  // Private API
  //

  #audioStream
  #id  // read only
  #interop
  #dataChannel
  #localVideo
  #mediaConstraints
  #mode
  #multistream
  #peerConnection
  #remoteVideo
  #simulcast
  #then
  #videoStream

  #mangleSdpToAddSimulcast(answer) {
    if (this.#simulcast)
      if (!usePlanB)
        logger.warn('Simulcast is only available in Chrome browser.')

      else {
        logger.debug('Adding multicast info')

        return new RTCSessionDescription({
          'type': answer.type,
          'sdp': removeFIDFromOffer(answer.sdp) + getSimulcastInfo(
            this.#videoStream)
        })
      }

    return answer
  }

  #setRemoteVideo = () => {
    if (!this.#remoteVideo) return

    const stream = new MediaStream();

    for(const {track} of this.#peerConnection.getReceivers())
      stream.addTrack(track);

    logger.debug('Remote stream:', stream)

    this.#remoteVideo.pause()
    this.#remoteVideo.srcObject = stream
    this.#remoteVideo.load();
  }

  #start = () => {
    if (this.#peerConnection.connectionState === 'closed')
      throw new Error('The peer connection object is in "closed" state. ' +
        'This is most likely due to an invocation of the dispose method ' +
        'before accepting in the dialogue')

    const self = this

    function streamEndedListener() {
      self.emit('streamended', this);
    };

    if (this.#videoStream && this.#localVideo) this.showLocalVideo()

    if (this.#videoStream) {
      this.#videoStream.addEventListener('ended', streamEndedListener);

      for(const track of this.#videoStream.getTracks())
        this.#peerConnection.addTrack(track, this.#videoStream);
    }

    if (this.#audioStream) {
      this.#audioStream.addEventListener('ended', streamEndedListener);

      for(const track of this.#audioStream.getTracks())
        this.#peerConnection.addTrack(track, this.#audioStream);
    }
  }
}


//
// Specialized child classes
//

export class WebRtcPeerRecvonly extends WebRtcPeer
{
  constructor(options) {
    super('recvonly', options)
  }
}

export class WebRtcPeerSendonly extends WebRtcPeer
{
  constructor(options) {
    super('sendonly', options)
  }
}

export class WebRtcPeerSendrecv extends WebRtcPeer
{
  constructor(options) {
    super('sendrecv', options)
  }
}


export default {
  WebRtcPeerRecvonly,
  WebRtcPeerSendonly,
  WebRtcPeerSendrecv
}
