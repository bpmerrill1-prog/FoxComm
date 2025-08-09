
const WebSocket = require('ws');
const http = require('http');
const upnp = require('node-upnp');
const port = process.argv[2] ? parseInt(process.argv[2]) : 3000;

const server = http.createServer();
const wss = new WebSocket.Server({ server });
let rooms = {}; // roomId -> Set<ws>

wss.on('connection', function connection(ws) {
  ws.on('message', function message(msg) {
    try {
      const data = JSON.parse(msg.toString());
      const { type, room, payload, from } = data;
      if (!room) return;
      if (type === 'join') {
        ws.room = room;
        rooms[room] = rooms[room] || new Set();
        rooms[room].add(ws);
        broadcast(room, { type: 'peer-joined' }, ws);
      } else if (type === 'signal') {
        broadcast(room, { type: 'signal', payload, from }, ws);
      } else if (type === 'leave') {
        leaveRoom(ws);
      }
    } catch(e) {
      console.error('Bad message', e);
    }
  });

  ws.on('close', () => leaveRoom(ws));
});

function broadcast(room, message, except) {
  const set = rooms[room];
  if (!set) return;
  const text = JSON.stringify(message);
  for (const client of set) {
    if (client.readyState === 1 && client !== except) {
      client.send(text);
    }
  }
}

function leaveRoom(ws) {
  const room = ws.room;
  if (!room) return;
  const set = rooms[room];
  if (!set) return;
  set.delete(ws);
  broadcast(room, { type: 'peer-left' });
  if (set.size === 0) delete rooms[room];
}

function upnpMap(port){
  try{
    const client = new upnp.UPnPClient();
    client.map(port, port, 'TCP', 'FoxComm Signal', (err)=>{
      if (err) console.warn('UPnP TCP map failed', err);
      else console.log('UPnP TCP mapped', port);
    });
  }catch(e){ console.warn('UPnP not available', e); }
}

server.listen(port, () => {
  console.log('FoxComm signaling server listening on', port);
  upnpMap(port);
});
