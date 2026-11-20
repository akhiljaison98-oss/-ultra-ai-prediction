let selectedGame = "";

let results = JSON.parse(
    localStorage.getItem("ultraResults") || "[]"
);

// Migrate old prediction storage
let oldPredictions = JSON.parse(
    localStorage.getItem("ultraPredictions") || "{}"
);

let predictions = Array.isArray(oldPredictions)
    ? oldPredictions
    : Object.values(oldPredictions).filter(Boolean);

const WORKER_URL =
"https://ultra-ai-prediction.akhiljaison98.workers.dev/";

predictions = predictions
    .filter(p => p && p.period && p.game)
    .slice(-50);

savePredictions();

// SELECT GAME
function selectGame(game) {
    selectedGame = game;

    document.getElementById("game").innerText =
        "Selected: Wingo " + game;

    updateDashboard();
    displayCurrentPrediction();
    renderPredictionHistory();
    fetchWingoResults();
}

// SAVE RESULTS
function saveResults() {
    results = results.slice(-500);

    localStorage.setItem(
        "ultraResults",
        JSON.stringify(results)
    );
}

// SAVE PREDICTIONS
function savePredictions() {
    predictions = predictions.slice(-50);

    localStorage.setItem(
        "ultraPredictions",
        JSON.stringify(predictions)
    );
}

// FETCH LIVE RESULTS
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

        if (!data.success ||
            !Array.isArray(data.history)) {
            throw new Error("Invalid API response");
        }

        [...data.history].reverse().forEach(item => {
            const period = String(item.issueNumber);

            const exists = results.some(
                r => r.game === selectedGame &&
                     String(r.period) === period
            );

            if (!exists) {
                results.push({
                    number: Number(item.number),
                    game: selectedGame,
                    period: period,
                    colour: item.colour,
                    premium: item.premium,
                    time: new Date().toISOString()
                });
            }
        });

        saveResults();

        verifyPredictions();
        generatePrediction();
        updateDashboard();
        renderPredictionHistory();

        document.getElementById("message").innerText =
            "LIVE CONNECTED | Period: " +
            data.current.issueNumber;

    } catch (error) {
        document.getElementById("message").innerText =
            "Connection error: " + error.message;
    }
}

// COLOUR CLASSIFICATION
function getColour(number) {
    if (number === 0) return "RED,VIOLET";
    if (number === 5) return "GREEN,VIOLET";

    return number % 2 === 1 ? "GREEN" : "RED";
}

// NEXT PERIOD
function nextPeriod(period) {
    if (!period || !/^\d+$/.test(period)) return "";

    const digits = period.split("");
    let carry = 1;

    for (let i = digits.length - 1; i >= 0 && carry; i--) {
        const value = Number(digits[i]) + carry;

        digits[i] = String(value % 10);
        carry = value > 9 ? 1 : 0;
    }

    if (carry) digits.unshift("1");

    return digits.join("");
}

// PREDICTION ENGINE
function generatePrediction() {
    const filtered = results
        .filter(r =>
            r.game === selectedGame &&
            r.period &&
            Number.isInteger(r.number) &&
            r.number >= 0 &&
            r.number <= 9
        )
        .sort((a, b) =>
            String(a.period).localeCompare(String(b.period))
        );

    if (filtered.length < 10) {
        showPredictionMessage(
            "Collect at least 10 completed results."
        );
        return;
    }

    const latest = filtered[filtered.length - 1];

    const targetPeriod = nextPeriod(
        String(latest.period)
    );

    // Do not create duplicate predictions
    const existing = predictions.find(
        p => p.game === selectedGame &&
             String(p.period) === targetPeriod
    );

    if (existing) {
        displayPrediction(existing);
        return;
    }

    const sample = filtered.slice(-100);

    const numbers = Array(10).fill(0);

    let big = 0;
    let small = 0;

    const colours = {
        "GREEN": 0,
        "RED": 0,
        "RED,VIOLET": 0,
        "GREEN,VIOLET": 0
    };

    sample.forEach(item => {
        numbers[item.number]++;

        if (item.number >= 5) big++;
        else small++;

        const colour =
            item.colour || getColour(item.number);

        if (colours[colour] !== undefined) {
            colours[colour]++;
        }
    });

    const numberPrediction = numbers.indexOf(
        Math.max(...numbers)
    );

    const bigPrediction =
        big >= small ? "BIG" : "SMALL";

    const colourPrediction =
        Object.keys(colours).reduce(
            (a, b) => colours[a] >= colours[b] ? a : b
        );

    const prediction = {
        game: selectedGame,
        period: targetPeriod,
        number: numberPrediction,
        bigSmall: bigPrediction,
        colour: colourPrediction,
        samples: sample.length,
        settled: false,
        createdAt: new Date().toISOString()
    };

    predictions.push(prediction);

    savePredictions();

    displayPrediction(prediction);
    renderPredictionHistory();
}

// VERIFY ALL PREDICTIONS
function verifyPredictions() {
    let changed = false;

    predictions.forEach(prediction => {
        if (prediction.game !== selectedGame ||
            prediction.settled) {
            return;
        }

        const actual = results.find(
            r => r.game === selectedGame &&
                 String(r.period) === String(prediction.period)
        );

        if (!actual) return;

        prediction.actualNumber = actual.number;

        prediction.actualBigSmall =
            actual.number >= 5 ? "BIG" : "SMALL";

        prediction.actualColour =
            actual.colour || getColour(actual.number);

        prediction.numberCorrect =
            prediction.number === actual.number;

        prediction.bigSmallCorrect =
            prediction.bigSmall === prediction.actualBigSmall;

        prediction.colourCorrect =
            prediction.colour === prediction.actualColour;

        prediction.settled = true;

        prediction.settledAt =
            new Date().toISOString();

        changed = true;
    });

    if (changed) {
        savePredictions();
    }
}

// ACCURACY
function getAccuracy(type) {
    const records = predictions.filter(
        p => p.game === selectedGame && p.settled
    );

    if (!records.length) return "Not available";

    const correct = records.filter(p => {
        if (type === "number") return p.numberCorrect;
        if (type === "bigSmall") return p.bigSmallCorrect;
        return p.colourCorrect;
    }).length;

    return (
        correct / records.length * 100
    ).toFixed(1);
}

// DISPLAY CURRENT PREDICTION
function displayPrediction(p) {
    let panel = document.getElementById("predictionPanel");

    if (!panel) {
        panel = document.createElement("section");
        panel.id = "predictionPanel";
        panel.className = "card";

        document.querySelector("main").appendChild(panel);
    }

    panel.innerHTML = `
        <h2>ULTRA AI PREDICTION ENGINE</h2>

        <h3>UPCOMING PERIOD</h3>
        <p>${p.period}</p>

        <h3>BIG / SMALL ESTIMATE</h3>
        <p>${p.bigSmall}</p>

        <h3>COLOUR ESTIMATE</h3>
        <p>${p.colour.replace(",", " + ")}</p>

        <h3>NUMBER ESTIMATE</h3>
        <p>${p.number}</p>

        <p>Historical sample: ${p.samples} results</p>

        <hr>

        <h3>HISTORICAL ACCURACY</h3>
        <p>Big / Small: ${getAccuracy("bigSmall")}%</p>
        <p>Colour: ${getAccuracy("colour")}%</p>
        <p>Exact Number: ${getAccuracy("number")}%</p>

        <p>Prediction status:
        ${p.settled ? "RESULT VERIFIED" : "WAITING FOR RESULT"}
        </p>

        <small>
        Historical-frequency estimates do not guarantee
        future outcomes.
        </small>
    `;
}

// SHOW EXISTING PREDICTION
function displayCurrentPrediction() {
    const existing = predictions
        .filter(p => p.game === selectedGame && !p.settled)
        .sort((a, b) =>
            String(b.period).localeCompare(String(a.period))
        )[0];

    if (existing) {
        displayPrediction(existing);
    }
}

// PREDICTION HISTORY TABLE
function renderPredictionHistory() {
    const table = document.getElementById(
        "predictionHistory"
    );

    if (!table) return;

    const history = predictions
        .filter(p => p.game === selectedGame)
        .slice()
        .reverse()
        .slice(0, 50);

    if (!history.length) {
        table.innerHTML = `
            <tr>
                <td colspan="4">No predictions available yet.</td>
            </tr>
        `;
        return;
    }

    table.innerHTML = history.map(p => {
        let actual = "Pending";
        let status = "⏳ WAITING";

        if (p.settled) {
            actual = p.actualNumber;

            status = p.numberCorrect
                ? "🟢 WIN"
                : "🔴 LOSS";
        }

        return `
            <tr>
                <td>${p.period}</td>
                <td>${p.number}</td>
                <td>${actual}</td>
                <td>${status}</td>
            </tr>
        `;
    }).join("");
}

// PREDICTION MESSAGE
function showPredictionMessage(message) {
    let panel = document.getElementById("predictionPanel");

    if (!panel) {
        panel = document.createElement("section");
        panel.id = "predictionPanel";
        panel.className = "card";

        document.querySelector("main").appendChild(panel);
    }

    panel.innerHTML = `
        <h2>ULTRA AI PREDICTION ENGINE</h2>
        <p>${message}</p>
    `;
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
        if (Number.isInteger(item.number) &&
            item.number >= 0 &&
            item.number <= 9) {
            frequency[item.number]++;
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

    updateColourDashboard(filtered);
    updateTrendAnalysis(filtered);
}

// COLOUR STATISTICS
function updateColourDashboard(filtered) {
    let green = 0;
    let red = 0;
    let violet = 0;

    filtered.forEach(item => {
        const colour =
            item.colour || getColour(item.number);

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
            <p>Collect at least 10 results.</p>
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

    panel.innerHTML = `
        <h2>AI TREND MONITOR</h2>
        <p>Last 10 Big: ${bigCount}</p>
        <p>Last 10 Small: ${smallCount}</p>
        <p>Longest streak: ${longestStreak}</p>
    `;
}

// AUTO REFRESH
setInterval(() => {
    if (selectedGame) {
        fetchWingoResults();
    }
}, 10000);