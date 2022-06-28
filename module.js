function init(wsServer, path) {
    const
        fs = require("fs"),
        randomColor = require('randomcolor'),
        app = wsServer.app,
        registry = wsServer.users,
        testMode = process.argv[2] === "debug";

    app.use("/brainwave", wsServer.static(`${__dirname}/public`));
    if (registry.config.appDir)
        app.use("/brainwave", wsServer.static(`${registry.config.appDir}/public`));
    registry.handleAppPage(path, `${__dirname}/public/app.html`);

    const words = JSON.parse(fs.readFileSync(`${__dirname}/words.json`))['ru'];

    class GameState extends wsServer.users.RoomState {
        constructor(hostId, hostData, userRegistry, registry) {
            super(hostId, hostData, userRegistry, registry.games.codenames.id, path);
            const
                room = {
                    ...this.room,
                    inited: true,
                    hostId: hostId,
                    spectators: new JSONSet(),
                    playerNames: {},
                    playerColors: {},
                    onlinePlayers: new JSONSet(),
                    master: null,
                    players: new JSONSet(),
                    readyPlayers: new JSONSet(),
                    playerScores: {},
                    playerScoreDiffs: {},
                    teamsLocked: false,
                    timed: true,
                    target: null,
                    clue: null,
                    playerWin: null,
                    cards: null,
                    playerHits: {},
                    phase: 0, // 3
                    masterTime: 70,
                    hitTime: 20,
                    revealTime: 10,
                    round: 1,
                    goal: 3,
                    time: null,
                    paused: true,
                },
                state = {
                    target: null,
                    playerHits: {}
                };
            this.room = room;
            this.state = state;
            this.lastInteraction = new Date();
            let deck = [];
            let interval;
            const
                send = (target, event, data) => userRegistry.send(target, event, data),
                update = () => send(room.onlinePlayers, "state", room),
                updatePlayerState = () => {
                    [...room.players].forEach(playerId => {
                        if (room.onlinePlayers.has(playerId))
                            send(playerId, "player-state", {
                                masterTarget: room.master === playerId ? state.target : null,
                                hit: state.playerHits[playerId] == null ? null : state.playerHits[playerId]
                            });
                    });
                },
                getNextPlayer = () => {
                    const nextPlayerIndex = [...room.players].indexOf(room.master) + 1;
                    return [...room.players][(room.players.size === nextPlayerIndex) ? 0 : nextPlayerIndex];
                },
                dealCards = () => {
                    if (deck.length === 0)
                        deck = shuffleArray([...words])
                    return deck.pop();
                },
                startTimer = () => {
                    if (room.timed) {
                        clearInterval(interval);
                        if (room.phase === 1)
                            room.time = room.masterTime * 1000;
                        else if (room.phase === 2)
                            room.time = room.hitTime * 1000;
                        else if (room.phase === 3)
                            room.time = room.revealTime * 1000;
                        else
                            return;
                        let time = new Date();
                        interval = setInterval(() => {
                            if (!room.paused) {
                                room.time -= new Date() - time;
                                time = new Date();
                                if (room.time <= 0) {
                                    clearInterval(interval);
                                    if (room.phase === 1) {
                                        startRound();
                                    } else if (room.phase === 2) {
                                        endRound();
                                    } else if (room.phase === 3) {
                                        startRound();
                                    }
                                    update();
                                }
                            } else time = new Date();
                        }, 100);
                    }
                },
                startGame = () => {
                    if (room.players.size >= 3) {
                        room.master = [...room.players][0];
                        room.round = 1;
                        room.paused = false;
                        room.teamsLocked = true;
                        room.playerWin = null;
                        room.clue = null;
                        room.playerScores = {};
                        clearInterval(interval);
                        startRound(true);
                    } else {
                        room.paused = true;
                        room.teamsLocked = false;
                    }
                },
                endGame = () => {
                    room.paused = true;
                    room.teamsLocked = false;
                    room.time = null;
                    room.phase = 0;
                    clearInterval(interval);
                    update();
                    updatePlayerState();
                },
                endRound = () => {
                    room.phase = 3;
                    room.target = state.target;
                    room.playerHits = state.playerHits;
                    countPoints();
                    room.readyPlayers.clear();
                    if ([...room.players].indexOf(room.master) === room.players.size - 1)
                        room.round++;
                    if (room.round > room.goal) {
                        room.round--;
                        let maxScore = 0;
                        Object.keys(room.playerScores).forEach((player) => {
                            if (room.playerScores[player] > maxScore) {
                                maxScore = room.playerScores[player];
                                room.playerWin = player;
                            }
                        });
                    }
                    if (room.playerWin)
                        endGame();
                    else {
                        startTimer();
                        update();
                        updatePlayerState();
                    }
                },
                startRound = (initial) => {
                    room.readyPlayers.clear();
                    if (room.players.size >= 3) {
                        [...room.players].forEach((player) => {
                            state.playerHits[player] = 50;
                        })
                        if (!initial)
                            room.master = getNextPlayer();
                        room.playerScoreDiffs = {};
                        room.phase = 1;
                        room.cards = dealCards();
                        room.playerHits = {};
                        room.target = null;
                        state.target = Math.round(Math.random() * 100);
                        room.clue = null;
                        startTimer();
                        update();
                        updatePlayerState();
                    } else {
                        room.phase = 0;
                        room.teamsLocked = false;
                        update();
                    }
                },
                countPoints = () => {
                    Object.keys(room.playerHits).forEach((player) => {
                        if (player !== room.master) {
                            const hit = room.playerHits[player];
                            const target = state.target;
                            const leftShift = target - hit;
                            const rightShift = hit - target;
                            let points = 0;
                            if (target === hit || (leftShift > 0 && leftShift <= 2)
                                || (rightShift > 0 && rightShift <= 2))
                                points = 4;
                            else if ((leftShift > 0 && leftShift <= 6) || (rightShift > 0 && rightShift <= 6))
                                points = 3;
                            else if ((leftShift > 0 && leftShift <= 10) || (rightShift > 0 && rightShift <= 10))
                                points = 2;
                            room.playerScoreDiffs[player] = points;
                            room.playerScores[player] = room.playerScores[player] || 0;
                            room.playerScores[room.master] = room.playerScores[room.master] || 0;
                            room.playerScores[player] += points;
                            room.playerScores[room.master] += points;
                        }
                    });
                },
                removePlayer = (playerId) => {
                    if (room.master === playerId)
                        room.master = getNextPlayer();
                    room.players.delete(playerId);
                    delete state.playerHits[playerId];
                    room.readyPlayers.delete(playerId);
                    if (room.spectators.has(playerId) || !room.onlinePlayers.has(playerId)) {
                        room.spectators.delete(playerId);
                        delete room.playerNames[playerId];
                        this.emit("user-kicked", playerId);
                    } else
                        room.spectators.add(playerId);
                    if (room.phase !== 0 && room.players.size < 3)
                        endGame();
                },
                userJoin = (data) => {
                    const user = data.userId;
                    if (!room.playerNames[user])
                        room.spectators.add(user);
                    room.playerColors[user] = room.playerColors[user] || randomColor();
                    room.onlinePlayers.add(user);
                    room.playerNames[user] = data.userName.substr && data.userName.substr(0, 60);
                    update();
                    updatePlayerState();
                },
                userLeft = (user) => {
                    room.onlinePlayers.delete(user);
                    if (room.spectators.has(user))
                        delete room.playerNames[user];
                    room.spectators.delete(user);
                    if (room.onlinePlayers.size === 0)
                        endGame();
                    update();
                },
                userEvent = (user, event, data) => {
                    this.lastInteraction = new Date();
                    try {
                        if (this.eventHandlers[event])
                            this.eventHandlers[event](user, data[0], data[1], data[2]);
                    } catch (error) {
                        console.error(error);
                        registry.log(error.message);
                    }
                };
            this.userJoin = userJoin;
            this.userLeft = userLeft;
            this.userEvent = userEvent;
            this.eventHandlers = {
                ...this.eventHandlers,
                "toggle-lock": (user) => {
                    if (user === room.hostId && room.paused)
                        room.teamsLocked = !room.teamsLocked;
                    update();
                },
                "toggle-pause": (user) => {
                    if (user === room.hostId) {
                        room.paused = !room.paused;
                        if (room.phase === 0)
                            startGame();
                    }
                    update();
                },
                "restart": (user) => {
                    if (user === room.hostId)
                        startGame();
                },
                "toggle-timed": (user) => {
                    if (user === room.hostId) {
                        room.timed = !room.timed;
                        if (!room.timed) {
                            room.time = null;
                            clearInterval(interval);
                        }
                    }
                    update();
                },
                "set-time": (user, type, value) => {
                    if (user === room.hostId && ["masterTime", "hitTime", "revealTime"].includes(type) && !isNaN(parseInt(value)))
                        room[type] = parseFloat(value);
                    update();
                },
                "set-goal": (user, value) => {
                    if (user === room.hostId && !isNaN(parseInt(value)))
                        room.goal = parseInt(value);
                    update();
                },
                "remove-player": (user, playerId) => {
                    if (playerId && user === room.hostId)
                        removePlayer(playerId);
                    update();
                },
                "give-host": (user, playerId) => {
                    if (playerId && user === room.hostId) {
                        room.hostId = playerId;
                        this.emit("host-changed", user, playerId);
                    }
                    update();
                },
                "players-join": (user) => {
                    if (!room.teamsLocked) {
                        room.spectators.delete(user);
                        room.players.add(user);
                        if (room.players.size === 1)
                            room.master = user;
                        state.playerHits[user] = 50;
                        update();
                        updatePlayerState();
                    }
                },
                "spectators-join": (user) => {
                    if (!room.teamsLocked) {
                        if (room.master === user)
                            room.master = getNextPlayer();
                        delete state.playerHits[user];
                        room.players.delete(user);
                        room.spectators.add(user);
                        update();
                    }
                },
                "set-clue": (user, clue) => {
                    if (room.phase === 1 && user === room.master && clue) {
                        room.clue = clue;
                        room.phase = 2;
                        room.readyPlayers.add(user);
                        startTimer();
                        update();
                    }
                },
                "set-hit": (user, hit) => {
                    if (room.phase === 2 && user !== room.master && hit >= 0 && hit <= 100) {
                        state.playerHits[user] = hit;
                    }
                },
                "toggle-ready": (user) => {
                    if ([2, 3].includes(room.phase) && (user !== room.master || room.phase === 3)) {
                        if (room.readyPlayers.has(user))
                            room.readyPlayers.delete(user);
                        else
                            room.readyPlayers.add(user);
                        if (room.readyPlayers.size === room.players.size) {
                            if (room.phase === 2)
                                endRound();
                            else if (room.phase === 3)
                                startRound();
                        } else update();
                    }
                }
            };
        }

        getPlayerCount() {
            return Object.keys(this.room.playerNames).length;
        }

        getActivePlayerCount() {
            return this.room.onlinePlayers.size;
        }

        getLastInteraction() {
            return this.lastInteraction;
        }

        getSnapshot() {
            return {
                room: this.room,
                state: this.state,
                player: this.player
            };
        }

        setSnapshot(snapshot) {
            Object.assign(this.room, snapshot.room);
            Object.assign(this.state, snapshot.state);
            this.room.paused = true;
            this.room.inactivePlayers = new JSONSet(this.room.inactivePlayers);
            this.room.onlinePlayers = new JSONSet();
            this.room.spectators = new JSONSet();
            this.room.players = new JSONSet(this.room.players);
            this.room.readyPlayers = new JSONSet(this.room.readyPlayers);
            this.room.onlinePlayers.clear();
        }
    }

    function makeId() {
        let text = "";
        const possible = "abcdefghijklmnopqrstuvwxyz0123456789";

        for (let i = 0; i < 5; i++)
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        return text;
    }

    function shuffleArray(array) {
        let currentIndex = array.length, temporaryValue, randomIndex;
        while (0 !== currentIndex) {
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex -= 1;
            temporaryValue = array[currentIndex];
            array[currentIndex] = array[randomIndex];
            array[randomIndex] = temporaryValue;
        }
        return array;
    }

    function getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1) + min);
    }

    class JSONSet extends Set {
        constructor(iterable) {
            super(iterable)
        }

        toJSON() {
            return [...this]
        }
    }

    registry.createRoomManager(path, GameState);
}

module.exports = init;

