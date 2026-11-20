// ============================================
// ULTRA AI PRO - COMPLETE SCRIPT
// Version 3.0
// ============================================

let selectedGame = "";
let fetching = false;

const WORKER_URL =
"https://ultra-ai-prediction.akhiljaison98.workers.dev/";

// ============================================
// STORAGE
// ============================================

function safeParse(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : fallback;
    } catch (error) {
        console.error("Storage error:", error);
        return fallback;
    }
}

let results = safeParse("ultraResults", []);

if (!Array.isArray(results)) {
    results = [];
}

let oldPredictions = safeParse("ultraPredictions", []);

let predictions = Array.isArray(oldPredictions)
    ? oldPredictions
    : Object.values(oldPredictions || {}).filter(Boolean);

// ============================================
// HELPERS
// ============================================

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function getGameCode(game) {
    return game === "30 Seconds" ? "30s" : "1m";
}

function getBigSmall(number) {
    return Number(number) >= 5 ? "BIG" : "SMALL";
}

function getColour(number) {
    number = Number(number);

    if (number === 0) return "RED,VIOLET";
    if (number === 5) return "GREEN,VIOLET";

    return number % 2 === 0 ? "RED" : "GREEN";
}

function comparePeriods(a, b) {
    const x = String(a ?? "");
    const y = String(b ?? "");

    if (/^\d+$/.test(x) && /^\d+$/.test(y)) {
        const bx = BigInt(x);
        const by = BigInt(y);

        return bx < by ? -1 : bx > by ? 1 : 0;
    }

    return x.localeCompare(y);
}

function nextPeriod(period) {
    if (!/^\d+$/.test(String(period))) {
        return "";
    }

    return (BigInt(period) + 1n).toString();
}

function getElement(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const element = getElement(id);

    if (element) {
        element.textContent = value;
    }
}

// ============================================
// SAVE DATA
// ============================================

function saveResults() {
    const unique = new Map();

    results.forEach(item => {
        if (!item || !item.game || !item.period) return;

        const key = item.game + "_" + item.period;

        unique.set(key, item);
    });

    results = Array.from(unique.values());

    results.sort((a, b) => comparePeriods(a.period, b.period));

    results = results.slice(-1000);

    localStorage.setItem(
        "ultraResults",
        JSON.stringify(results)
    );
}

function savePredictions() {
    const unique = new Map();

    predictions.forEach(item => {
        if (!item || !item.game || !item.period) return;

        const key = item.game + "_" + item.period;

        unique.set(key, item);
    });

    predictions = Array.from(unique.values());

    predictions.sort((a, b) => comparePeriods(a.period, b.period));

    predictions = predictions.slice(-1000);

    localStorage.setItem(
        "ultraPredictions",
        JSON.stringify(predictions)
    );
}

// ============================================
// GAME SELECTION
// ============================================

function selectGame(game) {

    if (
        game !== "30 Seconds" &&
        game !== "1 Minute"
    ) {
        return;
    }

    selectedGame = game;

    setText("game", "Selected: Wingo " + game);

    updateDashboard();
    renderPredictionHistory();

    fetchWingoResults();
}

// ============================================
// FETCH CLOUDFARE RESULTS
// ============================================

async function fetchWingoResults() {

    if (!selectedGame || fetching) return;

    fetching = true;

    const gameAtRequest = selectedGame;

    const gameCode = getGameCode(gameAtRequest);

    setText(
        "message",
        "Connecting to ULTRA AI backend..."
    );

    try {

        const response = await fetch(
            WORKER_URL + "?game=" + gameCode,
            {
                method: "GET",
                cache: "no-store"
            }
        );

        if (!response.ok) {
            throw new Error("Server error: " + response.status);
        }

        const data = await response.json();

        if (
            !data.success ||
            !Array.isArray(data.history)
        ) {
            throw new Error("Invalid server response");
        }

        if (selectedGame !== gameAtRequest) {
            return;
        }

        // Add results to local history

        data.history.forEach(item => {

            const period = String(item.issueNumber ?? "");

            const number = Number(item.number);

            if (
                !period ||
                !Number.isInteger(number) ||
                number < 0 ||
                number > 9
            ) {
                return;
            }

            const exists = results.some(r =>
                r.game === gameAtRequest &&
                String(r.period) === period
            );

            if (!exists) {

                results.push({
                    game: gameAtRequest,
                    period: period,
                    number: number,
                    colour: item.colour || getColour(number),
                    time: new Date().toISOString()
                });
            }
        });

        saveResults();

        verifyPredictions();

        generatePrediction();

        updateDashboard();

        renderPredictionHistory();

        const latest = getGameResults(gameAtRequest);

        const latestResult = latest[latest.length - 1];

        const currentPeriod =
            data.current?.issueNumber || "Available";

        setText(
            "message",
            "LIVE CONNECTED | Current Period: " +
            currentPeriod +
            (latestResult
                ? " | Latest Result: " + latestResult.number
                : "")
        );

    } catch (error) {

        console.error("Fetch error:", error);

        if (selectedGame === gameAtRequest) {

            setText(
                "message",
                "Connection error: " + error.message
            );
        }

    } finally {

        fetching = false;
    }
}

// ============================================
// GET GAME RESULTS
// ============================================

function getGameResults(game) {

    return results
        .filter(item => item.game === game)
        .sort((a, b) =>
            comparePeriods(a.period, b.period)
        );
}

// ============================================
// STATISTICAL ANALYSIS
// ============================================

function analyseResults(filtered) {

    const total = filtered.length;

    if (total === 0) {
        return null;
    }

    const big = filtered.filter(
        r => getBigSmall(r.number) === "BIG"
    ).length;

    const small = total - big;

    const green = filtered.filter(
        r => getColour(r.number).includes("GREEN")
    ).length;

    const red = filtered.filter(
        r => getColour(r.number).includes("RED")
    ).length;

    const violet = filtered.filter(
        r => getColour(r.number).includes("VIOLET")
    ).length;

    const frequency = {};

    for (let i = 0; i <= 9; i++) {
        frequency[i] = filtered.filter(
            r => Number(r.number) === i
        ).length;
    }

    return {
        total,
        big,
        small,
        green,
        red,
        violet,
        frequency,
        bigPercent: (big / total * 100).toFixed(1),
        smallPercent: (small / total * 100).toFixed(1)
    };
}

// ============================================
// WEIGHTED TREND ANALYSIS
// ============================================

function analyseWeightedTrend(filtered) {

    if (filtered.length < 10) {
        return {
            prediction: "INSUFFICIENT DATA",
            trendStrength: "0.0",
            bigPercent: "0.0",
            smallPercent: "0.0"
        };
    }

    const windows = [
        { size: 10, weight: 0.40 },
        { size: 30, weight: 0.30 },
        { size: 50, weight: 0.20 },
        { size: 100, weight: 0.10 }
    ];

    let bigScore = 0;
    let smallScore = 0;
    let totalWeight = 0;

    windows.forEach(window => {

        if (filtered.length < window.size) return;

        const sample = filtered.slice(-window.size);

        const big = sample.filter(
            r => getBigSmall(r.number) === "BIG"
        ).length;

        const small = sample.length - big;

        bigScore +=
            (big / sample.length) * window.weight;

        smallScore +=
            (small / sample.length) * window.weight;

        totalWeight += window.weight;
    });

    bigScore /= totalWeight;
    smallScore /= totalWeight;

    const strength =
        Math.max(bigScore, smallScore) * 100;

    let prediction = "NO CLEAR SIGNAL";

    if (strength >= 55) {
        prediction =
            bigScore > smallScore ? "BIG" : "SMALL";
    }

    return {
        prediction,
        trendStrength: strength.toFixed(1),
        bigPercent: (bigScore * 100).toFixed(1),
        smallPercent: (smallScore * 100).toFixed(1)
    };
}

// ============================================
// GENERATE STATISTICAL PREDICTION
// ============================================

function generatePrediction() {

    if (!selectedGame) return;

    const filtered = getGameResults(selectedGame);

    if (filtered.length < 10) return;

    const latest = filtered[filtered.length - 1];

    const next = nextPeriod(latest.period);

    if (!next) return;

    const analysis = analyseWeightedTrend(filtered);

    const existing = predictions.find(p =>
        p.game === selectedGame &&
        String(p.period) === next
    );

    if (existing) return;

    predictions.push({

        game: selectedGame,

        period: next,

        prediction: analysis.prediction,

        trendStrength: analysis.trendStrength,

        actual: "",

        status: "PENDING",

        createdAt: new Date().toISOString()
    });

    savePredictions();
}

// ============================================
// VERIFY PREDICTIONS
// ============================================

function verifyPredictions() {

    let changed = false;

    predictions.forEach(prediction => {

        if (
            prediction.game !== selectedGame ||
            prediction.status !== "PENDING"
        ) {
            return;
        }

        const actualResult = results.find(r =>
            r.game === prediction.game &&
            String(r.period) === String(prediction.period)
        );

        if (!actualResult) return;

        const actual = getBigSmall(actualResult.number);

        prediction.actual = actual;

        if (
            prediction.prediction === "BIG" ||
            prediction.prediction === "SMALL"
        ) {

            prediction.status =
                prediction.prediction === actual
                    ? "WIN"
                    : "LOSS";

        } else {

            prediction.status = "NO SIGNAL";
        }

        changed = true;
    });

    if (changed) {
        savePredictions();
    }
}

// ============================================
// UPDATE DASHBOARD
// ============================================

function updateDashboard() {

    if (!selectedGame) return;

    const filtered = getGameResults(selectedGame);

    const analysis = analyseResults(filtered);

    if (!analysis) {

        setText("total", "0");
        setText("big", "0");
        setText("small", "0");
        setText("green", "0");
        setText("red", "0");
        setText("violet", "0");

        setText("bigPercent", "0%");
        setText("smallPercent", "0%");

        setText("frequency", "Waiting for results...");
        setText("history", "Waiting for results...");

        return;
    }

    setText("total", analysis.total);
    setText("big", analysis.big);
    setText("small", analysis.small);

    setText("green", analysis.green);
    setText("red", analysis.red);
    setText("violet", analysis.violet);

    setText("bigPercent", analysis.bigPercent + "%");
    setText("smallPercent", analysis.smallPercent + "%");

    // Number frequency

    const frequencyHTML = Object.keys(
        analysis.frequency
    ).map(number => {

        return `
            <p>
                Number ${number}:
                ${analysis.frequency[number]}
            </p>
        `;

    }).join("");

    const frequencyElement = getElement("frequency");

    if (frequencyElement) {
        frequencyElement.innerHTML = frequencyHTML;
    }

    // Recent results

    const recent = filtered.slice(-15).reverse();

    const historyHTML = recent.map(item => {

        return `
            <p>
                Period: ${escapeHTML(item.period)}
                | Number: ${item.number}
                | ${escapeHTML(getBigSmall(item.number))}
                | ${escapeHTML(item.colour)}
            </p>
        `;

    }).join("");

    const historyElement = getElement("history");

    if (historyElement) {
        historyElement.innerHTML =
            historyHTML || "No history available";
    }

    // Statistical signal

    const trend = analyseWeightedTrend(filtered);

    const latestPrediction = predictions
        .filter(p => p.game === selectedGame)
        .slice(-1)[0];

    if (latestPrediction) {

        setText(
            "game",
            "Wingo " + selectedGame +
            " | Next period: " + latestPrediction.period +
            " | Signal: " + latestPrediction.prediction +
            " | Trend: " + latestPrediction.trendStrength + "%"
        );
    }
}

// ============================================
// PREDICTION HISTORY TABLE
// ============================================

function renderPredictionHistory() {

    const table = getElement("predictionHistory");

    if (!table || !selectedGame) return;

    const filtered = predictions
        .filter(p => p.game === selectedGame)
        .sort((a, b) =>
            comparePeriods(b.period, a.period)
        )
        .slice(0, 50);

    if (!filtered.length) {

        table.innerHTML = `
            <tr>
                <td colspan="4">Waiting for predictions...</td>
            </tr>
        `;

        return;
    }

    table.innerHTML = filtered.map(item => {

        return `
            <tr>
                <td>${escapeHTML(item.period)}</td>

                <td>${escapeHTML(item.prediction)}</td>

                <td>${escapeHTML(item.actual || "-")}</td>

                <td>${escapeHTML(item.status)}</td>
            </tr>
        `;

    }).join("");
}

// ============================================
// AUTOMATIC REFRESH
// ============================================

setInterval(() => {

    if (selectedGame) {
        fetchWingoResults();
    }

}, 10000);

// ============================================
// STARTUP
// ============================================

updateDashboard();

renderPredictionHistory();

console.log("ULTRA AI PRO loaded successfully");