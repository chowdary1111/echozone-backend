const aiService = require("./ai.service");

/**
 * Identify intent from user message
 */
async function identifyIntent(message) {
    const text = message.toLowerCase();
    let intent = "other";

    // Immediate keyword detection (Fast fallback/Spelling correction)
    if (text.includes("police") || text.includes("cop") || (text.includes("station") && text.includes("police"))) intent = "police";
    if (text.includes("hospital") || text.includes("hospotal") || text.includes("hospit") || text.includes("doctor") || text.includes("medical")) intent = "hospital";
    if (text.includes("cafe") || text.includes("coffee") || text.includes("coffe") || text.includes("caffie")) intent = "cafe";
    if (text.includes("restaurant") || text.includes("food") || text.includes("eat") || text.includes("restarant") || text.includes("dhaba")) intent = "restaurant";
    if (text.includes("fuel") || text.includes("petrol") || text.includes("diesel") || text.includes("bunk")) intent = "fuel";
    if (text.includes("pharmacy") || text.includes("pharmasy") || text.includes("medicine") || text.includes("medical store")) intent = "pharmacy";

    if (!process.env.GEMINI_API_KEY) {
        return { intent, reason: "Keyword fallback (No API Key)" };
    }

    try {
        const prompt = `
        Analyze this user message in an emergency/community safety app. 
        Identify if they are searching for: "police", "hospital", "cafe", "restaurant", "fuel" (petrol bunk), or "pharmacy".
        
        CRITICAL TASK: 
        1. Correct any spelling mistakes (e.g., "hospotal" -> "hospital", "petrol bunkk" -> "fuel", "restarant" -> "restaurant").
        2. If the user is searching for a location, provide the corrected category as the intent.
        
        Message: "${message}"
        `;

        const result = await aiService.safeGenerateContent(prompt, true);
        const resultText = result.response.text();
        
        const parsed = JSON.parse(resultText);
        if (parsed.intent) {
            return parsed;
        }
    } catch (e) {
        console.error("Chatbot AI Error:", e.message);
    }
    
    return { intent, reason: "Keyword fallback (API error or fallback used)" };
}

/**
 * Calculate distance in km between two sets of lat/lng using Haversine formula
 */
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

/**
 * Search OSM for nearby amenities
 */
async function findNearby(lat, lng, type) {
    const amenityMap = {
        "police": "police",
        "hospital": "hospital",
        "cafe": "cafe",
        "restaurant": "restaurant",
        "fuel": "fuel",
        "pharmacy": "pharmacy"
    };
    const amenity = amenityMap[type] || "hospital";
    const endpoints = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
    ];

    const query = `[out:json][timeout:25];(node["amenity"="${amenity}"](around:25000, ${lat}, ${lng});way["amenity"="${amenity}"](around:25000, ${lat}, ${lng});relation["amenity"="${amenity}"](around:25000, ${lat}, ${lng}););out center;`;

    for (const url of endpoints) {
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: `data=${encodeURIComponent(query)}`
            });
            
            const text = await response.text();
            if (text.startsWith("<?xml") || text.includes("<html")) {
                console.warn(`Overpass Mirror ${url} returned XML/HTML instead of JSON. Trying next...`);
                continue;
            }

            const data = JSON.parse(text);
            if (!data.elements || data.elements.length === 0) continue;
            
            // Map and calculate distance for each element
            const results = data.elements.map(el => {
                const tags = el.tags || {};
                const itemLat = el.lat || (el.center ? el.center.lat : null);
                const itemLng = el.lon || (el.center ? el.center.lon : null);
                
                if (!itemLat || !itemLng) return null;
                
                return {
                    name: tags.name || `Nearby ${type}`,
                    lat: itemLat,
                    lng: itemLng,
                    address: tags["addr:street"] || tags["addr:full"] || tags["addr:city"] || "Check map for details",
                    distance: getDistance(lat, lng, itemLat, itemLng)
                };
            }).filter(item => item !== null);

            // SORT BY DISTANCE (CLOSEST FIRST)
            results.sort((a, b) => a.distance - b.distance);
            
            return results.slice(0, 3);
            
        } catch (e) {
            console.error(`Overpass Mirror ${url} failed:`, e.message);
        }
    }
    
    return [];
}

module.exports = { identifyIntent, findNearby };
