/*
 *  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

'use strict';

const url = 'https://script.google.com/macros/s/AKfycbwbVCo1_AozKouHDSbHeYMaxx_Azy63-UmJpyxGi3oGmFwCatd-6SEwkZtDgQ-KV0J4qw/exec'
        
let callerConnection;
//let remoteConnection;
let sendChannel;
let receiveChannel;
const dataChannelSend = document.querySelector('textarea#dataChannelSend');
const dataChannelReceive = document.querySelector('textarea#dataChannelReceive');
const startButton = document.querySelector('button#startButton');
const sendButton = document.querySelector('button#sendButton');
const closeButton = document.querySelector('button#closeButton');

startButton.onclick = createOffer;
sendButton.onclick = sendData;
closeButton.onclick = closeDataChannels;

function enableStartButton() {
  startButton.disabled = false;
}

function disableSendButton() {
  sendButton.disabled = true;
}

function createOffer() {
  dataChannelSend.placeholder = '';
  const servers = {'iceServers': [
    {'urls': 'stun:stun.l.google.com:19302'},
    {'urls': 'stun:stun.l.google.com:5349'}
  ]};
  
  window.callerConnection = callerConnection = new RTCPeerConnection(servers);
  console.log('Created caller peer connection object callerConnection');
  console.log('gather ICS candidates callerConnection');
  callerConnection.onicecandidate = onIceCandidate;
  // pc.onicegatheringstatechange = gatheringStateChange;
  // pc.onicecandidateerror = iceCandidateError;
  


  callerConnection.createOffer().then((offer) => {
    callerConnection.setLocalDescription(offer),
    console.log(`Offer from callerConnection\n${offer.sdp}`)
    //send offer to google sheets
    postData(offer,`${url}?step=1`);
  }
  );
  
  startButton.disabled = true;
  closeButton.disabled = false;
}
  
  function setRemoteDescription(){
    callerConnection.onicecandidate = e => {
      onIceCandidate(callerConnection, e);
      peerConnection.onicecandidate = e => onIceCandidate(peerConnection, e);
    };
  }

function createDataChannel(){
  sendChannel = callerConnection.createDataChannel('sendDataChannel');
  console.log('Created send data channel');

  sendChannel.onopen = onSendChannelStateChange;
  sendChannel.onclose = onSendChannelStateChange;
}

function onCreateSessionDescriptionError(error) {
  console.log('Failed to create session description: ' + error.toString());
}

function sendData() {
  const data = dataChannelSend.value;
  sendChannel.send(data);
  console.log('Sent Data: ' + data);
}

function closeDataChannels() {
  console.log('Closing data channels');
  sendChannel.close();
  console.log('Closed data channel with label: ' + sendChannel.label);
  receiveChannel.close();
  console.log('Closed data channel with label: ' + receiveChannel.label);
  callerConnection.close();
  remoteConnection.close();
  callerConnection = null;
  remoteConnection = null;
  console.log('Closed peer connections');
  startButton.disabled = false;
  sendButton.disabled = true;
  closeButton.disabled = true;
  dataChannelSend.value = '';
  dataChannelReceive.value = '';
  dataChannelSend.disabled = true;
  disableSendButton();
  enableStartButton();
}



function gotDescription2(desc) {
  remoteConnection.setcallerDescription(desc);
  console.log(`Answer from remoteConnection\n${desc.sdp}`);
  callerConnection.setRemoteDescription(desc);
}



function getOtherPc(pc) {
  return (pc === localConnection) ? remoteConnection : localConnection;
}

function getName(pc) {
  return (pc === localConnection) ? 'localPeerConnection' : 'remotePeerConnection';
}


//ICE Candidate functions
function onIceCandidate(pc, event) {
  pc
    .addIceCandidate(event.candidate)
      .then(
          onAddIceCandidateSuccess,
          onAddIceCandidateError
      );
  console.log(`${pc} ICE candidate: ${event.candidate ? event.candidate.candidate : '(null)'}`);
}

function onAddIceCandidateSuccess() {
  console.log('AddIceCandidate success.');
}

function onAddIceCandidateError(error) {
  console.log(`Failed to add Ice Candidate: ${error.toString()}`);
}


//Data Channel Functions
function receiveChannelCallback(event) {
  console.log('Receive Channel Callback');
  receiveChannel = event.channel;
  receiveChannel.onmessage = onReceiveMessageCallback;
  receiveChannel.onopen = onReceiveChannelStateChange;
  receiveChannel.onclose = onReceiveChannelStateChange;
}

function onReceiveMessageCallback(event) {
  console.log('Received Message');
  dataChannelReceive.value = event.data;
}

function onSendChannelStateChange() {
  const readyState = sendChannel.readyState;
  console.log('Send channel state is: ' + readyState);
  if (readyState === 'open') {
    dataChannelSend.disabled = false;
    dataChannelSend.focus();
    sendButton.disabled = false;
    closeButton.disabled = false;
  } else {
    dataChannelSend.disabled = true;
    sendButton.disabled = true;
    closeButton.disabled = true;
  }
}

function onReceiveChannelStateChange() {
  const readyState = receiveChannel.readyState;
  console.log(`Receive channel state is: ${readyState}`);
}