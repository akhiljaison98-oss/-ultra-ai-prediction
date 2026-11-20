let selectedGame = "";

let results = JSON.parse(
    localStorage.getItem("ultraResults") || "[]"
);

let predictions = JSON.parse(
    localStorage.getItem("ultraPredictions") || "{}"
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

// SAVE DATA
function saveResults() {
    results = results.slice(-500);

    localStorage.setItem(
        "ultraResults",
        JSON.stringify(results)
    );
}

function savePredictions() {
    localStorage.setItem(
        "ultraPredictions",
        JSON.stringify(predictions)
    );
}

// MANUAL RESULT
function addResult() {
    const input = document.getElementById("numberInput");
    const number = Number(input.value);

    if (!selectedGame) {
        alert("Select a game first!");
        return;
    }

    if (input.value === "" ||
        !Number.isInteger(number) ||
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

    updateDashboard();
}

// FETCH LIVE RESULTS
async function fetchWingoResults() {
    if (!selectedGame) return;

    const gameCode =
        selectedGame === "30 Seconds" ? "30s" : "1m";

    try {
        const response = await fetch(
            WORKER_URL + "?game=" + gameCode
        );

        if (!response.ok) {
            throw new Error("API error");
        }

        const data = await response.json();

        if (!data.success || !Array.isArray(data.history)) {
            throw new Error("Invalid API response");
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

        verifyPredictions();
        generatePrediction();
        updateDashboard();

        document.getElementById("message").innerText =
            "LIVE CONNECTED | " + data.current.issueNumber;

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

// NEXT PERIOD NUMBER
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
            Number.isInteger(r.number)
        )
        .sort((a, b) =>
            a.period.localeCompare(b.period)
        );

    if (filtered.length < 10) {
        showPredictionMessage(
            "Collect at least 10 completed results."
        );
        return;
    }

    const latest = filtered[filtered.length - 1];

    const targetPeriod = nextPeriod(latest.period);

    const existing = predictions[selectedGame];

    // Keep an existing pending prediction
    if (existing &&
        existing.period === targetPeriod &&
        !existing.settled) {
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

        const colour = item.colour ||
            getColour(item.number);

        if (colours[colour] !== undefined) {
            colours[colour]++;
        }
    });

    const total = sample.length;

    const numberPrediction = numbers.indexOf(
        Math.max(...numbers)
    );

    const bigPrediction = big >= small ? "BIG" : "SMALL";

    const colourPrediction = Object.keys(colours).reduce(
        (a, b) => colours[a] >= colours[b] ? a : b
    );

    const bigShare = Math.max(big, small) / total;

    const numberShare =
        numbers[numberPrediction] / total;

    const prediction = {
        period: targetPeriod,
        number: numberPrediction,
        bigSmall: bigPrediction,
        colour: colourPrediction,
        samples: total,
        historicalBigSmallShare: bigShare,
        historicalNumberShare: numberShare,
        settled: false,
        createdAt: new Date().toISOString()
    };

    predictions[selectedGame] = prediction;

    savePredictions();
    displayPrediction(prediction);
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

    const bigSmallAccuracy = getAccuracy("bigSmall");
    const colourAccuracy = getAccuracy("colour");
    const numberAccuracy = getAccuracy("number");

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

        <h3>HISTORICAL ACCURACY TRACKER</h3>
        <p>Big / Small: ${bigSmallAccuracy}%</p>
        <p>Colour: ${colourAccuracy}%</p>
        <p>Exact Number: ${numberAccuracy}%</p>

        <p>
            Prediction status:
            ${p.settled ? "RESULT VERIFIED" : "WAITING FOR RESULT"}
        </p>

        <small>
            Estimates are based on historical frequencies.
            They do not guarantee future outcomes.
        </small>
    `;
}

// VERIFY PREDICTIONS
function verifyPredictions() {
    const prediction = predictions[selectedGame];

    if (!prediction || prediction.settled) return;

    const actual = results.find(
        r => r.game === selectedGame &&
             r.period === prediction.period
    );

    if (!actual) return;

    const actualColour =
        actual.colour || getColour(actual.number);

    prediction.actualNumber = actual.number;

    prediction.actualBigSmall =
        actual.number >= 5 ? "BIG" : "SMALL";

    prediction.actualColour = actualColour;

    prediction.numberCorrect =
        prediction.number === actual.number;

    prediction.bigSmallCorrect =
        prediction.bigSmall === prediction.actualBigSmall;

    prediction.colourCorrect =
        prediction.colour === actualColour;

    prediction.settled = true;

    savePredictions();
}

// ACCURACY CALCULATION
function getAccuracy(type) {
    const records = Object.values(predictions)
        .filter(p => p.settled);

    if (!records.length) return "Not available";

    const correct = records.filter(p => {
        if (type === "number") return p.numberCorrect;
        if (type === "bigSmall") return p.bigSmallCorrect;
        return p.colourCorrect;
    }).length;

    return (correct / records.length * 100).toFixed(1);
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

// COLOUR STATISTICS
function updateColourDashboard(filtered) {
    let green = 0;
    let red = 0;
    let violet = 0;

    filtered.forEach(item => {
        const colour = item.colour || getColour(item.number);

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