import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { apiToMain } from '@/utils/apiMain';
import { setMission } from '@/services/fod';
import getPrismaInstance from '@/helper/prismaClient';
import { IsServerConnected } from '../../socket';
import { missionService } from '@/services/mission';
import ServerRestPath from '@/constants/serverApiPaths';


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'POST' || req.method === 'GET') {
        try {
            // Mission template parameters (PDF: speed 5-45 km/h, passes 1-3).
            // Optional for legacy GET callers; validated when present.
            const { speed, pass } = (req.body || {}) as { speed?: number, pass?: number };
            if (speed != null && (!Number.isInteger(speed) || speed < 5 || speed > 45)) {
                return res.status(400).json({ error: 'Mission speed must be an integer between 5 and 45 km/h' });
            }
            if (pass != null && (!Number.isInteger(pass) || pass < 1 || pass > 3)) {
                return res.status(400).json({ error: 'Number of passes must be between 1 and 3' });
            }
            let mission = await apiToMain({
                headers: req.headers,
                method: "POST",
                endpoint: ServerRestPath.START_MISSION,
                data: { speed, pass }
            });
            console.log("Mission:", mission);
            if (!mission || mission.statusCode !== 200 || !mission.data) {
                return res.status(409).json({ error: mission?.error?.message || mission?.message || 'Failed to start mission' });
            }
            await missionService.activateMission(mission.data);
            res.status(200).json(mission.data);
        } catch (error) {
            console.log(error)
            res.status(500).json({ error: 'Failed to retrieve mission' });
        }
    } else {
        res.setHeader('Allow', ['GET', 'POST']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
};
