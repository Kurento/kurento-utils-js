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
 *
 * @author Jesús Leganés Combarro "piranna" (piranna@gmail.com)
 * @since 4.2.4
 */

import EventEmitter from 'events'

import 'webrtc-adapter'

import {createCanvas} from 'canvas'
import freeice from 'freeice'
import merge from 'merge'
import sdpTranslator from 'sdp-translator'
import UAParser from 'ua-parser-js'
import {v4} from 'uuid'
import {
  MediaStream, RTCPeerConnection, RTCSessionDescription  // , mediaDevices
} from 'wrtc'


const recursive = merge.recursive.bind(undefined, true)


const MEDIA_CONSTRAINTS = {
  audio: true,
  video: {
    width: 640,
    framerate: 15
  }
}

// Somehow, the UAParser constructor gets an empty window object.
// We need to pass the user agent string in order to get information
const ua = typeof window !== 'undefined' && window.navigator?.userAgent || ''
const parser = new UAParser(ua)
const {name} = parser.getBrowser()

const usePlanB = name === 'Chrome' || name === 'Chromium'


/**
 * Returns a string representation of a SessionDescription object.
 */
function dumpSDP(description) {
  if (description == null) return ''

  return `type: ${description.type}\r\n${description.sdp}`
}

function filterTracksType({track: {kind}})
{
  return this.kind === kind
}

function replaceTrack(sender)
{
  const {track} = sender

  return sender.replaceTrack(this)
  .then(track?.stop.bind(track))
}

function replaceTracks(track)
{
  return this.filter(filterTracksType, track).map(replaceTrack, track)
}

/* Simulcast utilities */

function removeFIDFromOffer(sdp) {
  const n = sdp.indexOf("a=ssrc-group:FID");

  if (n === -1) return sdp;

  return sdp.slice(0, n);
}

function getFirstVideoTrack(stream)
{
  // Ensure all video tracks except first one and all audio tracks are stopped
  for(const track of stream.getAudioTracks()) track.stop()

  const [result, ...tracks] = stream.getVideoTracks()
  for(const track of tracks) track.stop()

  return result
}

function getMediaEnabled(type) {
  // [ToDo] Should return undefined if not all tracks have the same value?

  const senders = this.peerConnection.getSenders()
  if (!senders.length) return

  type = type.toLowerCase()

  for (const {track} of senders)
    if(track.kind === type && !track.enabled) return false

  return true
}

function setMediaEnabled(type, value) {
  type = type.toLowerCase()

  for (const {track} of this.peerConnection.getSenders())
    if(track.kind === type)
      track.enabled = value
}


/**
 * Wrapper object of an {RTCPeerConnection}. This object is aimed to simplify
 * the development of WebRTC-based applications.
 */
class WebRtcPeer extends EventEmitter
{
  /**
   * @constructor module:kurentoUtils.WebRtcPeer
   *
   * @param {String} mode Mode in which the PeerConnection will be configured.
   *  Valid values are: 'recv', 'send', and 'sendRecv'
   * @param {Object} [options]
   * @param {MediaStream} [options.audioStream] Stream to be used as second
   *  source (typically for audio) for localVideo and to be added as stream to
   *  the {RTCPeerConnection}
   * @param {HTMLVideoElement} [options.localVideo] Video tag for the local
   *  stream
   * @param {HTMLVideoElement} [options.remoteVideo] Video tag for the remote
   *  stream
   * @param {MediaStream} [options.videoStream] Stream to be used as primary
   *  source (typically video and audio, or only video if combined with
   *  audioStream) for localVideo and to be added as stream to the
   *  {RTCPeerConnection}
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
      logger = console,
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
    this.#dataChannelConfig = dataChannelConfig
    this.#dataChannels = dataChannels
    this.#id = id
    this.#localVideo = localVideo
    this.#logger = logger
    this.#mediaConstraints = mediaConstraints
    this.#mode = mode
    this.#multistream = multistream
    this.#onnegotiationneeded = onnegotiationneeded
    this.#ontrack = ontrack
    this.#peerConnection = peerConnection
    this.#remoteVideo = remoteVideo
    this.#sendSource = sendSource
    this.#simulcast = simulcast
    this.#videoStream = videoStream

    this.#interop = new sdpTranslator.Interop()

    this.#peerconnectionConfiguration = recursive({
      iceServers: freeice(freeiceOpts)
    },
    configuration)

    if (usePlanB) this.#logger.debug(name + ": using SDP PlanB")

    this.on('newListener', this.#onNewListener)

    if (oncandidategatheringdone)
      this.on('candidategatheringdone', oncandidategatheringdone)
    if (onicecandidate) this.on('icecandidate', onicecandidate)
    if (onstreamended) this.on('streamended', onstreamended)

    // Init PeerConnection
    if (!this.#peerConnection) {
      this.#peerConnection = new RTCPeerConnection(this.#peerconnectionConfiguration);
    }

    this.#initPeerConnection()
  }


  //
  // Public API
  //

  get audioEnabled() {
    return getMediaEnabled.call(this, 'Audio')
  }
  set audioEnabled(value) {
    setMediaEnabled.call(this, 'Audio', value)
  }

  /**
   * @member {(external:ImageData|undefined)} currentFrame
   */
  get currentFrame() {
    let video = this.#remoteVideo
    if (!video) {
      // We have a remote stream but we didn't set a remoteVideo tag
      const receivers = this.#peerConnection.getReceivers()
      if(!receivers.length)
        throw new Error('No remote video stream available')

      const stream = new MediaStream();

      for(const {track} of receivers) stream.addTrack(track);

      video = document.createElement('video')
      video.srcObject = stream
    }
    else if (video.readyState < video.HAVE_CURRENT_DATA)
      throw new Error('No remote video stream data available')

    const canvas = createCanvas()
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    canvas.getContext('2d').drawImage(video, 0, 0)

    if (!this.#remoteVideo) {
      video.pause();
      video.srcObject = null
      video.load();
    }

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

  get ready() {
    return this.#ready
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
    setMediaEnabled.call(this, 'Video', value)
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
    this.#logger.debug('Remote ICE candidate received', candidate)

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
    this.#logger.debug('Disposing WebRtcPeer')

    const pc = this.#peerConnection

    if (pc.connectionState === 'closed') return

    try {
      pc.close()
    } catch (err) {
      this.#logger.warn('Exception disposing webrtc peer:', err)
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
    .then(this.#setLocalDescription)
    .then(() => {
      let {localDescription} = this.#peerConnection;
      this.#logger.debug('Local description set\n', localDescription.sdp);

      if (this.#multistream && usePlanB) {
        localDescription = this.#interop.toUnifiedPlan(localDescription);

        this.#logger.debug('offer::origPlanB->UnifiedPlan', dumpSDP(
          localDescription));
      }

      return localDescription.sdp
    })
  }

  getReceiver(index) {
    return this.#peerConnection.getReceivers()[index || 0]
  }

  getSender(index) {
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
    if (this.#peerConnection.connectionState === 'closed')
      return Promise.reject(new Error('PeerConnection is closed'))

    let answer = new RTCSessionDescription({
      type: 'answer',
      sdp
    })

    if (this.#multistream && usePlanB) {
      answer = this.#interop.toPlanB(answer)

      this.#logger.debug('asnwer::planB', dumpSDP(answer))
    }

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
    if (this.#peerConnection.connectionState === 'closed')
      return Promise.reject(new Error('PeerConnection is closed'))

    let offer = new RTCSessionDescription({
      type: 'offer',
      sdp
    })

    if (this.#multistream && usePlanB) {
      offer = this.#interop.toPlanB(offer)

      this.#logger.debug('offer::planB', dumpSDP(offer))
    }

    return this.#peerConnection.setRemoteDescription(offer)
    .then(this.#setRemoteVideo)
    .then(this.#peerConnection.createAnswer.bind(this.#peerConnection))
    .then(this.#setLocalDescription)
    .then(() => {
      let {localDescription} = this.#peerConnection

      if (this.#multistream && usePlanB) {
        localDescription = this.#interop.toUnifiedPlan(localDescription)

        this.#logger.debug('answer::origPlanB->UnifiedPlan', dumpSDP(
          localDescription))
      }

      return localDescription.sdp
    })
  }

  replaceStream(stream)
  {
    // Replace local video
    if(this.#videoStream)
      for(const track of this.#videoStream.getTracks())
        track.stop();

    this.#videoStream = stream

    this.#showLocalVideo()

    // Replace senders
    const senders = this.peerConnection.getSenders()

    return Promise.all(stream.getTracks().flatMap(replaceTracks, senders))
  }

  replaceTrack(track)
  {
    const promise = typeof track === 'string'
                  ? this.#getMedia(track).then(getFirstVideoTrack)
                  : Promise.resolve(track)

    return promise.then(this.#replaceTrack)
  }

  send(data) {
    if (this.#dataChannel?.readyState === 'open')
      return this.#dataChannel.send(data)

    this.#logger.warn(
      'Trying to send data over a non-existing or closed data channel')
  }


  //
  // Private API
  //

  #audioStream
  #candidategatheringdone
  #candidatesQueueOut = []
  #dataChannelConfig
  #dataChannels
  #id  // read only
  #interop
  #dataChannel
  #localVideo
  #logger
  #mediaConstraints
  #mode
  #multistream
  #onnegotiationneeded
  #ontrack
  #peerConnection
  #peerconnectionConfiguration
  #remoteVideo
  #ready
  #sendSource
  #simulcast
  #videoStream

  // TODO eslint doesn't fully support private methods, replace arrow function
  #getMedia = track =>
  {
    let method = 'getUserMedia'
    let constraints = this.#mediaConstraints

    if(track === 'screen')
    {
      method = 'getDisplayMedia'

      constraints = {audio: false, video: true}
    }

    return navigator.mediaDevices[method](constraints)
    // return mediaDevices[method](constraints)
    .then(stream => {
      if(this.#videoStream)
      {
        for(const track of this.#videoStream.getVideoTracks())
          track.stop();

        if(track === 'screen')
          for(const track of this.#videoStream.getAudioTracks())
            stream.addTrack(track);
      }

      this.#videoStream = stream

      this.#showLocalVideo()

      return stream
    })
  }

  // TODO eslint doesn't fully support private methods, replace arrow function
  #getSimulcastInfo = videoStream => {
    const videoTracks = videoStream.getVideoTracks();

    if (!videoTracks.length) {
      this.#logger.warn('No video tracks available in the video stream')

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

  // TODO eslint doesn't fully support private methods, replace arrow function
  #initPeerConnection = () => {
    if (this.#dataChannels) {
      const {
        id = `WebRtcPeer-${this.#id}`,
        onbufferedamountlow,
        onclose,
        onerror = this.#logger.error,
        onmessage,
        onopen,
        options
      } = this.#dataChannelConfig

      this.#dataChannel = this.#peerConnection.createDataChannel(id, options);

      this.#dataChannel.addEventListener('open', onopen)
      this.#dataChannel.addEventListener('close', onclose)
      this.#dataChannel.addEventListener('message', onmessage)
      this.#dataChannel.addEventListener('bufferedamountlow', onbufferedamountlow)
      this.#dataChannel.addEventListener('error', onerror)
    }

    this.#peerConnection.addEventListener('connectionstatechange', this.#onConnectionStateChange)
    this.#peerConnection.addEventListener('icecandidate', this.#onIcecandidate);

    if(this.#onnegotiationneeded)
      this.#peerConnection.addEventListener('negotiationneeded', this.#onnegotiationneeded)
    if(this.#ontrack)
      this.#peerConnection.addEventListener('track', this.#ontrack)

    let promise
    if(this.#mode === 'recvonly' || this.#videoStream || this.#audioStream)
    {
      this.#showLocalVideo()

      promise = Promise.resolve()
    }
    else
      promise = this.#getMedia(this.#sendSource)

    this.#ready = promise.then(this.#start)
  }

  #onConnectionStateChange = () => {
    this.#logger.debug('onConnectionStateChange', this.#peerConnection.connectionState)

    switch(this.#peerConnection.connectionState) {
      case "connected":  // The connection has become fully connected
      case "disconnected":  // One or more transports has terminated
      case "failed":        // unexpectedly or in an error
      break;

      case "closed":  // The connection has been closed
        this.#peerConnection = new RTCPeerConnection(this.#peerconnectionConfiguration);

        this.#initPeerConnection()
      break;
    }
  }

  // If event.candidate == null, it means that candidate gathering has finished
  // and RTCPeerConnection.iceGatheringState === "complete". Such candidate does
  // not need to be sent to the remote peer.
  // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/icecandidate_event#Indicating_that_ICE_gathering_is_complete
  #onIcecandidate = ({candidate}) => {
    this.#logger.debug('onIcecandidate', candidate)

    if (EventEmitter.listenerCount(this, 'icecandidate') || EventEmitter
      .listenerCount(this, 'candidategatheringdone')) {
      if (candidate) {
        if (this.#multistream && usePlanB)
          candidate = this.#interop.candidateToUnifiedPlan(candidate);

        this.emit('icecandidate', candidate);
        this.#candidategatheringdone = false;
      } else if (!this.#candidategatheringdone) {
        this.emit('candidategatheringdone');
        this.#candidategatheringdone = true;
      }
    }

    // Not listening to 'icecandidate' or 'candidategatheringdone' events,
    // queue the candidate until one of them is listened
    else if (!this.#candidategatheringdone) {
      this.#candidatesQueueOut.push(candidate);

      if (!candidate) this.#candidategatheringdone = true;
    }
  }

  // TODO eslint doesn't fully support private methods, replace arrow function
  #onNewListener = (event, listener) => {
    const iscandidategatheringdone = event === 'candidategatheringdone'

    if (iscandidategatheringdone && event !== 'icecandidate') return

    let candidate
    while ((candidate = this.#candidatesQueueOut.shift()))
      if (!candidate === iscandidategatheringdone)
        listener(candidate)
  }

  #replaceTrack = (track = null) =>
  {
    let senders = this.peerConnection.getSenders()

    if(track) senders = senders.filter(filterTracksType, track)

    return Promise.all(senders.map(replaceTrack, track))
  }

  // TODO eslint doesn't fully support private methods, replace arrow function
  #setLocalDescription = localDescription => {
    if (this.#simulcast)
      if (!usePlanB)
        this.#logger.warn('Simulcast is only available in Chrome browser.')

      else {
        this.#logger.debug('Adding multicast info')

        localDescription = new RTCSessionDescription({
          type: localDescription.type,
          sdp: removeFIDFromOffer(localDescription.sdp) + this.#getSimulcastInfo(
            this.#videoStream)
        })
      }

    return this.#peerConnection.setLocalDescription(localDescription)
  }

  #setRemoteVideo = () => {
    if (!this.#remoteVideo) return

    const stream = new MediaStream();

    for(const {track} of this.#peerConnection.getReceivers())
      stream.addTrack(track);

    this.#remoteVideo.pause()
    this.#remoteVideo.srcObject = stream
    this.#remoteVideo.load();
  }

  // TODO eslint doesn't fully support private methods, replace arrow function
  #showLocalVideo = () => {
    if (!(this.#videoStream && this.#localVideo)) return

    this.#localVideo.srcObject = this.#videoStream
    this.#localVideo.muted = true
  }

  #start = () => {
    if (this.#peerConnection.connectionState === 'closed')
      throw new Error('The peer connection object is in `closed` state. This ' +
        'is most likely due to an invocation of the `dispose` method before ' +
        'accepting in the dialogue')

    const self = this

    // TODO maybe this can be deleted?
    function streamEndedListener() {
      self.emit('streamended', this);
    }

    if (this.#videoStream) {
      this.#videoStream.addEventListener('ended', streamEndedListener);

      for(const track of this.#videoStream.getTracks())
        this.#peerConnection.addTrack(track);
    }

    if (this.#audioStream) {
      this.#audioStream.addEventListener('ended', streamEndedListener);

      for(const track of this.#audioStream.getTracks())
        this.#peerConnection.addTrack(track);
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

// https://github.com/Automattic/node-canvas/issues/487
export {createCanvas}
