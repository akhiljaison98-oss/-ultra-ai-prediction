// ULTRA AI - STATISTICAL ENGINE
let selectedGame = "";

let results = JSON.parse(
    localStorage.getItem("ultraResults") || "[]"
);

function selectGame(game) {
    selectedGame = game;

    document.getElementById("game").innerText =
        "Selected: Wingo " + game;

    updateDashboard();
}

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

    // UPDATE COLOUR AND PERCENTAGE STATISTICS
    updateColourDashboard();
}


// COLOUR STATISTICS

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

    // Colour counts
    if (document.getElementById("green")) {
        document.getElementById("green").innerText = green;
        document.getElementById("red").innerText = red;
        document.getElementById("violet").innerText = violet;
    }

    // Big and Small percentages
    if (document.getElementById("bigPercent")) {
        document.getElementById("bigPercent").innerText =
            total ? ((filtered.filter(r => r.number >= 5).length / total) * 100).toFixed(1) + "%" : "0%";

        document.getElementById("smallPercent").innerText =
            total ? ((filtered.filter(r => r.number < 5).length / total) * 100).toFixed(1) + "%" : "0%";
    }
}

updateDashboard();

console.log("ULTRA AI Statistical Engine Loaded");
