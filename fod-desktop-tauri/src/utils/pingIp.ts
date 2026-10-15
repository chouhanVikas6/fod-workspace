export default async function pingIP(ip: string) {
    try {
        // Attempt to reach the IP address, but due to `no-cors`, response details will be unavailable
        await fetch(`${ip}`, { method: 'HEAD', mode: 'no-cors' });
        // console.log(`Ping to ${ip} appears successful.`);
        return true; // Assume success if no error was thrown
    } catch (error) {
        // console.error(`Ping to ${ip} failed:`, error);
        return false;
    }
}
