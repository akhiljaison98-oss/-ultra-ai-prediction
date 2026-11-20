// ==========================================
// ULTRA AI PRO - COMPLETE SCRIPT
// History-preserving verification upgrade
// ==========================================

let selectedGame = "";

function safeParse(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : fallback;
    } catch (error) {
        console.error("Storage read error:", key, error);
        return fallback;
    }
}

let results = safeParse("ultraResults", []);

if (!Array.isArray(results)) results = [];

const oldPredictions = safeParse("ultraPredictions", []);

let predictions = Array.isArray(oldPredictions)
    ? oldPredictions
    : Object.values(oldPredictions || {}).filter(Boolean);

const WORKER_URL =
    "https://ultra-ai-prediction.akhiljaison98.workers.dev/";

let backendStatus = "WAITING";
let backendVersion = "2.0";
let lastUpdated = "Not available";

let fetching = false;

// ==========================================
// HELPERS
// ==========================================

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function comparePeriods(a, b) {
    const x = String(a ?? "").replace(/^0+(?=\d)/, "");
    const y = String(b ?? "").replace(/^0+(?=\d)/, "");

    if (/^\d+$/.test(x) && /^\d+$/.test(y)) {
        if (x.length !== y.length) {
            return x.length - y.length;
        }

        return x.localeCompare(y);
    }

    return x.localeCompare(y);
}

function getGameCode(game) {
    return game === "30 Seconds" ? "30s" : "1m";
}

function getColour(number) {
    number = Number(number);

    if (number === 0) return "RED,VIOLET";
    if (number === 5) return "GREEN,VIOLET";

    return number % 2 === 1 ? "GREEN" : "RED";
}

function getBigSmall(number) {
    return Number(number) >= 5 ? "BIG" : "SMALL";
}

function nextPeriod(period) {
    if (!period || !/^\d+$/.test(String(period))) {
        return "";
    }

    const digits = String(period).split("");
    let carry = 1;

    for (let i = digits.length - 1; i >= 0 && carry; i--) {
        const value = Number(digits[i]) + carry;

        digits[i] = String(value % 10);
        carry = value > 9 ? 1 : 0;
    }

    if (carry) digits.unshift("1");

    return digits.join("");
}

// ==========================================
// STORAGE
// ==========================================

function trimPredictions() {
    const validGames = [...new Set(
        predictions
            .filter(p => p && p.game && p.period)
            .map(p => p.game)
    )];

    const validRecords = validGames.flatMap(game => {
        return predictions
            .filter(p => p && p.game === game && p.period)
            .sort((a, b) => comparePeriods(a.period, b.period))
            .slice(-500);
    });

    // Preserve any legacy records that cannot be grouped.
    const legacyRecords = predictions.filter(
        p => !p || !p.game || !p.period
    );

    predictions = [...legacyRecords, ...validRecords];
}

function savePredictions() {
    try {
        trimPredictions();

        localStorage.setItem(
            "ultraPredictions",
            JSON.stringify(predictions)
        );
    } catch (error) {
        console.error("Could not save predictions:", error);
        showPredictionMessage(
            "Storage error. Your browser may be running out of storage."
        );
    }
}

function saveResults() {
    const games = [...new Set(
        results.filter(r => r && r.game).map(r => r.game)
    )];

    results = games.flatMap(game =>
        results
            .filter(r => r && r.game === game)
            .sort((a, b) => comparePeriods(a.period, b.period))
            .slice(-500)
    );

    try {
        localStorage.setItem(
            "ultraResults",
            JSON.stringify(results)
        );
    } catch (error) {
        console.error("Could not save results:", error);
    }
}

// Save migrated prediction format without changing storage keys.
savePredictions();

// ==========================================
// GAME SELECTION
// ==========================================

function selectGame(game) {
    selectedGame = game;

    const gameLabel = document.getElementById("game");

    if (gameLabel) {
        gameLabel.innerText = "Selected: Wingo " + game;
    }

    updateDashboard();
    displayCurrentPrediction();
    renderPredictionHistory();

    fetchWingoResults();
}

// ==========================================
// FETCH LIVE RESULTS
// ==========================================

async function fetchWingoResults() {
    if (!selectedGame || fetching) return;

    fetching = true;

    const gameAtRequest = selectedGame;
    const gameCode = getGameCode(gameAtRequest);

    const message = document.getElementById("message");

    try {
        if (message) {
            message.innerText = "Connecting to ULTRA AI backend...";
        }

        const response = await fetch(
            WORKER_URL + "?game=" + gameCode,
            { cache: "no-store" }
        );

        if (!response.ok) {
            throw new Error("API error: " + response.status);
        }

        const data = await response.json();

        if (!data.success || !Array.isArray(data.history)) {
            throw new Error("Invalid API response");
        }

        // Ignore response if the user changed games meanwhile.
        if (selectedGame !== gameAtRequest) return;

        backendStatus = "CONNECTED";

        backendVersion =
            data.analysis?.version || "2.0";

        lastUpdated =
            data.stats?.last_updated || new Date().toISOString();

        [...data.history].reverse().forEach(item => {
            const period = String(item.issueNumber ?? "");
            const number = Number(item.number);

            if (!period ||
                !Number.isInteger(number) ||
                number < 0 ||
                number > 9) {
                return;
            }

            const exists = results.some(r =>
                r.game === gameAtRequest &&
                String(r.period) === period
            );

            if (!exists) {
                results.push({
                    number,
                    game: gameAtRequest,
                    period,
                    colour: item.colour || getColour(number),
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

        if (message) {
            message.innerText =
                "LIVE CONNECTED | Period: " +
                (data.current?.issueNumber || "Available");
        }

    } catch (error) {
        backendStatus = "CONNECTION ERROR";

        if (message && selectedGame === gameAtRequest) {
            message.innerText =
                "Connection error: " + error.message;
        }

        updateEngineStatus();

    } finally {
        fetching = false;
    }
}

// ==========================================
// PATTERN ANALYSIS
// ==========================================

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

// ==========================================
// WEIGHTED TREND ENGINE
// ==========================================

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

// ==========================================
// PREDICTION ENGINE
// ==========================================

function generatePrediction() {
    const filtered = results
        .filter