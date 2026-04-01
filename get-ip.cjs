const os = require('os');

function getLocalIP() {
    try {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                // Node.js 18+ use family: 4 (number) or 'IPv4' (string)
                const isIPv4 = iface.family === 'IPv4' || iface.family === 4;
                if (isIPv4 && !iface.internal) {
                    return iface.address;
                }
            }
        }
    } catch (e) {
        console.error("Error detecting local IP:", e.message);
    }
    return '127.0.0.1'; // Fallback
}

if (require.main === module) {
    console.log(getLocalIP());
}

module.exports = getLocalIP;
