// server.js
const http = require('http');
const WebSocket = require('ws');
const server = http.createServer();
const wss = new WebSocket.Server({ server });

const rooms = {}; // roomCode -> { players: [ws,...], state }

function broadcast(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  const payload = JSON.stringify({ type: 'state', state: room.state });
  room.players.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  });
}

function createDeck() {
  const suits = ['♠','♥','♦','♣'];
  const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const d = [];
  for (let s of suits) for (let r of ranks) d.push({ rank: r, suit: s });
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function cardValue(c) {
  if (c.rank === 'A') return 11;
  if (['J','Q','K'].includes(c.rank)) return 10;
  return parseInt(c.rank, 10);
}

function handValue(hand) {
  let total = 0, aces = 0;
  for (let c of hand) {
    total += cardValue(c);
    if (c.rank === 'A') aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

wss.on('connection', ws => {
  let joinedRoom = null;
  let playerId = null;

  ws.on('message', msg => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }

    if (data.type === 'join') {
      const roomCode = data.room || 'default';
      if (!rooms[roomCode]) {
        rooms[roomCode] = {
          players: [],
          state: {
            deck: [],
            dealer: [],
            players: [],
            currentPlayer: 0,
            inRound: false,
            message: ''
          }
        };
      }
      const room = rooms[roomCode];
      room.players.push(ws);
      playerId = room.state.players.length;
      room.state.players.push({ hand: [], total: 0 });
      joinedRoom = roomCode;
      broadcast(joinedRoom);
    }

    if (!joinedRoom) return;
    const room = rooms[joinedRoom];
    const state = room.state;

    if (data.type === 'deal') {
      state.deck = createDeck();
      state.dealer = [];
      state.players.forEach(p => p.hand = []);
      state.inRound = true;
      state.currentPlayer = 0;
      state.message = '';

      state.players.forEach(p => {
        p.hand.push(state.deck.pop());
      });
      state.dealer.push(state.deck.pop());
      state.players.forEach(p => {
        p.hand.push(state.deck.pop());
      });
      state.dealer.push(state.deck.pop());

      state.players.forEach(p => p.total = handValue(p.hand));
      broadcast(joinedRoom);
    }

    if (data.type === 'hit' && state.inRound) {
      const p = state.players[state.currentPlayer];
      p.hand.push(state.deck.pop());
      p.total = handValue(p.hand);
      if (p.total > 21) {
        state.message = `Player ${state.currentPlayer + 1} busts.`;
        state.currentPlayer++;
        if (state.currentPlayer >= state.players.length) {
          // dealer plays
          while (handValue(state.dealer) < 17) {
            state.dealer.push(state.deck.pop());
          }
          state.inRound = false;
        }
      }
      broadcast(joinedRoom);
    }

    if (data.type === 'stand' && state.inRound) {
      state.currentPlayer++;
      if (state.currentPlayer >= state.players.length) {
        while (handValue(state.dealer) < 17) {
          state.dealer.push(state.deck.pop());
        }
        state.inRound = false;
      }
      broadcast(joinedRoom);
    }
  });

  ws.on('close', () => {
    if (!joinedRoom) return;
    const room = rooms[joinedRoom];
    if (!room) return;
    room.players = room.players.filter(p => p !== ws);
    if (room.players.length === 0) delete rooms[joinedRoom];
  });
});

server.listen(8080, () => {
  console.log('Server on http://localhost:8080');
});
