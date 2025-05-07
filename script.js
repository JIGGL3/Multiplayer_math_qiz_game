const socket = io();
let playerName = "";

// Join the game
function joinGame() {
    playerName = document.getElementById("playerName").value;
    if (playerName.trim() === "") return alert("Enter a name!");
    
    socket.emit("setName", playerName);
    document.getElementById("login").style.display = "none";
    document.getElementById("game").style.display = "block";
}

// Receive a new question
socket.on("newQuestion", (data) => {
    document.getElementById("question").innerText = data.question;

    const optionsContainer = document.getElementById("options");
    optionsContainer.innerHTML = ""; // Clear old options

    data.options.forEach((option) => {
        let button = document.createElement("button");
        button.innerText = option;
        button.onclick = () => submitAnswer(option);
        optionsContainer.appendChild(button);
    });
});

// Submit selected answer
function submitAnswer(answer) {
    socket.emit("submitAnswer", { playerName, answer });
}
// Show scores
socket.on("updateScores", (players) => {
    playersList.innerHTML = "";
    Object.keys(players).forEach(playerId => {
        const player = players[playerId];
        const li = document.createElement("li");
        li.textContent = `${player.name}: ${player.score}`;
        playersList.appendChild(li);

        // If this is the current player, update their score display
        if (player.name === playerName) {
            scoreDisplay.textContent = player.score;
        }
    });
});


// Update scores
socket.on("updateScores", (players) => {
    const scoreboard = document.getElementById("scoreboard");
    scoreboard.innerHTML = "";

    for (let id in players) {
        let player = players[id];
        let listItem = document.createElement("li");
        listItem.innerText = `${player.name}: ${player.score}`;
        scoreboard.appendChild(listItem);
    }
});
