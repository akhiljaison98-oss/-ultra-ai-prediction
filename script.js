// ============================================
// ULTRA AI PRO - CORRECTED COMPLETE SCRIPT
// Version 4.0
// ============================================

const WORKER_URL =
"https://ultra-ai-prediction.akhiljaison98.workers.dev/";

let selectedGame = "";

let results = safeParse("ultraResults", []);
let predictions = safeParse("ultraPredictions", []);

if (!Array.isArray(results)) results = [];

if (!Array.isArray(predictions)) {
    predictions = Object.values(predictions || {}).filter(Boolean);
}

const activeRequests = new Set();

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

function saveResults() {
    const unique = new Map();

    results.forEach(item => {
        if (!item || !item.game || !item.period) return;

        unique.set(
            item.game + "_" + item.period,
            item
        );
    });

    results = Array.from(unique.values());

    localStorage.setItem(
        "ultraResults",
        JSON.stringify(results.slice(-1000))
    );
}

function savePredictions() {
    const unique = new Map();

    predictions.forEach(item => {
        if (!item || !item.game || !item.period) return;

        unique.set(
            item.game + "_" + item.period,
            item
        );
    });

    predictions = Array.from(unique.values());

    localStorage.setItem(
        "ultraPredictions",
        JSON.stringify(predictions.slice(-1000))
    );
}

// ============================================
// HELPERS
// ============================================

function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = value;
    }
}

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
    const value = String(game).toLowerCase();

    if (value.includes("30") || value.includes("second")) {
        return "30s";
    }

    if (value.includes("1") || value.includes("minute")) {
        return "1m";
    }

    return null;
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
        if (x.length !== y.length) {
            return x.length - y.length;
        }

        return x.localeCompare(y);
    }

    return x.localeCompare(y);
}

function nextPeriod(period) {
    const digits = String(period).split("");

    if (!/^\d+$/.test(String(period))) return "";

    let carry = 1;

    for (let i = digits.length - 1; i >= 0 && carry; i--) {
        const value = Number(digits[i]) + carry;

        digits[i] = String(value % 10);
        carry = value > 9 ? 1 : 0;
    }

    if (carry) digits.unshift("1");

    return digits.join("");
}

// ============================================
// GAME SELECTION
// ============================================

function selectGame(game) {

    const code = getGameCode(game);

    if (!code) {
        setText("message", "Please select a valid game.");
        return;
    }

    selectedGame =
        code === "30s" ? "30 Seconds" : "1 Minute";

    setText(
        "game",
        "Selected: Wingo " + selectedGame
    );

    updateDashboard();
    renderPredictionHistory();

    fetchWingoResults();
}

// ============================================
// GET RESULTS FOR SELECTED GAME
// ============================================

function getGameResults(game) {

    return results
        .filter(item => item.game === game)
        .sort((a, b) =>
            comparePeriods(a.period, b.period)
        );
}

// ============================================
// CLOUDFLARE CONNECTION
// ============================================

async function fetchWingoResults() {

    if (!selectedGame) return;

    const gameAtRequest = selectedGame;
    const gameCode = getGameCode(gameAtRequest);

    if (!gameCode || activeRequests.has(gameAtRequest)) {
        return;
    }

    activeRequests.add(gameAtRequest);

    setText(
        "message",
        "Connecting to ULTRA AI..."
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
            data.success !== true ||
            !Array.isArray(data.history)
        ) {
            throw new Error("Invalid API response");
        }

        // Save results for this game

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
                    premium: item.premium || getBigSmall(number),
                    time: new Date().toISOString()
                });
            }
        });

        saveResults();

        verifyPredictions(gameAtRequest);

        generatePrediction(gameAtRequest);

        // Only update the visible dashboard
        // if this is still the selected game.

        if (selectedGame === gameAtRequest) {

            updateDashboard();
            renderPredictionHistory();

            setText(
                "message",
                "LIVE CONNECTED | " +
                gameAtRequest +
                " | Period: " +
                (data.current?.issueNumber || "Available")
            );
        }

    } catch (error) {

        console.error("Connection error:", error);

        if (selectedGame === gameAtRequest) {

            setText(
                "message",
                "Connection error: " + error.message
            );
        }

    } finally {

        activeRequests.delete(gameAtRequest);
    }
}

// ============================================
// STATISTICAL ANALYSIS
// ============================================

function analyseResults(filtered) {

    const total = filtered.length;

    if (!total) return null;

    const big = filtered.filter(
        r => getBigSmall(r.number) === "BIG"
    ).length;

    const small = total - big;

    const green = filtered.filter(
        r => String(r.colour).includes("GREEN")
    ).length;

    const red = filtered.filter(
        r => String(r.colour).includes("RED")
    ).length;

    const violet = filtered.filter(
        r => String(r.colour).includes("VIOLET")
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
// WEIGHTED TREND ENGINE
// ============================================

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

    if (!totalWeight) return null;

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
// GENERATE PREDICTION
// ============================================

function generatePrediction(game) {

    const filtered = getGameResults(game);

    if (filtered.length < 10) return;

    const latest = filtered[filtered.length - 1];

    const period = nextPeriod(latest.period);

    if (!period) return;

    const exists = predictions.some(p =>
        p.game === game &&
        String(p.period) === period
    );

    if (exists) return;

    const analysis = analyseWeightedTrend(filtered);

    if (!analysis) return;

    predictions.push({

        game: game,

        period: period,

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

function verifyPredictions(game) {

    predictions.forEach(prediction => {

        if (
            prediction.game !== game ||
            prediction.status !== "PENDING"
        ) {
            return;
        }

        const actualResult = results.find(r =>
            r.game === game &&
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
    });

    savePredictions();
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

    const frequencyElement = document.getElementById("frequency");

    if (frequencyElement) {

        frequencyElement.innerHTML =
            Object.entries(analysis.frequency)
                .map(([number, count]) =>
                    `<p>Number ${number}: ${count}</p>`
                )
                .join("");
    }

    // Recent results

    const historyElement = document.getElementById("history");

    if (historyElement) {

        historyElement.innerHTML =
            filtered.slice(-15).reverse()
                .map(item => `
                    <p>
                        Period: ${escapeHTML(item.period)}
                        | Number: ${item.number}
                        | ${getBigSmall(item.number)}
                        | ${escapeHTML(item.colour)}
                    </p>
                `)
                .join("");
    }

    // Latest signal

    const trend = analyseWeightedTrend(filtered);

    if (trend) {

        setText(
            "game",
            "Wingo " + selectedGame +
            " | Trend: " + trend.trendStrength + "%" +
            " | Signal: " + trend.prediction
        );
    }
}

// ============================================
// PREDICTION HISTORY
// ============================================

function renderPredictionHistory() {

    const table = document.getElementById("predictionHistory");

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

    table.innerHTML = filtered.map(item => `

        <tr>
            <td>${escapeHTML(item.period)}</td>
            <td>${escapeHTML(item.prediction)}</td>
            <td>${escapeHTML(item.actual || "-")}</td>
            <td>${escapeHTML(item.status)}</td>
        </tr>

    `).join("");
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

console.log("ULTRA AI PRO Version 4.0 loaded");