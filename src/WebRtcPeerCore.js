/*
 * (C) Copyright 2014-2020 Kurento (http://kurento.org/)
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

import {createCanvas, createImageData} from 'canvas'
import freeice from 'freeice'
import merge from 'merge'
import {v4} from 'uuid'
import {
  RTCPeerConnection,
  RTCSessionDescription,
  mediaDevices,
  nonstandard
} from 'wrtc'


const recursive = merge.recursive.bind(undefined, true)


const MEDIA_CONSTRAINTS = {
  audio: true,
  video: {
    width: 640,
    framerate: 15
  }
}


/**
 * Apply an optional callback to a promise and return the new one
 *
 * @param Promise promise
 * @param {} [callback]
 */
function asCallback(promise, callback)
{
  if(callback) return promise.then(callback.bind(null, null), callback)

  return promise
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
export default class WebRtcPeerCore extends EventEmitter
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
   * @param {MediaStream} [options.videoStream] Stream to be used as primary
   *  source (typically video and audio, or only video if combined with
   *  audioStream) for localVideo and to be added as stream to the
   *  {RTCPeerConnection}
   * @param {} [callback] Deprecated
   */
  constructor(mode, options, callback)
  {
    if (options instanceof Function) {
      callback = options
      options = undefined
    }

    const {
      audioStream,
      configuration,
      dataChannelConfig = {},
      dataChannels,
      freeice: freeiceOpts,
      id = v4(),
      logger = console,
      mediaConstraints = MEDIA_CONSTRAINTS,
      oncandidategatheringdone,
      onicecandidate,
      onnegotiationneeded,
      onstreamended,
      ontrack,
      peerConnection,
      sendSource = 'webcam',
      simulcast,
      usePlanB,
      videoStream
    } = options || {}

    super()

    this.#audioStream = audioStream
    this.#dataChannelConfig = dataChannelConfig
    this.#dataChannels = dataChannels
    this.#id = id
    this.#logger = logger
    this.#mediaConstraints = mediaConstraints
    this.#mode = mode
    this.#onnegotiationneeded = onnegotiationneeded
    this.#ontrack = ontrack
    this.#peerConnection = peerConnection
    this.#sendSource = sendSource
    this.#simulcast = simulcast
    this.#usePlanB = usePlanB
    this.#videoStream = videoStream

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

    asCallback(this.ready, callback)
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
    if(!nonstandard)
      throw new Error('Stream-based `currentFrame` only available in Node.js')

    const lastFrame = this.#lastFrame

    if(!lastFrame) throw new Error('No remote video stream available')

    const {height, width} = lastFrame

    const rgba = new Uint8ClampedArray(width * height * 4)
    const rgbaFrame = createImageData(rgba, width, height)

    nonstandard.i420ToRgba(lastFrame, rgbaFrame)

    const canvas = createCanvas(width, height)

    canvas.getContext('2d').putImageData(rgbaFrame, 0, 0)

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

  get peerConnection() {
    return this.#peerConnection
  }

  get ready() {
    return this.#ready
  }

  get remoteSessionDescriptor() {
    return this.#peerConnection.remoteDescription
  }

  get videoEnabled() {
    return getMediaEnabled.call(this, 'Video')
  }
  set videoEnabled(value) {
    setMediaEnabled.call(this, 'Video', value)
  }

  get videoStream() {
    return this.#videoStream
  }

  /**
   * Callback function invoked when an ICE candidate is received. Developers are
   * expected to invoke this function in order to complete the SDP negotiation.
   *
   * @function module:kurentoUtils.WebRtcPeer.prototype.addIceCandidate
   *
   * @param candidate - Literal object with the ICE candidate description
   * @param [callback] - Deprecated: Called when the ICE candidate has been added
   *
   * @returns Promise
   */
  addIceCandidate(candidate, callback) {
    this.#logger.debug('Remote ICE candidate received', candidate)

    return asCallback(this.#peerConnection.addIceCandidate(candidate), callback)
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

    if(this.#audioStream)
      for(const track of this.#audioStream.getTracks())
        track.stop()

    if(this.#videoStream)
      for(const track of this.#videoStream.getTracks())
        track.stop()

    this.removeAllListeners();
  }

  /**
   * @param [callback] - Deprecated
   *
   * @returns {Promise}
   */
  generateOffer(callback) {
    switch(this.#mode)
    {
      case 'recvonly':
      {
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
      break

      case 'sendonly':
        /* The constructor's "start()" method already added any available track,
         * which by default creates Transceiver with "sendrecv" direction.
         *
         * Here, we set all transceivers to only send audio and/or video, so
         * the SDP Offer that will be generated by the PC includes these medias
         * with the "a=sendonly" attribute.
         */
        for(const transceiver of this.#peerConnection.getTransceivers())
          transceiver.direction = "sendonly";
    }

    const promise = this.#peerConnection.createOffer()
    .then(this.#setLocalDescription)
    .then(() => {
      const {localDescription} = this.#peerConnection;
      this.#logger.debug('Local description set\n', localDescription.sdp);

      return localDescription.sdp
    })

    return asCallback(promise, callback)
  }

  /**
   *
   * @param {Integer} [index]
   */
  getReceiver(index = 0) {
    return this.#peerConnection.getReceivers()[index]
  }

  /**
   *
   * @param {Integer} [index]
   */
  getSender(index = 0) {
    return this.#peerConnection.getSenders()[index]
  }

  /**
   * Callback function invoked when a SDP answer is received
   *
   * Developers are expected to invoke this function in order to complete the
   * SDP negotiation.
   *
   * @function module:kurentoUtils.WebRtcPeer.prototype.processAnswer
   *
   * @param sdp - Description of sdpAnswer
   * @param {} [callback] - Deprecated: Invoked after the SDP answer is
   *  processed, or there is an error
   *
   * @returns {Promise}
   */
  processAnswer(sdp, callback) {
    if (this.#peerConnection.connectionState === 'closed')
      return Promise.reject(new Error('PeerConnection is closed'))

    const answer = new RTCSessionDescription({
      type: 'answer',
      sdp
    })

    const promise = this.#peerConnection.setRemoteDescription(answer)
    .then(this.#setRemoteVideo)

    return asCallback(promise, callback)
  }

  /**
   * Callback function invoked when a SDP offer is received
   *
   * Developers are expected to invoke this function in order to complete the
   * SDP negotiation.
   *
   * @function module:kurentoUtils.WebRtcPeer.prototype.processOffer
   *
   * @param sdp - Description of sdpOffer
   * @param {} [callback] - Deprecated: Called when the remote description has
   *  been set successfully
   *
   * @returns {Promise}
   */
  processOffer(sdp, callback) {
    if (this.#peerConnection.connectionState === 'closed')
      return Promise.reject(new Error('PeerConnection is closed'))

    const offer = new RTCSessionDescription({
      type: 'offer',
      sdp
    })

    const promise = this.#peerConnection.setRemoteDescription(offer)
    .then(this.#setRemoteVideo)
    .then(this.#peerConnection.createAnswer.bind(this.#peerConnection))
    .then(this.#setLocalDescription)
    .then(() => this.#peerConnection.localDescription.sdp)

    return asCallback(promise, callback)
  }

  /**
   * Fully replace the sending stream without re-negotiation
   *
   * @param {MediaStream} stream
   *
   * @returns {Promise}
   */
  replaceStream(stream)
  {
    // Replace local video
    if(this.#videoStream)
      for(const track of this.#videoStream.getTracks())
        track.stop();

    this.#setVideoStream(stream)

    // Replace senders
    const senders = this.peerConnection.getSenders()

    return Promise.all(stream.getTracks().flatMap(replaceTracks, senders))
  }

  /**
   * Replace the video track in the sending stream without re-negotiation
   *
   * @param {MediaTrack|String} track
   *
   * @returns {Promise}
   */
  replaceTrack(track)
  {
    const promise = typeof track === 'string'
                  ? this.#getMedia(track).then(getFirstVideoTrack)
                  : Promise.resolve(track)

    return promise.then(this.#replaceTrack)
  }

  /**
   * Send a message using the DataChannel instance
   *
   * @param {*} data
   */
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
  #lastFrame
  #logger
  #mediaConstraints
  #mode
  #onnegotiationneeded
  #ontrack
  #peerConnection
  #peerconnectionConfiguration
  #ready
  #sendSource
  #simulcast
  #usePlanB
  #videoStream
  #videoSink

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

    return mediaDevices[method](constraints)
    .then(stream => {
      if(this.#videoStream)
      {
        for(const track of this.#videoStream.getVideoTracks())
          track.stop();

        if(track === 'screen')
          for(const track of this.#videoStream.getAudioTracks())
            stream.addTrack(track);
      }

      this.#setVideoStream(stream)

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
      this.emit('setLocalVideo')

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

  #onFrame = ({frame}) => this.#lastFrame = frame

  // If event.candidate == null, it means that candidate gathering has finished
  // and RTCPeerConnection.iceGatheringState === "complete". Such candidate does
  // not need to be sent to the remote peer.
  // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/icecandidate_event#Indicating_that_ICE_gathering_is_complete
  #onIcecandidate = ({candidate}) => {
    this.#logger.debug('onIcecandidate', candidate)

    if (EventEmitter.listenerCount(this, 'icecandidate') || EventEmitter
      .listenerCount(this, 'candidategatheringdone')) {
      if (candidate) {
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
      if (!this.#usePlanB)
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

  // TODO eslint doesn't fully support private methods, replace arrow function
  #setVideoStream = stream =>
  {
    this.#videoStream = stream

    this.emit('setLocalVideo')
  }

  #setRemoteVideo = () =>
  {
    if(this.#videoSink)
    {
      this.#videoSink.stop()
      this.#videoSink.removeEventListener('frame', this.#onFrame)
    }

    this.emit('setRemoteVideo')

    if(!nonstandard) return

    const [receiver] = this.peerConnection.getReceivers()
    .filter(filterTracksType, {kind: 'video'})
    if(receiver)
    {
      this.#videoSink = new nonstandard.RTCVideoSink(receiver.track)
      this.#videoSink.addEventListener('frame', this.#onFrame)

      return
    }

    this.#lastFrame = null
    this.#videoSink = null
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


// https://github.com/Automattic/node-canvas/issues/487
export {WebRtcPeerCore, createCanvas}
