import { apiToMain } from "../utils/apiMain";
import getPrismaInstance from "../helper/prismaClient";
import { createFodBatch } from "../services/fod";

export default async function primarySchedular() {
  resolveFodGroup();
  syncMission();
}

async function callAgain(fn, timeout) {
  setTimeout(() => {
    fn();
  }, timeout);
}

async function resolveFodGroup() {
  try {
    const prisma = getPrismaInstance();
    let dirtyRows: any = await prisma.fodGroup?.findMany({
      where: {
        dirty: true,
      },
    });

    if (!dirtyRows || dirtyRows.length == 0) {
      callAgain(resolveFodGroup, 1000);
      return;
    }

    let undoRow = await dirtyRows.filter((row) => row.status == "NEW");
    if (undoRow && undoRow.length > 0) {
      undoRow?.forEach((row) => {
        apiToMain({
          method: "POST",
          endpoint: `/api/fod-group/update/${row.groupId}`,
          data: {
            missionId: row.missionId,
            groupId: row.groupId,
            status: "NEW",
          },
        }).then((res) => {
          if (res?.status == 200) {
            prisma.fodGroup
              .update({
                where: {
                  groupId_missionId: {
                    groupId: row.groupId,
                    missionId: row.missionId,
                  },
                },
                data: {
                  dirty: false,
                },
              })
              .then((res) => {
                console.log("updated undo row to dirty false");
              });
          }
        });
      });
    }

    dirtyRows = await dirtyRows.filter((row) => row.status != "NEW");
    dirtyRows = await Promise.all(
      dirtyRows.map(async (fodGroup: any) => {
        let clearedFod: any = null;
        if (fodGroup.status === "CLEARED") {
          clearedFod = await prisma.clearedFod.findFirst({
            where: {
              missionId: fodGroup.missionId,
              groupId: fodGroup.groupId,
            },
          });
        }
        return {
          groupId: fodGroup.groupId,
          missionId: fodGroup.missionId,
          status: fodGroup.status,
          updatedAt: fodGroup.updatedAt,
          dirty: fodGroup.dirty,
          biggestFod: fodGroup.biggestFod,
          biggestFodSize: fodGroup.biggestFodSize,
          clearedFod,
        };
      })
    );
    let resolvedData = await apiToMain({
      method: "POST",
      endpoint: `/api/fod-group/resolve`,
      data: dirtyRows,
    });
    console.log("resolved data", resolvedData);
    resolvedData?.forEach((data: any) => {
      if (data?.status == "CLEARED") {
        prisma.clearedFod.upsert({
          where: {
            groupId_missionId: {
              groupId: data.groupId,
              missionId: data.missionId,
            },
          },
          create: data.clearedFod,
          update: {},
        });
      }
    });
    if (resolvedData?.length > 0) {
      await Promise.allSettled(
        resolvedData?.map((data: any) => {
          return prisma.fodGroup.update({
            where: {
              groupId_missionId: {
                groupId: data.groupId,
                missionId: data.missionId,
              },
            },
            data: {
              status: data.status,
              dirty: false,
            },
          });
        })
      );
    }
    callAgain(resolveFodGroup, 1000);
  } catch (e) {
    console.log("error in primary schedular", e);
    callAgain(resolveFodGroup, 1000);
  }
}

async function syncMission() {
  const prisma = getPrismaInstance();
  const missionNumberList = await prisma.mission.findMany();
  const newMissions = await apiToMain({
    method: "get",
    endpoint: "/api/mission/exclude",
    data: { missionList: missionNumberList.map((ele) => ele.id) },
  });
  if (newMissions && newMissions.missionList.length > 0) {
    newMissions.missionList.map(async (mission: any) => {
      await prisma.mission.create({
        data: mission,
      });
    });
  }
  let mission = await prisma.mission.findFirst({
    orderBy: {
      createdAt: "desc",
    },
  });

  let missionId = mission?.id || 1;

  //sync Fod
  await syncFod(missionId);
  callAgain(syncMission, 1000);
}

async function syncFod(missionId: number) {
  //fetch existing fodList
  const prisma = getPrismaInstance();

  let existingFodList: any = await prisma.fodGroup?.findMany({
    where: {
      missionId,
    },
  });
  existingFodList = existingFodList.map((fodGroup: any) => {
    return {
      groupId: fodGroup.groupId,
      missionId: fodGroup.missionId,
      status: fodGroup.status,
      updatedAt: fodGroup.updatedAt,
      biggestFod: fodGroup.biggestFodId,
      biggestFodSize: fodGroup.biggestFodSize,
    };
  });

  let updatedGroups = await apiToMain({
    method: "POST",
    endpoint: "/api/fod-group/sync/groups",
    data: {
      missionId,
      fodList: existingFodList,
    },
  });

  if (updatedGroups?.fodGroups?.length > 0) {
    let groupIds = updatedGroups.fodGroups.map(
      (fodGroup: any) => fodGroup.groupId
    );
    let existingGroups = await prisma.fodGroup.findMany({
      select: {
        groupId: true,
        status: true,
      },
      where: {
        groupId: {
          in: groupIds,
        },
        missionId,
      },
    });
    let existingGroupMap = new Map(
      existingGroups.map((group: any) => [group.groupId, group])
    );
    updatedGroups.fodGroups.forEach(async (fodGroup: any) => {
      if (existingGroupMap.has(fodGroup.groupId)) {
        let existingGroup = existingGroupMap.get(fodGroup.groupId);
        if (existingGroup.status != fodGroup.status) {
          await prisma.fodGroup.update({
            where: {
              groupId_missionId: {
                groupId: fodGroup.groupId,
                missionId: fodGroup.missionId,
              },
            },
            data: {
              status: fodGroup.status,
              dirty: false,
            },
          });
        }
      } else {
        delete fodGroup.id;
        delete fodGroup.biggestFod;
        await prisma.fodGroup.create({
          data: { 
            groupId: fodGroup.groupId, 
            missionId: fodGroup.missionId, 
            dirty: false,
            status:fodGroup.status,
            createdAt:fodGroup.createdAt,
            updatedAt:fodGroup.updatedAt 
          },
        });
      }
      if (fodGroup.primaryPacket) {
        await createFodBatch([fodGroup.primaryPacket], missionId);
      }
      if (fodGroup.clearedFod) {
        await prisma.clearedFod.upsert({
          where: {
            groupId_missionId: {
              groupId: fodGroup.groupId,
              missionId: fodGroup.missionId,
            },
          },
          create: fodGroup.clearedFod,
          update: {},
        });
      }
    });
  }
}
