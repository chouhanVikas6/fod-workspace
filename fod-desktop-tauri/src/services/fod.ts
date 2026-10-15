import { writeJpegFile } from "../utils/imageWriter/jpegWriter";
import getPrismaInstance from "../helper/prismaClient";
import { Fod, PrismaClient } from "@prisma/client";
import { updateFodGroup, upsertGroupData } from "./fod-group";
let mission: any = {};
let timeout: NodeJS.Timeout | null = null;
let fodQueue: any[] = [];
let map: Record<string, any> = {};
let queueSizeInBytes = 0;
let allFodTrack: Record<string, { count: number, size: number }> = {};




function setMission(payload: any) {
  console.log("starting mission", payload)
  mission = payload;
}

const resetFodQueue = () => {
  if (typeof timeout != 'undefined' && timeout != null) clearTimeout(timeout);
  fodQueue = [];
  map = {};
  queueSizeInBytes = 0;
  allFodTrack = {};
};

async function handleFodFromSocket(payload: any, flag: boolean = true) {
  return createFod(payload);
}


// Sync fodGroup data in batches
async function createFodBatch(fodBatch: any, missionId: number) {
  await Promise.all(
    fodBatch.map((fod: any) => {
      createFod(fod).catch(console.error)
    }
    )
  );
}


async function createFod(fod: any, flag: boolean = true) {
  try {
    let prisma: PrismaClient = getPrismaInstance();
    if (!fod || !fod.frame) {
      console.warn("Ignoring invalid/empty FOD payload", fod);
      return;
    }
    const { groupId, missionId, frame, id, timestamp, size, sysid, confidence, velocity, location } = fod;
    await writeJpegFile(Buffer.from(frame).toString('base64'), `/mission/${fod.missionId}/${fod.groupId}/${fod.id}.jpg`);
    let fodGroup = await prisma.fodGroup.findUnique({
      where: {
        groupId_missionId: {
          groupId,
          missionId
        }
      }
    });
    let status=fod.status || "NEW";
    if (!fodGroup) {
      let data: any = { groupId: groupId, missionId, createdAt: new Date(timestamp), biggestFodId: id, biggestFodSize: size,status }
      await upsertGroupData(data);
      fodGroup = data;
    } 
    const createdFod = await prisma.fod.upsert({
      where: {
        id: id
      },
      update: {
        missionId,
        groupId,
        sysid: sysid,
        confidence: confidence,
        class: fod.class,
        velocity: velocity,
        size: size,
        location,
        timestamp: new Date(timestamp)
      },
      create: {
        id: id,
        missionId,
        groupId,
        sysid: sysid,
        confidence: confidence,
        class: fod.class,
        velocity: velocity,
        size: size,
        location,
        timestamp: new Date(timestamp),
        createdAt: new Date(timestamp)
      }
    });
    if (createdFod && createdFod.id) {
      if (fodGroup.biggestFodSize==null || fodGroup.biggestFodSize < size) {
        let data: any = {
          groupId: groupId,
          missionId,
          biggestFodId: id,
          biggestFodSize: size,
          status
        }
        await updateFodGroup(data);
      }
    } 

  } catch (error) {
    console.error("Error in handleFodFromSocket:", error, {
      fod
    });
    if (JSON.stringify(error).includes('Too many database connections opened')) {
      console.log("Too many request")
      if (flag) handleFodFromSocket(fod, false)
    }
  }


}


export { handleFodFromSocket, resetFodQueue, setMission, createFodBatch, createFod };
