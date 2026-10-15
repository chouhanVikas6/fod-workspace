import getPrismaInstance from "../helper/prismaClient";
import { FodGroup } from "@prisma/client";

async function upsertGroupData(fodGroupUnFiltered:FodGroup) {
  let fodGroup:any={...fodGroupUnFiltered};
  if(!!fodGroup?.id){
    delete fodGroup.id
  }
    let prismaClient = getPrismaInstance();
    let result = await prismaClient.fodGroup.upsert({
        where: {
            groupId_missionId: {
                groupId: fodGroup.groupId,
                missionId: fodGroup.missionId
            }
        },
        create: { ...fodGroup },
        update: {
            status: fodGroup.status,
            dirty: false
        }
    })
}

async function updateFodGroup(fodGroupUnFiltered:FodGroup) {
    let fodGroup:any={...fodGroupUnFiltered};
    if(!!fodGroup?.id){
        delete fodGroup.id
    }
    let prismaClient = getPrismaInstance();
    return prismaClient.fodGroup.update({
        where: {
            groupId_missionId: {
                groupId: fodGroup.groupId,
                missionId: fodGroup.missionId
            }
        },
        data: { ...fodGroup }
    })
}

async function  upsertGroupBatch(fodGroupBatch:any,missionId:number){
    let prismaClient = getPrismaInstance();
    await Promise.all(
        fodGroupBatch.map((fodGroup:any) =>
          prismaClient.fodGroup.upsert({
            where: {
              groupId_missionId: {
                groupId: fodGroup.groupId,
                missionId,
              },
            },
            create: {
              missionId,
              // mission: { connect: { id: missionId } }, 
              groupId: fodGroup.groupId,
              status: fodGroup.groupStatus,
              biggestFodId: fodGroup.biggestFod,
              biggestFodSize: fodGroup.biggestFodSize,
              createdAt: fodGroup.createdAt,
            },
            update: {
              status: fodGroup.groupStatus,
            },
          })
        )
      );
  }


export {upsertGroupBatch,upsertGroupData,updateFodGroup}