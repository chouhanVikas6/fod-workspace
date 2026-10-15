import { NextApiRequest, NextApiResponse } from 'next';
import getPrismaInstance from '@/helper/prismaClient';
import * as fs from 'fs';
import * as path from 'path';

const prisma = getPrismaInstance();

// Delete a mission everywhere locally: DB rows (fods, fod groups, cleared fods,
// mission) and its image folder. PDF: "Delete mission (Delete Database and
// Image Folder also)". Refuses to delete the currently ACTIVE mission.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE' && req.method !== 'GET') {
    res.setHeader('Allow', ['DELETE', 'GET']);
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
    if (mission.status === 'ACTIVE') {
      return res.status(409).json({ error: 'Cannot delete the active mission — terminate it first' });
    }

    const [fods, fodGroups, clearedFods] = await prisma.$transaction([
      prisma.fod.deleteMany({ where: { missionId } }),
      prisma.fodGroup.deleteMany({ where: { missionId } }),
      prisma.clearedFod.deleteMany({ where: { missionId } }),
      prisma.mission.delete({ where: { id: missionId } }),
    ]);
    // (4th op deletes the mission row itself; its result is not needed here.)

    // Remove the mission's image folder (fod-images/mission/<id>).
    let imagesRemoved = false;
    try {
      const imageDir = path.join(__dirname, '../../fod-images/mission', String(missionId));
      if (fs.existsSync(imageDir)) {
        fs.rmSync(imageDir, { recursive: true, force: true });
        imagesRemoved = true;
      }
    } catch (e) {
      console.error('Failed to remove image folder for mission', missionId, e);
    }

    return res.status(200).json({
      message: `Mission ${missionId} deleted`,
      deleted: { fods: fods.count, fodGroups: fodGroups.count, clearedFods: clearedFods.count },
      imagesRemoved,
    });
  } catch (error: any) {
    console.error('Mission delete failed:', error);
    return res.status(500).json({ error: 'Failed to delete mission', details: error.message });
  }
}
