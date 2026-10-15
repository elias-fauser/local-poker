const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Einfaches Kartendeck generieren
function createDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    let deck = [];
    for (let s of suits) {
        for (let v of values) {
            deck.push({ suit: v + s, color: (s === '♥' || s === '♦') ? 'red' : 'black' });
        }
    }
    // Mischen (Fisher-Yates)
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

let gameState = {
    players: {}, // id: { name, chips, cards, bet }
    pot: 0,
    communityCards: [],
    deck: [],
    gameStage: 'waiting', // waiting, preflop, flop, turn, river, showdown
    hostId: null
};

io.on('connection', (socket) => {
    console.log('Ein Spieler verbunden:', socket.id);

    // Erster Spieler wird automatisch Host, wenn noch keiner da ist
    if (!gameState.hostId) {
        gameState.hostId = socket.id;
        socket.emit('set-host');
    }

    socket.on('join-game', (name) => {
        gameState.players[socket.id] = {
            id: socket.id,
            name: name || `Spieler ${Object.keys(gameState.players).length + 1}`,
            chips: 1000, // Startkapital
            cards: [],
            bet: 0,
            folded: false
        };
        io.emit('update-game', gameState);
    });

    // Spiel starten / Neue Runde
    socket.on('start-round', () => {
        if (socket.id !== gameState.hostId) return;
        
        gameState.deck = createDeck();
        gameState.communityCards = [];
        gameState.pot = 0;
        gameState.gameStage = 'preflop';

        // Karten an Spieler verteilen (je 2)
        for (let id in gameState.players) {
            gameState.players[id].cards = [gameState.deck.pop(), gameState.deck.pop()];
            gameState.players[id].folded = false;
            gameState.players[id].bet = 0;
        }
        io.emit('update-game', gameState);
    });

    // Flop aufdecken (3 Karten)
    socket.on('deal-flop', () => {
        if (socket.id !== gameState.hostId) return;
        gameState.deck.pop(); // Burn card
        gameState.communityCards.push(gameState.deck.pop(), gameState.deck.pop(), gameState.deck.pop());
        gameState.gameStage = 'flop';
        io.emit('update-game', gameState);
    });

    // Turn aufdecken (1 Karte)
    socket.on('deal-turn', () => {
        if (socket.id !== gameState.hostId) return;
        gameState.deck.pop(); // Burn card
        gameState.communityCards.push(gameState.deck.pop());
        gameState.gameStage = 'turn';
        io.emit('update-game', gameState);
    });

    // River aufdecken (1 Karte)
    socket.on('deal-river', () => {
        if (socket.id !== gameState.hostId) return;
        gameState.deck.pop(); // Burn card
        gameState.communityCards.push(gameState.deck.pop());
        gameState.gameStage = 'river';
        io.emit('update-game', gameState);
    });

    // Chips setzen / Pot erhöhen
    socket.on('place-bet', (amount) => {
        let player = gameState.players[socket.id];
        if (player && player.chips >= amount) {
            player.chips -= amount;
            player.bet += amount;
            gameState.pot += amount;
            io.emit('update-game', gameState);
        }
    });

    socket.on('disconnect', () => {
        console.log('Spieler getrennt:', socket.id);
        delete gameState.players[socket.id];
        if (socket.id === gameState.hostId) {
            const remainingIds = Object.keys(gameState.players);
            if (remainingIds.length > 0) {
                gameState.hostId = remainingIds[0];
                io.to(gameState.hostId).emit('set-host');
            } else {
                gameState.hostId = null;
            }
        }
        io.emit('update-game', gameState);
    });
});

server.listen(3000, () => {
    console.log('Poker-Server läuft auf http://localhost:3000');
});