const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const wss = new WebSocket.Server({ server });
const users = new Map();

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleMessage(ws, data);
    } catch (error) {
      console.error('Erreur parsing message:', error);
    }
  });

  ws.on('close', () => {
    for (const [username, userWs] of users.entries()) {
      if (userWs === ws) {
        users.delete(username);
        broadcastUserList();
        break;
      }
    }
  });
});

function handleMessage(ws, data) {
  switch (data.type) {
    case 'join':
      handleJoin(ws, data);
      break;
    case 'call':
      handleCall(ws, data);
      break;
    case 'answer':
      handleAnswer(ws, data);
      break;
    case 'reject':
      handleReject(ws, data);
      break;
    case 'offer':
    case 'answer-webrtc':
    case 'ice-candidate':
      handleWebRTCSignaling(ws, data);
      break;
    case 'hangup':
      handleHangup(ws, data);
      break;
    default:
      console.log('Type de message non reconnu:', data.type);
  }
}

function handleJoin(ws, data) {
  const { username } = data;
  
  if (users.has(username)) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Nom d\'utilisateur déjà pris'
    }));
    return;
  }

  users.set(username, ws);
  ws.username = username;

  ws.send(JSON.stringify({
    type: 'joined',
    username: username
  }));
  broadcastUserList();
}

function handleCall(ws, data) {
  const { to } = data;
  const from = ws.username;
  
  const targetWs = users.get(to);
  if (targetWs) {
    targetWs.send(JSON.stringify({
      type: 'incoming-call',
      from: from
    }));
  }
}

function handleAnswer(ws, data) {
  const { from } = data;
  const to = ws.username;
  
  const callerWs = users.get(from);
  if (callerWs) {
    callerWs.send(JSON.stringify({
      type: 'call-accepted',
      from: to
    }));
  }
}

function handleReject(ws, data) {
  const { from } = data;
  const to = ws.username;
  
  const callerWs = users.get(from);
  if (callerWs) {
    callerWs.send(JSON.stringify({
      type: 'call-rejected',
      from: to
    }));
  }
}

function handleWebRTCSignaling(ws, data) {
  const { to } = data;
  const targetWs = users.get(to);
  
  if (targetWs) {
    targetWs.send(JSON.stringify({
      ...data,
      from: ws.username
    }));
  }
}

function handleHangup(ws, data) {
  const { to } = data;
  const targetWs = users.get(to);
  
  if (targetWs) {
    targetWs.send(JSON.stringify({
      type: 'hangup',
      from: ws.username
    }));
  }
}

function broadcastUserList() {
  const userList = Array.from(users.keys());
  const message = JSON.stringify({
    type: 'user-list',
    users: userList
  });

  users.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});