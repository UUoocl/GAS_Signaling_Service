/*
 *  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

'use strict';

const addButton = document.querySelector('button#add');
const candidateTBody = document.querySelector('tbody#candidatesBody');
const gatherButton = document.querySelector('button#gather');
const passwordInput = document.querySelector('input#password');
const removeButton = document.querySelector('button#remove');
const resetButton = document.querySelector('button#reset');
const servers = document.querySelector('select#servers');
const urlInput = document.querySelector('input#url');
const usernameInput = document.querySelector('input#username');
const getUserMediaInput = document.querySelector('input#getUserMedia');

addButton.onclick = addServer;
gatherButton.onclick = start;
removeButton.onclick = removeServer;
resetButton.onclick = (e) => {
  window.localStorage.clear();
  document.querySelectorAll('select#servers option').forEach(option => option.remove());
  const serversSelect = document.querySelector('select#servers');
  setDefaultServer(serversSelect);
};

let begin;
let pc;
let stream;
let candidates;

const allServersKey = 'servers';

function setDefaultServer(serversSelect) {
  const option = document.createElement('option');
  option.value = '{"urls":["stun:stun.l.google.com:19302"]}';
  option.text = 'stun:stun.l.google.com:19302';
  option.ondblclick = selectServer;
  serversSelect.add(option);
}

function writeServersToLocalStorage() {
  const serversSelect = document.querySelector('select#servers');
  const allServers = JSON.stringify(Object.values(serversSelect.options).map(o => JSON.parse(o.value)));
  window.localStorage.setItem(allServersKey, allServers);
}

function readServersFromLocalStorage() {
  document.querySelectorAll('select#servers option').forEach(option => option.remove());
  const serversSelect = document.querySelector('select#servers');
  const storedServers = window.localStorage.getItem(allServersKey);

  if (storedServers === null || storedServers === '') {
    setDefaultServer(serversSelect);
  } else {
    JSON.parse(storedServers).forEach((server, key) => {
      const o = document.createElement('option');
      o.value = JSON.stringify(server);
      o.text = server.urls[0];
      o.ondblclick = selectServer;
      serversSelect.add(o);
    });
  }
}

function selectServer(event) {
  const option = event.target;
  const value = JSON.parse(option.value);
  urlInput.value = value.urls[0];
  usernameInput.value = value.username || '';
  passwordInput.value = value.credential || '';
}

function addServer() {
  if (urlInput.value === '' && usernameInput.value === '' && passwordInput.value === '') {
    // Ignore since this leads to invisible items being added to the list.
    console.warn('Not adding empty ICE server input');
    return;
  }
  // Store the ICE server as a stringified JSON object in option.value.
  const option = document.createElement('option');
  const iceServer = {
    urls: [urlInput.value],
    username: usernameInput.value,
    credential: passwordInput.value
  };
  option.value = JSON.stringify(iceServer);
  option.text = `${urlInput.value} `;
  const username = usernameInput.value;
  const password = passwordInput.value;
  if (username || password) {
    option.text += (` [${username}:${password}]`);
  }
  option.ondblclick = selectServer;
  servers.add(option);
  urlInput.value = usernameInput.value = passwordInput.value = '';
  writeServersToLocalStorage();
}

function removeServer() {
  for (let i = servers.options.length - 1; i >= 0; --i) {
    if (servers.options[i].selected) {
      servers.remove(i);
    }
  }
  writeServersToLocalStorage();
}

async function start() {
  // Clean out the table.
  while (candidateTBody.firstChild) {
    candidateTBody.removeChild(candidateTBody.firstChild);
  }

  gatherButton.disabled = true;
  if (getUserMediaInput.checked) {
    stream = await navigator.mediaDevices.getUserMedia({audio: true});
  }
  getUserMediaInput.disabled = true;

  // Read the values from the input boxes.
  const iceServers = [];
  for (let i = 0; i < servers.length; ++i) {
    iceServers.push(JSON.parse(servers[i].value));
  }
  const transports = document.getElementsByName('transports');
  let iceTransports;
  for (let i = 0; i < transports.length; ++i) {
    if (transports[i].checked) {
      iceTransports = transports[i].value;
      break;
    }
  }

  // Create a PeerConnection with no streams, but force a m=audio line.
  const config = {
    iceServers: iceServers,
    iceTransportPolicy: iceTransports,
  };

  const offerOptions = {offerToReceiveAudio: 1};
  // Whether we gather IPv6 candidates.
  // Whether we only gather a single set of candidates for RTP and RTCP.

  console.log(`Creating new PeerConnection with config=${JSON.stringify(config)}`);
  const errDiv = document.getElementById('error');
  errDiv.innerText = '';
  let desc;
  try {
    console.log(config)
    pc = new RTCPeerConnection(config);
    pc.onicecandidate = iceCallback;
    pc.onicegatheringstatechange = gatheringStateChange;
    pc.onicecandidateerror = iceCandidateError;
    if (stream) {
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
    }
   desc = await pc.createOffer(offerOptions);
  } catch (err) {
    errDiv.innerText = `Error creating offer: ${err}`;
    gatherButton.disabled = false;
    return;
  }
  begin = window.performance.now();
  candidates = [];
  pc.setLocalDescription(desc);
}

// Parse the uint32 PRIORITY field into its constituent parts from RFC 5245,
// type preference, local preference, and (256 - component ID).
// ex: 126 | 32252 | 255 (126 is host preference, 255 is component ID 1)
function formatPriority(priority) {
  return [
    priority >> 24,
    (priority >> 8) & 0xFFFF,
    priority & 0xFF
  ].join(' | ');
}

function appendCell(row, val) {
  const cell = document.createElement('td');
  cell.textContent = val;
  row.appendChild(cell);
}

// Try to determine authentication failures and unreachable TURN
// servers by using heuristics on the candidate types gathered.
function getFinalResult() {
  let result = 'Done';

  // if more than one server is used, it can not be determined
  // which server failed.
  if (servers.length === 1) {
    const server = JSON.parse(servers[0].value);

    // get the candidates types (host, srflx, relay)
    const types = candidates.map((cand) => cand.type);

    // If the server is a TURN server we should have a relay candidate.
    // If we did not get a relay candidate but a srflx candidate
    // authentication might have failed.
    // If we did not get  a relay candidate or a srflx candidate
    // we could not reach the TURN server. Either it is not running at
    // the target address or the clients access to the port is blocked.
    //
    // This only works for TURN/UDP since we do not get
    // srflx candidates from TURN/TCP.
    if (server.urls[0].indexOf('turn:') === 0 &&
      server.urls[0].indexOf('?transport=tcp') === -1) {
      if (types.indexOf('relay') === -1) {
        if (types.indexOf('srflx') > -1) {
          // a binding response but no relay candidate suggests auth failure.
          result = 'Authentication failed?';
        } else {
          // either the TURN server is down or the clients access is blocked.
          result = 'Not reachable?';
        }
      }
    }
  }
  return result;
}

async function iceCallback(event) {
    console.log('event ',event)
  const elapsed = ((window.performance.now() - begin) / 1000).toFixed(3);
  const row = document.createElement('tr');
  if (event.candidate) {
    if (event.candidate.candidate === '') {
      return;
    }
    appendCell(row, elapsed);
    const {candidate} = event;
    let url;
    // Until url is available from the candidate, to to polyfill.
    if (['srflx', 'relay'].includes(candidate.type) && !candidate.url) {
      const stats = await pc.getStats();
      stats.forEach(report => {
        if (!url && report.type === 'local-candidate' &&
            report.address === candidate.address &&
            report.port === candidate.port) {
          url = report.url;
        }
      });
    }

    appendCell(row, candidate.type);
    appendCell(row, candidate.foundation);
    appendCell(row, candidate.protocol);
    appendCell(row, candidate.address);
    appendCell(row, candidate.port);
    appendCell(row, formatPriority(candidate.priority));
    appendCell(row, candidate.url || url || '');
    appendCell(row, candidate.relayProtocol || '');
    candidates.push(candidate);
  }
  candidateTBody.appendChild(row);
}

function gatheringStateChange() {
  if (pc.iceGatheringState !== 'complete') {
    return;
  }
  const elapsed = ((window.performance.now() - begin) / 1000).toFixed(3);
  const row = document.createElement('tr');
  appendCell(row, elapsed);
  appendCell(row, getFinalResult());
  pc.close();
  pc = null;
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  gatherButton.disabled = false;
  getUserMediaInput.disabled = false;
  candidateTBody.appendChild(row);
}

function iceCandidateError(e) {
  // The interesting attributes of the error are
  // * the url (which allows looking up the server)
  // * the errorCode and errorText
  document.getElementById('error-note').style.display = 'block';
  document.getElementById('error').innerText += 'The server ' + e.url +
    ' returned an error with code=' + e.errorCode + ':\n' +
    e.errorText + '\n';
}

readServersFromLocalStorage();

// check if we have getUserMedia permissions.
navigator.mediaDevices
    .enumerateDevices()
    .then(function(devices) {
      devices.forEach(function(device) {
        if (device.label !== '') {
          document.getElementById('getUserMediaPermissions').style.display = 'block';
        }
      });
    });