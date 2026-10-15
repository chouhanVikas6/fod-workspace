import { NextApiRequest, NextApiResponse } from 'next';
import getPrismaInstance from '@/helper/prismaClient';
import * as fs from 'fs';
import * as path from 'path';

const prisma = getPrismaInstance();

// Export a mission's local data (mission row + fod groups + fods + cleared fods)
// to a JSON backup file on disk. PDF: "Export mission to backup".
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const missionId = parseInt(req.query.id as string);
  if (!missionId) {
    return res.status(400).json({ error: 'Mission ID is missing or invalid' });
  }

  try {
    const mission = await prisma.mission.findUnique({ where: { id: missionId } });
    if (!mission) {
      return res.status(404).json({ error: `Mission ${missionId} not found locally` });
    }

    const [fodGroups, fods, clearedFods] = await Promise.all([
      prisma.fodGroup.findMany({ where: { missionId } }),
      prisma.fod.findMany({ where: { missionId } }),
      prisma.clearedFod.findMany({ where: { missionId } }),
    ]);

    const backup = {
      exportedAt: new Date().toISOString(),
      mission,
      fodGroups,
      fods,
      clearedFods,
    };

    // Match the fod-images base used by the internal image server (socket.ts).
    const exportsDir = path.join(__dirname, '../../fod-images/exports');
    fs.mkdirSync(exportsDir, { recursive: true });
    const fileName = `mission-${missionId}-${Date.now()}.json`;
    const filePath = path.join(exportsDir, fileName);
    // BigInt/Date are handled by JSON.stringify via toJSON on Date; ints are plain.
    fs.writeFileSync(filePath, JSON.stringify(backup, null, 2));

    return res.status(200).json({
      message: 'Mission exported',
      path: filePath,
      counts: { fodGroups: fodGroups.length, fods: fods.length, clearedFods: clearedFods.length },
    });
  } catch (error: any) {
    console.error('Mission export failed:', error);
    return res.status(500).json({ error: 'Failed to export mission', details: error.message });
  }
}
