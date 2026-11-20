// ULTRA AI - STATISTICAL ENGINE
let selectedGame = "";

let results = JSON.parse(
    localStorage.getItem("ultraResults") || "[]"
);

// Select game
function selectGame(game) {
    selectedGame = game;

    document.getElementById("game").innerText =
        "Selected: Wingo " + game;

    updateDashboard();
}

// Add result
function addResult() {

    const input = document.getElementById("numberInput");
    const number = Number(input.value);

    if (!selectedGame) {
        alert("Please select a game first!");
        return;
    }

    if (
        input.value === "" ||
        !Number.isInteger(number) ||
        number < 0 ||
        number > 9
    ) {
        alert("Enter a valid number between 0 and 9");
        return;
    }

    results.push({
        number: number,
        game: selectedGame,
        time: new Date().toISOString()
    });

    localStorage.setItem(
        "ultraResults",
        JSON.stringify(results)
    );

    input.value = "";

    document.getElementById("message").innerText =
        "Result added successfully!";

    updateDashboard();
}


// Main dashboard
function updateDashboard() {

    const filtered = results.filter(
        r => r.game === selectedGame
    );

    const total = filtered.length;

    let big = 0;
    let small = 0;

    let frequency = Array(10).fill(0);

    filtered.forEach(item => {

        frequency[item.number]++;

        if (item.number >= 5) {
            big++;
        } else {
            small++;
        }
    });

    document.getElementById("total").innerText = total;
    document.getElementById("big").innerText = big;
    document.getElementById("small").innerText = small;

    document.getElementById("frequency").innerHTML =
        frequency.map((count, number) =>
            `<p>Number ${number}: ${count} times</p>`
        ).join("");

    document.getElementById("history").innerHTML =
        filtered.slice(-20).reverse().map(item =>
            `<span class="result-number">${item.number}</span>`
        ).join(" ");

    updateColourDashboard();
    updateTrendAnalysis(filtered);
}


// Colour statistics
function updateColourDashboard() {

    const filtered = results.filter(
        r => r.game === selectedGame
    );

    let green = 0;
    let red = 0;
    let violet = 0;

    filtered.forEach(item => {

        const n = item.number;

        if (n === 0 || n === 5) {
            violet++;
        }
        else if ([1, 3, 7, 9].includes(n)) {
            green++;
        }
        else {
            red++;
        }
    });

    const total = filtered.length;

    if (document.getElementById("green")) {
        document.getElementById("green").innerText = green;
        document.getElementById("red").innerText = red;
        document.getElementById("violet").innerText = violet;
    }

    if (document.getElementById("bigPercent")) {
        document.getElementById("bigPercent").innerText =
            total ? ((filtered.filter(r => r.number >= 5).length / total) * 100).toFixed(1) + "%" : "0%";

        document.getElementById("smallPercent").innerText =
            total ? ((filtered.filter(r => r.number < 5).length / total) * 100).toFixed(1) + "%" : "0%";
    }
}


// Trend detection
function updateTrendAnalysis(filtered) {

    let panel = document.getElementById("trendPanel");

    if (!panel) {
        panel = document.createElement("section");
        panel.id = "trendPanel";
        panel.className = "card";

        document.querySelector("main").appendChild(panel);
    }

    const recent = filtered.slice(-10);

    if (recent.length < 10) {
        panel.innerHTML = `
            <h2>AI TREND MONITOR</h2>
            <h3>⚪ INSUFFICIENT DATA</h3>
            <p>Add at least 10 results to analyse recent patterns.</p>
        `;
        return;
    }

    let bigCount = 0;
    let smallCount = 0;
    let longestStreak = 1;
    let currentStreak = 1;

    for (let i = 0; i < recent.length; i++) {

        if (recent[i].number >= 5) {
            bigCount++;
        } else {
            smallCount++;
        }

        if (i > 0) {

            const previous = recent[i - 1].number >= 5;
            const current = recent[i].number >= 5;

            if (previous === current) {
                currentStreak++;
            } else {
                currentStreak = 1;
            }

            longestStreak = Math.max(
                longestStreak,
                currentStreak
            );
        }
    }

    let status;
    let message;

    if (longestStreak >= 7 ||
        bigCount >= 8 ||
        smallCount >= 8) {

        status = "🔴 BAD TREND";
        message = "Recent results show an unusually concentrated pattern. Avoid treating this as a reliable prediction signal.";

    } else if (longestStreak >= 5) {

        status = "🟡 CAUTION";
        message = "A repeated pattern is appearing. Continue observing; do not assume it will continue or reverse.";

    } else {

        status = "🟢 STABLE PATTERN";
        message = "No extreme pattern detected in the last 10 results. This does not mean the next prediction is more likely to win.";
    }

    panel.innerHTML = `
        <h2>AI TREND MONITOR</h2>
        <h3>${status}</h3>
        <p>${message}</p>
        <p>Last 10 Big: ${bigCount}</p>
        <p>Last 10 Small: ${smallCount}</p>
        <p>Longest same-side streak: ${longestStreak}</p>
        // AUTOMATIC WINGOBOT CONNECTION

const WORKER_URL =
"https://ultra-ai-prediction.akhiljaison98.workers.dev/";

async function fetchWingoResults() {

    if (!selectedGame) return;

    const gameCode =
        selectedGame === "30 Seconds" ? "30s" : "1m";

    try {
        document.getElementById("message").innerText =
            "Fetching live results...";

        const response = await fetch(
            WORKER_URL + "?game=" + gameCode
        );

        if (!response.ok) {
            throw new Error("API error: " + response.status);
        }

        const data = await response.json();

        if (!data.success || !Array.isArray(data.history)) {
            throw new Error("Invalid API response");
        }

        [...data.history].reverse().forEach(item => {

            const exists = results.some(
                r => r.period === item.issueNumber &&
                     r.game === selectedGame
            );

            if (!exists) {
                results.push({
                    number: Number(item.number),
                    game: selectedGame,
                    period: item.issueNumber,
                    colour: item.colour,
                    premium: item.premium,
                    time: new Date().toISOString()
                });
            }
        });

        results = results.slice(-500);

        localStorage.setItem(
            "ultraResults",
            JSON.stringify(results)
        );

        updateDashboard();

        document.getElementById("message").innerText =
            "LIVE CONNECTED | Period: " +
            data.current.issueNumber;

    } catch (error) {

        document.getElementById("message").innerText =
            "Connection error: " + error.message;

        console.error(error);
    }
}

// Automatic refresh every 30 seconds
setInterval(fetchWingoResults, 30000);

// Fetch when a game is selected
const originalSelectGame = selectGame;

selectGame = function(game) {
    originalSelectGame(game);
    fetchWingoResults();
};
    `;
}


// Start dashboard
updateDashboard();

console.log("ULTRA AI Trend Monitor Loaded");
