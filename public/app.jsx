//import React from "react";
//import ReactDOM from "react-dom"
//import io from "socket.io"
function makeId() {
    let text = "";
    const possible = "abcdefghijklmnopqrstuvwxyz0123456789";

    for (let i = 0; i < 5; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}

class Player extends React.Component {
    render() {
        const
            data = this.props.data,
            id = this.props.id;
        return (
            <div className={cs("player", {
                ready: ~data.readyPlayers.indexOf(id),
                offline: !~data.onlinePlayers.indexOf(id),
                self: id === data.userId
            })} onTouchStart={(e) => e.target.focus()}>
                <div className="player-avatar-section"
                     onTouchStart={(e) => e.target.focus()}
                     onClick={() => (id === data.userId) && this.props.handleAvatarClick()}>
                    <Avatar data={data} player={id}/>
                    {id === data.userId ? (<i className="change-avatar-icon material-icons" title="Change avatar">
                        edit
                    </i>) : ""}
                </div>
                <div className="player-name-section">
                    <span className="player-name">{data.master === id ? "> " : ""}{data.playerNames[id]}</span>
                    &nbsp;({data.playerScores[id] || 0})
                    <div className="player-host-controls">
                        {(data.hostId === data.userId && data.userId !== id) ? (
                            <i className="material-icons host-button"
                               title="Give host"
                               onClick={(evt) => this.props.handleGiveHost(id, evt)}>
                                vpn_key
                            </i>) : ""}
                        {(data.hostId === data.userId && data.userId !== id) ? (
                            <i className="material-icons host-button"
                               title="Remove"
                               onClick={(evt) => this.props.handleRemovePlayer(id, evt)}>
                                delete_forever
                            </i>) : ""}
                        {(data.hostId === id) ? (
                            <i className="material-icons host-button inactive"
                               title="Game host">
                                stars
                            </i>
                        ) : ""}
                    </div>
                </div>
            </div>
        );
    }
}

class Avatar extends React.Component {
    render() {
        const
            hasAvatar = !!this.props.data.playerAvatars[this.props.player],
            playerBorder = !!this.props.hasBorder,
            avatarURI = `/brainwave/avatars/${this.props.player}/${this.props.data.playerAvatars[this.props.player]}.png`;
        return (
            <div className={cs("avatar", {"has-avatar": hasAvatar})}
                 style={{
                     "border-color": playerBorder
                         ? `${this.props.data.playerColors[this.props.player]}`
                         : `none`,
                     "background-image": hasAvatar
                         ? `url(${avatarURI})`
                         : `none`,
                     "background-color": hasAvatar
                         ? `transparent`
                         : this.props.data.playerColors[this.props.player]
                 }}>
                {!hasAvatar ? (
                    <i className="material-icons avatar-stub">
                        person
                    </i>
                ) : ""}
            </div>
        );
    }
}

class Game extends React.Component {
    componentDidMount() {
        const initArgs = {};
        if (!parseInt(localStorage.darkThemeDixit))
            document.body.classList.add("dark-theme");
        if (!localStorage.dixitUserId || !localStorage.dixitUserToken) {
            while (!localStorage.userName)
                localStorage.userName = prompt("Your name");
            localStorage.dixitUserId = makeId();
            localStorage.dixitUserToken = makeId();
        }
        if (!location.hash)
            history.replaceState(undefined, undefined, location.origin + location.pathname + "#" + makeId());
        else
            history.replaceState(undefined, undefined, location.origin + location.pathname + location.hash);
        if (localStorage.acceptDelete) {
            initArgs.acceptDelete = localStorage.acceptDelete;
            delete localStorage.acceptDelete;
        }
        initArgs.avatarId = localStorage.avatarId;
        initArgs.roomId = this.roomId = location.hash.substr(1);
        initArgs.userId = this.userId = localStorage.dixitUserId;
        initArgs.token = this.userToken = localStorage.dixitUserToken;
        initArgs.userName = localStorage.userName;
        initArgs.wssToken = window.wssToken;
        this.socket = window.socket.of("brainwave");
        this.player = {cards: []};
        this.socket.on("state", state => {
            CommonRoom.processCommonRoom(state, this.state, {
                maxPlayers: "∞",
                largeImageKey: "brainwave",
                details: "Brainwave"
            });
            if (this.state.phase && state.phase !== 0 && !parseInt(localStorage.muteSounds)) {
                if (this.state.master !== this.userId && state.master === this.userId)
                    this.masterSound.play();
                else if (this.state.phase === 1 && state.phase === 2)
                    this.storySound.play();
                else if (this.state.phase === 2 && state.phase === 3)
                    this.revealSound.play();
                else if (state.phase === 2 && this.state.readyPlayers.length !== state.readyPlayers.length)
                    this.tapSound.play();
            }
            if (this.state.inited && this.state.phase !== 2 && state.phase === 2)
                this.progressBarUpdate(0, 100);
            this.setState(Object.assign({
                userId: this.userId
            }, state));
        });
        this.socket.on("player-state", (state) => {
            this.setState(Object.assign(this.state, state));
        });
        this.socket.on("message", text => {
            popup.alert({content: text});
        });
        window.socket.on("disconnect", (event) => {
            this.setState({
                inited: false,
                disconnected: true,
                disconnectReason: event.reason
            });
        });
        this.socket.on("reload", () => {
            setTimeout(() => window.location.reload(), 3000);
        });
        this.socket.on("auth-required", () => {
            this.setState(Object.assign({}, this.state, {
                userId: this.userId,
                authRequired: true
            }));
            if (grecaptcha)
                grecaptcha.render("captcha-container", {
                    sitekey: "",
                    callback: (key) => this.socket.emit("auth", key)
                });
            else
                setTimeout(() => window.location.reload(), 3000)
        });
        this.socket.on("prompt-delete-prev-room", (roomList) => {
            if (localStorage.acceptDelete =
                prompt(`Limit for hosting rooms per IP was reached: ${roomList.join(", ")}. Delete one of rooms?`, roomList[0]))
                location.reload();
        });
        this.socket.on("ping", (id) => {
            this.socket.emit("pong", id);
        });
        document.title = `Brainwave - ${initArgs.roomId}`;
        this.socket.emit("init", initArgs);
        this.timerSound = new Audio("/brainwave/tick.mp3");
        this.timerSound.volume = 0.4;
        this.tapSound = new Audio("/brainwave/tap.mp3");
        this.tapSound.volume = 0.3;
        this.storySound = new Audio("/brainwave/start.mp3");
        this.storySound.volume = 0.4;
        this.revealSound = new Audio("/brainwave/reveal.mp3");
        this.revealSound.volume = 0.3;
        this.masterSound = new Audio("/brainwave/master.mp3");
        this.masterSound.volume = 0.7;
        document.body.addEventListener("keydown", (evt) => this.keyDown(evt));
    }

    keyDown(evt) {
        const key = parseInt(evt.code.substr(-1));
        if (evt.code.startsWith("Numpad") && evt.target === document.body && key > 0 && key < 10)
            this.handleClickCard([0, 7, 8, 9, 4, 5, 6, 1, 2, 3][key]);
    }

    debouncedEmit() {
        clearTimeout(this.debouncedEmitTimer);
        this.debouncedEmitTimer = setTimeout(() => {
            this.socket.emit.apply(this.socket, arguments);
        }, 100);
    }

    constructor() {
        super();
        this.state = {
            inited: false
        };
    }

    handleJoinPlayersClick(evt) {
        evt.stopPropagation();
        if (!this.state.teamsLocked)
            this.socket.emit("players-join");
    }

    handleJoinSpectatorsClick(evt) {
        evt.stopPropagation();
        if (!this.state.teamsLocked)
            this.socket.emit("spectators-join");
    }

    handleRemovePlayer(id, evt) {
        evt.stopPropagation();
        popup.confirm({content: `Removing ${this.state.playerNames[id]}?`}, (evt) => evt.proceed && this.socket.emit("remove-player", id));
    }

    handleGiveHost(id, evt) {
        evt.stopPropagation();
        popup.confirm({content: `Give host ${this.state.playerNames[id]}?`}, (evt) => evt.proceed && this.socket.emit("give-host", id));
    }

    handleChangeTime(value, type) {
        this.debouncedEmit("set-time", type, value);
    }

    handleSetGoal(value) {
        this.debouncedEmit("set-goal", value);
    }

    handleClickChangeName() {
        popup.prompt({content: "New name", value: this.state.playerNames[this.state.userId] || ""}, (evt) => {
            if (evt.proceed && evt.input_value.trim()) {
                this.socket.emit("change-name", evt.input_value.trim());
                localStorage.userName = evt.input_value.trim();
            }
        });
    }

    handleClickSetAvatar() {
        document.getElementById("avatar-input").click();
    }

    handleSetAvatar(event) {
        const input = event.target;
        if (input.files && input.files[0])
            this.sendAvatar(input.files[0]);
    }

    sendAvatar(file) {
        const
            uri = "/common/upload-avatar",
            xhr = new XMLHttpRequest(),
            fd = new FormData(),
            fileSize = ((file.size / 1024) / 1024).toFixed(4); // MB
        if (fileSize <= 5) {

            xhr.open("POST", uri, true);
            xhr.onreadystatechange = () => {
                if (xhr.readyState === 4 && xhr.status === 200) {
                    localStorage.avatarId = xhr.responseText;
                    this.socket.emit("update-avatar", localStorage.avatarId);
                } else if (xhr.readyState === 4 && xhr.status !== 200) popup.alert({content: "File upload error"});
            };
            fd.append("avatar", file);
            fd.append("userId", this.userId);
            fd.append("userToken", this.userToken);
            xhr.send(fd);
        } else
            popup.alert({content: "File shouldn't be larger than 5 MB"});
    }

    handleToggleTheme() {
        localStorage.darkThemeDixit = !parseInt(localStorage.darkThemeDixit) ? 1 : 0;
        document.body.classList.toggle("dark-theme");
        this.setState(Object.assign({}, this.state));
    }

    handleToggleMuteSounds() {
        localStorage.muteSounds = !parseInt(localStorage.muteSounds) ? 1 : 0;
        this.setState(Object.assign({}, this.state));
    }

    handleClickTogglePause() {
        this.socket.emit("toggle-pause");
    }

    handleToggleTeamLockClick() {
        this.socket.emit("toggle-lock");
    }

    handleClickRestart() {
        if (!this.gameIsOver)
            popup.confirm({content: "Restart? Are you sure?"}, (evt) => evt.proceed && this.socket.emit("restart"));
        else
            this.socket.emit("restart")
    }

    handleToggleTimed() {
        this.socket.emit("toggle-timed");
    }

    updateTimer(time) {
        const timeTotal = {
            1: this.state.masterTime,
            2: this.state.hitTime,
            3: this.state.revealTime,
        }[this.state.phase] * 1000;
        this.progressBarUpdate(timeTotal - time, timeTotal);
    }

    progressBarUpdate(x, outOf) {
        let firstHalfAngle = 180,
            secondHalfAngle = 0;

        // caluclate the angle
        let drawAngle = x / outOf * 360;

        // calculate the angle to be displayed if each half
        if (drawAngle <= 180) {
            firstHalfAngle = drawAngle;
        } else {
            secondHalfAngle = drawAngle - 180;
        }

        // set the transition
        document.getElementsByClassName("rtb-slice1")[0].style.transform = `rotate(${firstHalfAngle}deg)`;
        document.getElementsByClassName("rtb-slice2")[0].style.transform = `rotate(${secondHalfAngle}deg)`;
    }

    handleClickCard(index) {
        this.socket.emit("choose-word", index);
    }

    handleClickToggleReady() {
        this.socket.emit("toggle-ready");
    }

    handleChangeSlider(value) {
        this.debouncedEmit("set-hit", value);
    }

    handleAddCommandClick() {
        const input = document.getElementById("command-input");
        if (input && input.value)
            this.socket.emit("set-clue", input.value);
    }

    render() {
        clearTimeout(this.timerTimeout);
        if (this.state.disconnected)
            return (<div
                className="kicked">Disconnected{this.state.disconnectReason ? ` (${this.state.disconnectReason})` : ""}</div>);
        else if (this.state.inited) {
            document.body.classList.add("captcha-solved");
            const
                data = this.state,
                isHost = data.hostId === data.userId,
                inProcess = data.phase !== 0 && !data.paused,
                isMaster = data.master === data.userId;
            let status = "";
            if (data.phase !== 0 && data.timed) {
                let timeStart = new Date();
                this.timerTimeout = setTimeout(() => {
                    if (this.state.timed && !this.state.paused) {
                        let prevTime = this.state.time,
                            time = prevTime - (new Date - timeStart);
                        this.setState(Object.assign({}, this.state, {time: time}));
                        this.updateTimer(time);
                        if (this.state.phase !== 3 && this.state.timed && time < 6000 && ((Math.floor(prevTime / 1000) - Math.floor(time / 1000)) > 0) && !parseInt(localStorage.muteSounds))
                            this.timerSound.play();
                    }
                    if (!this.state.timed)
                        this.updateTimer(0);
                }, 1000);
            }
            if (data.playerWin) {
                status = ``;
            } else if (data.phase === 0) {
                if (data.players.length > 2)
                    status = "Хост может начать игру";
                else
                    status = "Нужно минимум 3 человека";
            } else if (!isMaster) {
                if (data.phase === 1)
                    status = `${data.playerNames[data.master]} придумывает...`;
                else if (data.phase === 2)
                    status = "Отгадываем";
                else if (data.phase === 3)
                    status = "Сморим че получилось";
            } else {
                if (data.phase === 1)
                    status = "Придумай подсказку";
                else if (data.phase === 2)
                    status = "Они отгадывают";
                else if (data.phase === 3)
                    status = "Сморим че получилось";
            }
            return (
                <div className={cs("game", {timed: this.state.timed})}>
                    <div className={
                        cs("game-board", {
                            active: this.state.inited,
                            isMaster,
                            teamsLocked: data.teamsLocked
                        })}>
                        <div className="status-bar-wrap">
                            <div className="status-bar">
                                <div className="title-section">
                                    {data.master === data.userId && data.phase === 1 ? (
                                        <div className="add-command">
                                            <input className="add-command-input" id="command-input"
                                                   autoComplete="off"
                                                   onKeyDown={(evt) => !evt.stopPropagation()
                                                       && evt.key === "Enter" && this.handleAddCommandClick()}/>
                                            <div className="add-command-button"
                                                 onClick={() => this.handleAddCommandClick()}>➜
                                            </div>
                                        </div>) : ""}
                                    {!data.playerWin ? (data.clue ? (<div
                                        className="command">«{data.clue}»</div>) : "") : `The winner is ${data.playerNames[data.playerWin]}!`}
                                    <div className="status-text">{status}</div>
                                </div>
                                <div className="timer-section">
                                    <div className="round-track-bar">
                                        <div className="rtb-clip1">
                                            <div className="rtb-slice1"/>
                                        </div>
                                        <div className="rtb-clip2">
                                            <div className="rtb-slice2"/>
                                        </div>
                                        <div className="rtb-content">{
                                            !data.playerWin
                                                ? (<Avatar data={data} player={data.master}/>)
                                                : (<Avatar data={data} player={data.playerWin}/>)
                                        }
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="main-row">
                            <div className="player-list-section"
                                 onClick={(evt) => this.handleJoinPlayersClick(evt)}>
                                <div className="player-list">
                                    {data.players.map((id => (
                                        <Player key={id} data={data} id={id}
                                                handleGiveHost={(id, evt) => this.handleGiveHost(id, evt)}
                                                handleAvatarClick={() => this.handleClickSetAvatar()}
                                                handleRemovePlayer={(id, evt) => this.handleRemovePlayer(id, evt)}/>
                                    )))}
                                    {!~data.players.indexOf(data.userId) ? (
                                        <div className="join-button">Play</div>) : ""}
                                </div>
                                <div className={cs("spectators", {empty: !data.spectators.length})}
                                     onClick={(evt) => this.handleJoinSpectatorsClick(evt)}>
                                    {data.spectators.map((id => (
                                        <Player key={id} data={data} id={id}
                                                handleGiveHost={(id) => this.handleGiveHost(id)}
                                                handleAvatarClick={() => this.handleClickSetAvatar()}
                                                handleRemovePlayer={(id, evt) => this.handleRemovePlayer(id, evt)}/>
                                    )))}
                                    {!~data.spectators.indexOf(data.userId) ? (
                                        <div className="join-button">Spectate</div>) : ""}
                                </div>
                                <div className="round">
                                    Round: {data.round} / {data.goal}
                                </div>
                            </div>
                            <div className="main">
                                {
                                    (data.players.includes(data.userId)
                                        && (data.phase === 3 || (data.phase === 2 && data.master !== data.userId)))
                                        ? (<div
                                            className={cs("ready-button", {active: data.readyPlayers.includes(data.userId)})}
                                            onClick={() => this.handleClickToggleReady()}>Ready</div>)
                                        : ""
                                }
                                {
                                    data.cards != null ? (<div className="cards">
                                        {data.cards.map((card) => (<div>{card}</div>))}
                                    </div>) : ""
                                }
                                <div className={cs("target-bar", {
                                    inactive: (data.phase === 0 && !data.playerWin)
                                        || ([1, 2].includes(data.phase) && data.master !== data.userId)
                                })}>
                                    {
                                        (data.masterTarget != null || data.target != null)
                                            ? (<div class="target-meters">
                                                <div className="target-meter" style={{
                                                    left: `${data.masterTarget || data.target}%`
                                                }}/>
                                                <div className="target-zone big" style={{
                                                    left: `${data.masterTarget || data.target}%`
                                                }}/>
                                                <div className="target-zone medium" style={{
                                                    left: `${data.masterTarget || data.target}%`
                                                }}/>
                                                <div className="target-zone small" style={{
                                                    left: `${data.masterTarget || data.target}%`
                                                }}/>
                                            </div>) : ''
                                    }
                                    {
                                        Object.keys(data.playerHits)
                                            .filter((player) => player !== data.master)
                                            .map((player) => (
                                                <div className={cs("target", {
                                                    self: player === data.userId,
                                                })} style={{
                                                    left: `${data.playerHits[player]}%`,
                                                    "background-color": data.playerColors[player]
                                                }}>
                                                    <div className={cs("hit-avatar", {
                                                        "hit-small": data.playerScoreDiffs[player] === 4,
                                                        "hit-medium": data.playerScoreDiffs[player] === 3,
                                                        "hit-big": data.playerScoreDiffs[player] === 2
                                                    })}>
                                                        <Avatar data={data} player={player} hasBorder={true}/>
                                                    </div>
                                                </div>
                                            ))
                                    }
                                </div>
                                {
                                    (data.phase === 2 && data.master !== data.userId && data.players.includes(data.userId))
                                        ? (<input className="hit-slider" type="range"
                                                  defaultValue={data.playerHits[data.userId] || 50}
                                                  min="0"
                                                  max="100"
                                                  onChange={(evt) =>
                                                      this.handleChangeSlider(evt.target.valueAsNumber)}/>)
                                        : ""
                                }
                            </div>
                        </div>
                        <div className="host-controls" onTouchStart={(e) => e.target.focus()}>
                            {data.timed ? (<div className="host-controls-menu">
                                <div className="little-controls">
                                    <div className="game-settings">
                                        <div className="set-master-time"><i title="master time"
                                                                            className="material-icons">alarm_add</i>
                                            {(isHost && !inProcess) ? (<input id="goal"
                                                                              type="number"
                                                                              defaultValue={this.state.masterTime}
                                                                              min="0"
                                                                              onChange={evt => !isNaN(evt.target.valueAsNumber)
                                                                                  && this.handleChangeTime(evt.target.valueAsNumber, "masterTime")}
                                            />) : (<span className="value">{this.state.masterTime}</span>)}
                                        </div>
                                        <div className="set-add-time"><i title="adding time"
                                                                         className="material-icons">alarm_on</i>
                                            {(isHost && !inProcess) ? (<input id="round-time"
                                                                              type="number"
                                                                              defaultValue={this.state.hitTime}
                                                                              min="0"
                                                                              onChange={evt => !isNaN(evt.target.valueAsNumber)
                                                                                  && this.handleChangeTime(evt.target.valueAsNumber, "hitTime")}
                                            />) : (<span className="value">{this.state.hitTime}</span>)}
                                        </div>
                                        <div className="set-add-time"><i title="adding time"
                                                                         className="material-icons">alarm_on</i>
                                            {(isHost && !inProcess) ? (<input id="round-time"
                                                                              type="number"
                                                                              defaultValue={this.state.revealTime}
                                                                              min="0"
                                                                              onChange={evt => !isNaN(evt.target.valueAsNumber)
                                                                                  && this.handleChangeTime(evt.target.valueAsNumber, "revealTime")}
                                            />) : (<span className="value">{this.state.revealTime}</span>)}
                                        </div>
                                        <div className="set-goal"><i title="goal"
                                                                     className="material-icons">flag</i>
                                            {(isHost && !inProcess) ? (<input id="goal"
                                                                              type="number"
                                                                              defaultValue={this.state.goal}
                                                                              min="1"
                                                                              onChange={evt => !isNaN(evt.target.valueAsNumber)
                                                                                  && this.handleSetGoal(evt.target.valueAsNumber)}
                                            />) : (<span className="value">{this.state.goal}</span>)}
                                        </div>
                                    </div>
                                </div>
                            </div>) : ""}
                            <div className="side-buttons">
                                {this.state.userId === this.state.hostId ?
                                    <i onClick={() => this.socket.emit("set-room-mode", false)}
                                       className="material-icons exit settings-button">store</i> : ""}
                                {isHost ? (!inProcess
                                    ? (<i onClick={() => this.handleClickTogglePause()}
                                          className="material-icons start-game settings-button">play_arrow</i>)
                                    : (<i onClick={() => this.handleClickTogglePause()}
                                          className="material-icons start-game settings-button">pause</i>)) : ""}
                                {(isHost && data.paused) ? (data.teamsLocked
                                    ? (<i onClick={() => this.handleToggleTeamLockClick()}
                                          className="material-icons start-game settings-button">lock_outline</i>)
                                    : (<i onClick={() => this.handleToggleTeamLockClick()}
                                          className="material-icons start-game settings-button">lock_open</i>)) : ""}
                                {(isHost && data.paused) ? (!data.timed
                                    ? (<i onClick={() => this.handleToggleTimed()}
                                          className="material-icons start-game settings-button">alarm_off</i>)
                                    : (<i onClick={() => this.handleToggleTimed()}
                                          className="material-icons start-game settings-button">alarm</i>)) : ""}
                                {(isHost && data.paused)
                                    ? (<i onClick={() => this.handleClickRestart()}
                                          className="toggle-theme material-icons settings-button">sync</i>) : ""}
                                <i onClick={() => this.handleClickChangeName()}
                                   className="toggle-theme material-icons settings-button">edit</i>
                                {!parseInt(localStorage.muteSounds)
                                    ? (<i onClick={() => this.handleToggleMuteSounds()}
                                          className="toggle-theme material-icons settings-button">volume_up</i>)
                                    : (<i onClick={() => this.handleToggleMuteSounds()}
                                          className="toggle-theme material-icons settings-button">volume_off</i>)}
                                {!parseInt(localStorage.darkThemeDixit)
                                    ? (<i onClick={() => this.handleToggleTheme()}
                                          className="toggle-theme material-icons settings-button">brightness_2</i>)
                                    : (<i onClick={() => this.handleToggleTheme()}
                                          className="toggle-theme material-icons settings-button">wb_sunny</i>)}
                            </div>
                            <i className="settings-hover-button material-icons">settings</i>
                            <input id="avatar-input" type="file" onChange={evt => this.handleSetAvatar(evt)}/>
                        </div>
                        <CommonRoom state={this.state} app={this}/>
                    </div>
                </div>
            );
        } else return (<div/>);
    }
}

ReactDOM.render(<Game/>, document.getElementById('root'));
