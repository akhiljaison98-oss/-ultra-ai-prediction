const ALLOWED_ORIGIN =
    "https://akhiljaison98-oss.github.io";

function comparePeriods(a, b) {
    const x = String(a).replace(/^0+(?=\d)/, "");
    const y = String(b).replace(/^0+(?=\d)/, "");

    if (x.length !== y.length) {
        return x.length - y.length;
    }

    return x.localeCompare(y);
}

function getBigSmall(number) {
    return number >= 5 ? "BIG" : "SMALL";
}

// BACKEND ANALYSIS ENGINE
function analyseHistory(history) {
    const valid = history
        .map(item => ({
            period: String(item.issueNumber),
            number: Number(item.number)
        }))
        .filter(item =>
            /^\d+$/.test(item.period) &&
            Number.isInteger(item.number) &&
            item.number >= 0 &&
            item.number <= 9
        )
        .sort((a, b) =>
            comparePeriods(a.period, b.period)
        );

    const windows = [10, 30, 50, 100];

    const analysis = {};

    windows.forEach(size => {
        const sample = valid.slice(-size);

        if (!sample.length) {
            analysis[size] = null;
            return;
        }

        const big = sample.filter(
            item => getBigSmall(item.number) === "BIG"
        ).length;

        const small = sample.length - big;

        analysis[size] = {
            total: sample.length,
            big,
            small,
            bigPercent: Number(
                (big / sample.length * 100).toFixed(1)
            ),
            smallPercent: Number(
                (small / sample.length * 100).toFixed(1)
            )
        };
    });

    // WEIGHTED TREND
    const weights = [
        { size: 10, weight: 0.50 },
        { size: 30, weight: 0.30 },
        { size: 100, weight: 0.20 }
    ];

    let bigScore = 0;
    let smallScore = 0;
    let totalWeight = 0;

    weights.forEach(item => {
        const trend = analysis[item.size];

        if (!trend) return;

        bigScore +=
            trend.bigPercent / 100 * item.weight;

        smallScore +=
            trend.smallPercent / 100 * item.weight;

        totalWeight += item.weight;
    });

    if (totalWeight > 0) {
        bigScore /= totalWeight;
        smallScore /= totalWeight;
    }

    const strength =
        Math.max(bigScore, smallScore) * 100;

    let signal = "NO CLEAR SIGNAL";

    if (valid.length >= 10 && strength >= 55) {
        signal = bigScore > smallScore ? "BIG" : "SMALL";
    }

    // RECENT STREAK
    let streak = 0;
    let streakType = null;

    for (let i = valid.length - 1; i >= 0; i--) {
        const current = getBigSmall(valid[i].number);

        if (streakType === null) {
            streakType = current;
            streak = 1;
        } else if (current === streakType) {
            streak++;
        } else {
            break;
        }
    }

    // ALTERNATION ANALYSIS
    let alternations = 0;

    for (let i = 1; i < valid.length; i++) {
        if (
            getBigSmall(valid[i].number) !==
            getBigSmall(valid[i - 1].number)
        ) {
            alternations++;
        }
    }

    return {
        engine: "ULTRA AI PRO",
        version: "2.0",
        totalResults: valid.length,

        signal,

        trendStrength: Number(strength.toFixed(1)),

        bigScore: Number((bigScore * 100).toFixed(1)),
        smallScore: Number((smallScore * 100).toFixed(1)),

        windows: analysis,

        recentStreak: {
            type: streakType,
            length: streak
        },

        alternations,

        note: "Historical statistical analysis only. Future outcomes are not guaranteed."
    };
}

export default {
    async fetch(request, env) {

        const origin = request.headers.get("Origin");

        const allowedOrigin =
            origin === ALLOWED_ORIGIN
                ? ALLOWED_ORIGIN
                : ALLOWED_ORIGIN;

        const cors = {
            "Access-Control-Allow-Origin": allowedOrigin,
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Vary": "Origin",
            "Content-Type": "application/json",
            "X-Content-Type-Options": "nosniff"
        };

        const reply = (data, status = 200, extra = {}) =>
            new Response(JSON.stringify(data), {
                status,
                headers: {
                    ...cors,
                    ...extra
                }
            });

        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: cors
            });
        }

        if (request.method !== "GET") {
            return reply({
                success: false,
                error: "Method not allowed"
            }, 405);
        }

        if (!env.WINGOBOT_API_TOKEN) {
            return reply({
                success: false,
                error: "API token is missing"
            }, 500);
        }

        const url = new URL(request.url);
        const game = url.searchParams.get("game");

        let endpoint;

        if (game === "30s") {
            endpoint = "30-sec-game-history";
        } else if (game === "1m") {
            endpoint = "1-min-game-history";
        } else {
            return reply({
                success: false,
                error: "Use game=30s or game=1m"
            }, 400);
        }

        // SHORT CACHE
        const cacheKey = new Request(
            `${url.origin}/__ultra_cache/${game}`
        );

        const cache = caches.default;

        const cached = await cache.match(cacheKey);

        if (cached) {
            const cachedData = await cached.json();

            return reply(
                cachedData,
                200,
                { "X-Engine-Cache": "HIT" }
            );
        }

        try {
            const response = await fetch(
                `https://api.wingobot.com/v2/${endpoint}`,
                {
                    headers: {
                        "Authorization":
                            `Bearer ${env.WINGOBOT_API_TOKEN}`
                    },
                    signal: AbortSignal.timeout(8000)
                }
            );

            if (!response.ok) {
                return reply({
                    success: false,
                    error: "Upstream API error",
                    upstreamStatus: response.status
                }, 502);
            }

            const data = await response.json();

            if (
                !data ||
                !Array.isArray(data.history)
            ) {
                return reply({
                    success: false,
                    error: "Invalid history response"
                }, 502);
            }

            // ADD ANALYSIS WITHOUT CHANGING ORIGINAL HISTORY
            const output = {
                ...data,
                analysis: analyseHistory(data.history)
            };

            const cacheResponse = new Response(
                JSON.stringify(output),
                {
                    headers: {
                        ...cors,
                        "Cache-Control": "public, max-age=5"
                    }
                }
            );

            await cache.put(
                cacheKey,
                cacheResponse.clone()
            );

            return reply(
                output,
                200,
                { "X-Engine-Cache": "MISS" }
            );

        } catch (error) {
            return reply({
                success: false,
                error: "Unable to fetch game history"
            }, 502);
        }
    }
};