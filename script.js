let selectedGame = "";

let results = JSON.parse(
    localStorage.getItem("ultraResults") || "[]"
);

const WORKER_URL =
"https://ultra-ai-prediction.akhiljaison98.workers.dev/";

// SELECT GAME
function selectGame(game) {
    selectedGame = game;

    document.getElementById("game").innerText =
        "Selected: Wingo " + game;

    updateDashboard();
    fetchWingoResults();
}

// ADD MANUAL RESULT
function addResult() {
    const input = document.getElementById("numberInput");
    const number = Number(input.value);

    if (!selectedGame) {
        alert("Please select a game first!");
        return;
    }

    if (input.value === "" || !Number.isInteger(number) ||
        number < 0 || number > 9) {
        alert("Enter a number between 0 and 9");
        return;
    }

    results.push({
        number,
        game: selectedGame,
        time: new Date().toISOString()
    });

    saveResults();
    input.value = "";

    document.getElementById("message").innerText =
        "Result added successfully!";

    updateDashboard();
}

// SAVE RESULTS
function saveResults() {
    results = results.slice(-500);

    localStorage.setItem(
        "ultraResults",
        JSON.stringify(results)
    );
}

// FETCH LIVE WINGO RESULTS
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
            throw new Error("API error " + response.status);
        }

        const data = await response.json();

        if (!data.success || !Array.isArray(data.history)) {
            throw new Error("Invalid API data");
        }

        [...data.history].reverse().forEach(item => {
            const exists = results.some(
                r => r.game === selectedGame &&
                     r.period === item.issueNumber
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

        saveResults();
        updateDashboard();

        document.getElementById("message").innerText =
            "LIVE CONNECTED | Period: " +
            data.current.issueNumber;

    } catch (error) {
        document.getElementById("message").innerText =
            "Connection error: " + error.message;
    }
}

// MAIN DASHBOARD
function updateDashboard() {
    const filtered = results.filter(
        r => r.game === selectedGame
    );

    const total = filtered.length;

    const big = filtered.filter(
        r => r.number >= 5
    ).length;

    const small = total - big;

    const frequency = Array(10).fill(0);

    filtered.forEach(item => {
        frequency[item.number]++;
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

    updateColourDashboard(filtered);
    updateTrendAnalysis(filtered);
}

// COLOUR ANALYSIS
function updateColourDashboard(filtered) {
    let green = 0;
    let red = 0;
    let violet = 0;

    filtered.forEach(item => {
        const colour = item.colour || "";

        if (colour.includes("GREEN")) green++;
        if (colour.includes("RED")) red++;
        if (colour.includes("VIOLET")) violet++;
    });

    document.getElementById("green").innerText = green;
    document.getElementById("red").innerText = red;
    document.getElementById("violet").innerText = violet;

    const total = filtered.length;

    const big = filtered.filter(
        r => r.number >= 5
    ).length;

    document.getElementById("bigPercent").innerText =
        total ? (big / total * 100).toFixed(1) + "%" : "0%";

    document.getElementById("smallPercent").innerText =
        total ? ((total - big) / total * 100).toFixed(1) + "%" : "0%";
}

// TREND MONITOR
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
            <h3>INSUFFICIENT DATA</h3>
            <p>Collect at least 10 results for analysis.</p>
        `;
        return;
    }

    let bigCount = 0;
    let smallCount = 0;
    let longestStreak = 1;
    let currentStreak = 1;

    for (let i = 0; i < recent.length; i++) {
        if (recent[i].number >= 5) bigCount++;
        else smallCount++;

        if (i > 0) {
            const previous = recent[i - 1].number >= 5;
            const current = recent[i].number >= 5;

            if (previous === current) currentStreak++;
            else currentStreak = 1;

            longestStreak = Math.max(
                longestStreak,
                currentStreak
            );
        }
    }

    let status = "STABLE PATTERN";

    if (longestStreak >= 7 ||
        bigCount >= 8 || smallCount >= 8) {
        status = "BAD TREND";
    } else if (longestStreak >= 5) {
        status = "CAUTION";
    }

    panel.innerHTML = `
        <h2>AI TREND MONITOR</h2>
        <h3>${status}</h3>
        <p>Last 10 Big: ${bigCount}</p>
        <p>Last 10 Small: ${smallCount}</p>
        <p>Longest streak: ${longestStreak}</p>
        <p>Past patterns do not reliably predict future results.</p>
    `;
}

// AUTOMATIC REFRESH EVERY 30 SECONDS
setInterval(() => {
    if (selectedGame) {
        fetchWingoResults();
    }
}, 30000);
    
        
    
            
