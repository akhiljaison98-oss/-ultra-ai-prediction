let selectedGame = "";

let results = JSON.parse(
    localStorage.getItem("ultraResults") || "[]"
);

let oldPredictions = JSON.parse(
    localStorage.getItem("ultraPredictions") || "{}"
);

let predictions = Array.isArray(oldPredictions)
    ? oldPredictions
    : Object.values(oldPredictions).filter(Boolean);

const WORKER_URL =
"https://ultra-ai-prediction.akhiljaison98.workers.dev/";

let backendStatus = "WAITING";
let backendVersion = "2.0";
let lastUpdated = "Not available";

// PERIOD COMPARISON
function comparePeriods(a, b) {
    const x = String(a).replace(/^0+(?=\d)/, "");
    const y = String(b).replace(/^0+(?=\d)/, "");

    if (x.length !== y.length) {
        return x.length - y.length;
    }

    return x.localeCompare(y);
}

// SAVE PREDICTIONS
function trimPredictions() {
    const games = [...new Set(
        predictions
            .filter(p => p && p.period && p.game)
            .map(p => p.game)
    )];

    predictions = games.flatMap(game =>
        predictions
            .filter(p => p && p.game === game && p.period)
            .sort((a, b) =>
                comparePeriods(a.period, b.period)
            )
            .slice(-100)
    );
}

function savePredictions() {
    trimPredictions();

    localStorage.setItem(
        "ultraPredictions",
        JSON.stringify(predictions)
    );
}

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
    const games = [...new Set(
        results.map(r => r.game)
    )];

    results = games.flatMap(game =>
        results
            .filter(r => r.game === game)
            .sort((a, b) =>
                comparePeriods(a.period, b.period)
            )
            .slice(-500)
    );

    localStorage.setItem(
        "ultraResults",
        JSON.stringify(results)
    );
}

// FETCH LIVE RESULTS
async function fetchWingoResults() {
    if (!selectedGame) return;

    const gameCode =
        selectedGame === "30 Seconds" ? "30s" : "1m";

    try {
        document.getElementById("message").innerText =
            "Connecting to ULTRA AI backend...";

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

        backendStatus = "CONNECTED";

        backendVersion =
            data.analysis?.version || "2.0";

        lastUpdated =
            data.stats?.last_updated || new Date().toISOString();

        [...data.history].reverse().forEach(item => {
            const period = String(item.issueNumber);
            const number = Number(item.number);

            if (!Number.isInteger(number) ||
                number < 0 || number > 9) return;

            const exists = results.some(
                r => r.game === selectedGame &&
                     String(r.period) === period
            );

            if (!exists) {
                results.push({
                    number,
                    game: selectedGame,
                    period,
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
        backendStatus = "CONNECTION ERROR";

        document.getElementById("message").innerText =
            "Connection error: " + error.message;

        updateEngineStatus();
    }
}

// COLOUR CLASSIFICATION
function getColour(number) {
    if (number === 0) return "RED,VIOLET";
    if (number === 5) return "GREEN,VIOLET";

    return number % 2 === 1 ? "GREEN" : "RED";
}

// BIG / SMALL
function getBigSmall(number) {
    return Number(number) >= 5 ? "BIG" : "SMALL";
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

// STREAK AND ALTERNATION ANALYSIS
function analysePatterns(filtered) {
    if (!filtered.length) {
        return {
            streakType: "N/A",
            streakLength: 0,
            alternations: 0
        };
    }

    const ordered = filtered.slice().sort(
        (a, b) => comparePeriods(a.period, b.period)
    );

    const latestType =
        getBigSmall(ordered[ordered.length - 1].number);

    let streakLength = 0;

    for (let i = ordered.length - 1; i >= 0; i--) {
        if (getBigSmall(ordered[i].number) === latestType) {
            streakLength++;
        } else {
            break;
        }
    }

    const recent = ordered.slice(-100);

    let alternations = 0;

    for (let i = 1; i < recent.length; i++) {
        if (
            getBigSmall(recent[i].number) !==
            getBigSmall(recent[i - 1].number)
        ) {
            alternations++;
        }
    }

    return {
        streakType: latestType,
        streakLength,
        alternations
    };
}

// WEIGHTED TREND ENGINE
function analyseWeightedTrend(filtered) {
    const windows = [
        { size: 10, weight: 0.40 },
        { size: 30, weight: 0.30 },
        { size: 50, weight: 0.20 },
        { size: 100, weight: 0.10 }
    ];

    let bigScore = 0;
    let smallScore = 0;
    let totalWeight = 0;

    const breakdown = {};

    windows.forEach(window => {
        if (filtered.length < window.size) return;

        const sample = filtered.slice(-window.size);

        const big = sample.filter(
            r => getBigSmall(r.number) === "BIG"
        ).length;

        const small = sample.length - big;

        const bigRate = big / sample.length;
        const smallRate = small / sample.length;

        bigScore += bigRate * window.weight;
        smallScore += smallRate * window.weight;
        totalWeight += window.weight;

        breakdown[window.size] = {
            big,
            small,
            total: sample.length,
            bigPercent: (bigRate * 100).toFixed(1),
            smallPercent: (smallRate * 100).toFixed(1)
        };
    });

    if (!totalWeight) return null;

    bigScore /= totalWeight;
    smallScore /= totalWeight;

    const trendStrength =
        Math.max(bigScore, smallScore) * 100;

    let prediction = "NO CLEAR SIGNAL";

    if (trendStrength >= 55) {
        prediction =
            bigScore > smallScore ? "BIG" : "SMALL";
    }

    return {
        prediction,
        trendStrength: trendStrength.toFixed(1),
        bigPercent: (bigScore * 100).toFixed(1),
        smallPercent: (smallScore * 100).toFixed(1),
        breakdown
    };
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
        .slice()
        .sort((a, b) =>
            comparePeriods(a.period, b.period)
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

    const trend = analyseWeightedTrend(filtered);

    if (!trend) return;

    const patterns = analysePatterns(filtered);

    const existingIndex = predictions.findIndex(
        p => p.game === selectedGame &&
             String(p.period) === targetPeriod
    );

    // NUMBER AND COLOUR FREQUENCY
    const sample = filtered.slice(-100);

    const numbers = Array(10).fill(0);

    const colours = {
        "GREEN": 0,
        "RED": 0,
        "RED,VIOLET": 0,
        "GREEN,VIOLET": 0
    };

    sample.forEach(item => {
        numbers[item.number]++;

        const colour =
            item.colour || getColour(item.number);

        if (colours[colour] !== undefined) {
            colours[colour]++;
        }
    });

    const numberPrediction = numbers.indexOf(
        Math.max(...numbers)
    );

    const colourPrediction =
        Object.keys(colours).reduce(
            (a, b) => colours[a] >= colours[b] ? a : b
        );

    const prediction = {
        game: selectedGame,
        period: targetPeriod,
        number: numberPrediction,
        bigSmall: trend.prediction,
        colour: colourPrediction,
        samples: sample.length,
        trendStrength: trend.trendStrength,
        bigPercent: trend.bigPercent,
        smallPercent: trend.smallPercent,
        breakdown: trend.breakdown,
        streakType: patterns.streakType,
        streakLength: patterns.streakLength,
        alternations: patterns.alternations,
        settled: false,
        createdAt: new Date().toISOString()
    };

    if (existingIndex !== -1) {
        const existing = predictions[existingIndex];

        if (!existing.settled) {
            predictions[existingIndex] = prediction;
        } else {
            displayPrediction(existing);
            return;
        }
    } else {
        predictions.push(prediction);
    }

    savePredictions();

    displayPrediction(prediction);
    renderPredictionHistory();
}

// VERIFY PREDICTIONS
function verifyPredictions() {
    let changed = false;

    predictions.forEach(prediction => {
        if (prediction.game !== selectedGame ||
            prediction.settled) return;

        const actual = results.find(
            r => r.game === selectedGame &&
                 String(r.period) === String(prediction.period)
        );

        if (!actual) return;

        const actualBigSmall = getBigSmall(actual.number);

        prediction.actualNumber = actual.number;
        prediction.actualBigSmall = actualBigSmall;

        prediction.actualColour =
            actual.colour || getColour(actual.number);

        prediction.numberCorrect =
            prediction.number === actual.number;

        prediction.bigSmallCorrect =
            prediction.bigSmall === actualBigSmall;

        prediction.colourCorrect =
            prediction.colour === prediction.actualColour;

        prediction.settled = true;

        prediction.settledAt =
            new Date().toISOString();

        changed = true;
    });

    if (changed) savePredictions();
}

// ACCURACY
function getAccuracy(type) {
    const records = predictions.filter(
        p => p.game === selectedGame &&
             p.settled &&
             p.bigSmall !== "NO CLEAR SIGNAL" &&
             p.actualBigSmall
    );

    if (!records.length) return "Not available";

    const correct = records.filter(p => {
        if (type === "bigSmall") {
            return p.bigSmall === p.actualBigSmall;
        }

        if (type === "number") return p.numberCorrect;

        return p.colourCorrect;
    }).length;

    return (
        correct / records.length * 100
    ).toFixed(1);
}

// ENGINE STATUS
function updateEngineStatus() {
    let panel = document.getElementById("engineStatus");

    if (!panel) {
        panel = document.createElement("section");
        panel.id = "engineStatus";
        panel.className = "card";

        document.querySelector("main").prepend(panel);
    }

    const gameResults = results.filter(
        r => r.game === selectedGame
    );

    panel.innerHTML = `
        <h2>ULTRA AI PRO ENGINE</h2>
        <p>Backend: ${backendStatus}</p>
        <p>Engine Version: ${backendVersion}</p>
        <p>Selected Game: ${selectedGame || "None"}</p>
        <p>Stored Results: ${gameResults.length}</p>
        <p>Last Updated: ${lastUpdated}</p>
        <small>
        Analysis uses locally accumulated historical results.
        </small>
    `;
}

// DISPLAY PREDICTION
function displayPrediction(p) {
    let panel = document.getElementById("predictionPanel");

    if (!panel) {
        panel = document.createElement("section");
        panel.id = "predictionPanel";
        panel.className = "card";

        document.querySelector("main").appendChild(panel);
    }

    const trend = p.breakdown || {};

    const signal = p.bigSmall || "NO CLEAR SIGNAL";

    function windowText(size) {
        const item = trend[size];

        if (!item) {
            return "Not enough data";
        }

        return `
            BIG ${item.bigPercent}% |
            SMALL ${item.smallPercent}%
            (${item.total} results)
        `;
    }

    panel.innerHTML = `
        <h2>ULTRA AI WEIGHTED TREND ENGINE</h2>

        <h3>UPCOMING PERIOD</h3>
        <p>${p.period}</p>

        <h3>BIG / SMALL SIGNAL</h3>
        <p>${signal}</p>

        <h3>TREND STRENGTH</h3>
        <p>${p.trendStrength || "N/A"}%</p>

        <h3>WEIGHTED ANALYSIS</h3>
        <p>BIG: ${p.bigPercent || "N/A"}%</p>
        <p>SMALL: ${p.smallPercent || "N/A"}%</p>

        <h3>TIMEFRAME BREAKDOWN</h3>
        <p>Last 10: ${windowText(10)}</p>
        <p>Last 30: ${windowText(30)}</p>
        <p>Last 50: ${windowText(50)}</p>
        <p>Last 100: ${windowText(100)}</p>

        <h3>PATTERN ANALYSIS</h3>
        <p>Current streak: ${p.streakType || "N/A"} × ${p.streakLength || 0}</p>
        <p>Alternations: ${p.alternations ?? "N/A"}</p>

        <h3>COLOUR ESTIMATE</h3>
        <p>${String(p.colour || "N/A").replace(",", " + ")}</p>

        <h3>NUMBER FREQUENCY ESTIMATE</h3>
        <p>${p.number ?? "N/A"}</p>

        <hr>

        <h3>HISTORICAL ACCURACY</h3>
        <p>BIG / SMALL: ${
            getAccuracy("bigSmall") === "Not available"
            ? "Not available"
            : getAccuracy("bigSmall") + "%"
        }</p>

        <p>Prediction Status:
        ${p.settled ? "RESULT VERIFIED" : "WAITING FOR RESULT"}
        </p>

        <small>
        Statistical analysis only. Random outcomes cannot be
        reliably predicted or guaranteed.
        </small>
    `;
}

// SHOW EXISTING PREDICTION
function displayCurrentPrediction() {
    const existing = predictions
        .filter(p => p.game === selectedGame && !p.settled)
        .sort((a, b) =>
            comparePeriods(b.period, a.period)
        )[0];

    if (existing) {
        displayPrediction(existing);
    }
}

// PREDICTION HISTORY
function renderPredictionHistory() {
    const table = document.getElementById(
        "predictionHistory"
    );

    if (!table) return;

    const history = predictions
        .filter(p => p.game === selectedGame)
        .sort((a, b) =>
            comparePeriods(b.period, a.period)
        )
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
        const predicted = p.bigSmall || "N/A";

        const actual = p.settled
            ? p.actualBigSmall
            : "Pending";

        let status;

        if (predicted === "NO CLEAR SIGNAL") {
            status = "⚪ SKIP";
        } else if (!p.settled) {
            status = "⏳ WAITING";
        } else if (p.bigSmall === p.actualBigSmall) {
            status = "🟢 WIN";
        } else {
            status = "🔴 LOSS";
        }

        return `
            <tr>
                <td>${p.period}</td>
                <td>${predicted}</td>
                <td>${actual || "Pending"}</td>
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
    const filtered = results
        .filter(r => r.game === selectedGame)
        .sort((a, b) =>
            comparePeriods(a.period, b.period)
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
    updateEngineStatus();
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

    const patterns = analysePatterns(filtered);

    const bigCount = recent.filter(
        r => getBigSmall(r.number) === "BIG"
    ).length;

    const smallCount = recent.length - bigCount;

    panel.innerHTML = `
        <h2>AI TREND MONITOR</h2>
        <p>Last 10 BIG: ${bigCount}</p>
        <p>Last 10 SMALL: ${smallCount}</p>
        <p>Current streak: ${patterns.streakType} × ${patterns.streakLength}</p>
        <p>Alternations (last 100): ${patterns.alternations}</p>
    `;
}

// AUTO REFRESH
setInterval(() => {
    if (selectedGame) {
        fetchWingoResults();
    }
}, 10000);