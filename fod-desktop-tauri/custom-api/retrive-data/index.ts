import getPrismaInstance from "../../src/helper/prismaClient";
import { Request, Response, NextFunction } from "express";

export default async function retrieveData(req: Request, res: Response, next: NextFunction) {

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const prisma = getPrismaInstance();
    const missionId = parseInt(req.query.id as string);
    let lastUpdatedAt = new Date(0).toISOString(); // Use ISO string to preserve precision
    let sentGroupIds = new Set<number>(); // Track already sent group IDs for the current timestamp
    let lastProcessedTimestamp = ''; // Track the last processed timestamp

    let lastActivityTimestamp = Date.now();
    const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    let dataHasBeenSent = false; // Track if initial data was sent

    let pollInterval: NodeJS.Timeout;

    const sendData = async () => {
        try {
            console.log(`[SSE] Executing SQL query with missionId=${missionId} and lastUpdatedAt=${lastUpdatedAt}`);
            
            const data:any = await prisma.$queryRaw`
            SELECT 
            "f"."id",
            "f"."size",
            "f"."groupId",
            "f"."timestamp",
            "f"."location",
            "f"."class",
            "f"."velocity",
            "f"."sysid",
            "f"."size" AS "biggestSize",
            "fg"."updatedAt" AT TIME ZONE 'UTC' AS "updatedAt",
            fg."status" AS "groupStatus",
            fg."groupId" AS "idssssss"
            FROM "FodGroup" fg
            LEFT JOIN "Fod" f ON fg."biggestFodId" = f."id"
            WHERE fg."missionId" = ${missionId} 
            AND (fg."updatedAt" AT TIME ZONE 'UTC') > ${lastUpdatedAt}::timestamptz
            ORDER BY fg."updatedAt" ASC, fg."groupId" ASC;
        `;

        let updatedAtForLocal = await prisma.$queryRaw`
    SELECT (fg."updatedAt" AT TIME ZONE 'UTC') AS "updatedAt"
    FROM "FodGroup" fg
    ORDER BY fg."updatedAt" DESC, fg."groupId" DESC
    LIMIT 1;
`;

console.log(updatedAtForLocal)
            
            console.log(`[SSE] Query returned ${data.length} rows`);
            
            if (data.length > 0) {
                lastActivityTimestamp = Date.now();
                dataHasBeenSent = true;
                
                // Convert timestamps to ISO strings for consistency
                const processedData = data.map((record: any) => ({
                    ...record,
                    updatedAt: record.updatedAt ? new Date(record.updatedAt).toISOString() : null
                }));
                
                // Filter out records that we've already sent for the same timestamp
                let filteredData = processedData.filter((record: any) => {
                    if (record.updatedAt === lastProcessedTimestamp && sentGroupIds.has(record.idssssss)) {
                        return false; // Skip already sent records
                    }
                    return true;
                });
                
                if (filteredData.length > 0) {
                    let dummyData = filteredData.filter((fod:any)=>fod.id == null);
                    console.log("[SSE] dummyData count:", dummyData.length);
                    if (dummyData.length > 0) {
                        console.log("[SSE] dummyData sample:", dummyData.slice(0, 2));
                    }
                    
                    const maxUpdatedAt: any = filteredData[filteredData.length - 1].updatedAt;
                    console.log(`[SSE] maxUpdatedAt from data:`, maxUpdatedAt);
                    
                    // If the timestamp changes, reset the sent group IDs set
                    if (maxUpdatedAt && maxUpdatedAt !== lastProcessedTimestamp) {
                        lastProcessedTimestamp = maxUpdatedAt;
                        lastUpdatedAt = maxUpdatedAt; // Now this will be in ISO format
                        sentGroupIds.clear();
                        console.log(`[SSE] Updated lastUpdatedAt and cleared sentGroupIds:`, lastUpdatedAt);
                    }
                    
                    // Add current batch group IDs to sent set
                    filteredData.forEach((record: any) => {
                        if (record.idssssss && record.updatedAt === lastProcessedTimestamp) {
                            sentGroupIds.add(record.idssssss);
                        }
                    });
                    
                    res.write(`event: update\ndata: ${JSON.stringify(filteredData)}\n\n`);
                } else {
                    console.log('[SSE] All records were already sent, skipping...');
                }
            } else {
                if (dataHasBeenSent && Date.now() - lastActivityTimestamp > INACTIVITY_TIMEOUT_MS) {
                    console.log('[SSE] Inactivity timeout reached, stopping polling.');
                    clearInterval(pollInterval);
                }
            }
        } catch (error) {
            console.error('SSE Error:', error);
            res.write(`event: error\ndata: ${JSON.stringify({ error: 'Failed to fetch data' })}\n\n`);
            console.log('[SSE] Sent error event');
        }
    };

    // Send initial data
    await sendData();
    
    // Polling mechanism to fetch updates
    pollInterval = setInterval(sendData, 500);
    
    // Heartbeat to keep connection alive
    console.log('[SSE] Starting heartbeat interval (30s)');
    const heartbeat = setInterval(() => {
        res.write(':heartbeat\n\n');
        console.log('[SSE] Heartbeat sent');
    }, 30000);
    
    req.on('close', () => {
        console.log('[SSE] Client connection closed. Cleaning up intervals and ending response.');
        // clearInterval(pollInterval);
        clearInterval(heartbeat);
        res.end();
        console.log('--- [SSE] Handler Exit ---');
    });
}
