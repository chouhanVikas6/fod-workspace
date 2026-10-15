import getPrismaInstance from "../helper/prismaClient";
import { PrismaClient } from "@prisma/client";

async function createClearedFodBatch(clearedFodBatch: any, missionId: number) {
  let prisma: PrismaClient = getPrismaInstance();

  return Promise.all(
    clearedFodBatch.map(async (fod: any) => {
      try {
        // First, upsert ClearedFod
        const clearedFod = await prisma.clearedFod.upsert({
          where: { groupId_missionId: {
            groupId: fod.groupId,
            missionId,
          }},
          create: { ...fod, createdAt: new Date() },
          update: {},
        });

        // Only if upsert succeeds, update FodGroup
        if (clearedFod) {
          return prisma.fodGroup.update({
            where: {
              groupId_missionId: {
                groupId: fod.groupId,
                missionId,
              },
            },
            data: {
              dirty: true,
              status: "CLEARED",
            },
          });
        }
      } catch (err) {
        console.error("Error writing cleared fod:", err);
        throw err; // Ensure the error is propagated
      }
    })
  );
}
 

export { createClearedFodBatch};


