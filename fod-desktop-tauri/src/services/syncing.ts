import { apiToMain } from "@/utils/apiMain";
import { missionService } from "./mission";
import getPrismaInstance from "../helper/prismaClient";
import { PrismaClient } from "@prisma/client";
import { notEqual } from "assert";
import { timeStamp } from "console";
import { createFodBatch } from "./fod";
import { upsertGroupBatch } from "./fod-group";

class SyncProcess {
  private prisma: PrismaClient = getPrismaInstance();
  private syncInterval: number = 5000; // Default interval
  private onSync: () => Promise<void> = async () => { }; // Default no-op function
  private onError?: (error: Error) => void;
  private intervalId: NodeJS.Timeout | null = null;

  constructor() { }

  public async sync(command: string, id?: number) {
    try {
      switch (command) {
        case "missionList":
          await this.syncMissionList();
          break;

        case "mission":
          if (id === undefined) {
            throw new Error("ID is required for syncing a specific mission.");
          }
          // await this.syncMission(id);
          break;

        case "dirty":
          // await this.syncMissionDirty();
          break;

        case "last50Missions":
          if (id === undefined) {
            throw new Error("ID is required for syncing the last 50 missions.");
          }
          // await this.syncLast50Missions(id);
          break;

        default:
          throw new Error("Invalid command provided.");
      }
    } catch (err) {
      console.error(`Error during syncing process: ${err.message}`);
    }
  }

  private async syncMissionList() {
    try {
      const missionNumberList = await missionService.getSelfMissionNumberList();
      const newMissions = await apiToMain({
        method: "get",
        endpoint: "/api/mission/exclude",
        data: { missionList: missionNumberList.map(ele => ele.id) },
      });
   
      if(newMissions.activeMission){
        let currentActive=await this.prisma.mission.findFirst({where:{status:'ACTIVE'}});
        if(!!currentActive && currentActive.id!=newMissions.activeMission.id){
          await this.prisma.mission.update({
            where:{id:currentActive.id},
            data:{status:"INACTIVE"}
          })
        }
        await this.prisma.mission.upsert({
          where:{
            id:newMissions.activeMission.id
          },
          create:{
            id:newMissions.activeMission.id,
            createdAt:newMissions.activeMission.createdAt,
          },
          update:{status:newMissions.activeMission.status}
        });
      }else{
        let currentActive=await this.prisma.mission.findFirst({where:{status:'ACTIVE'}});
        if(!!currentActive){
          await this.prisma.mission.update({
            where:{id:currentActive.id},
            data:{status:"INACTIVE"}
          })
        }
      }
      
      console.log({newMissions:newMissions.missionList,size:newMissions.missionList.length})

      newMissions.missionList.forEach(async (mission)=>{
        let b=await  this.prisma.mission.upsert({
          where:{
            id:mission.id
          },
          create:{
            ...mission
          },
          update:{
            
          }
        })
        console.log({b})
      })
      if(newMissions?.MissionList?.length){
        
        
        let createResult=await this.prisma.mission.createMany({
          data: newMissions.missionList,
        });
        console.log({createResult})
      }
      
    } catch (err) {
      console.error(`Error syncing mission list: skipDuplicates: true,`);
    }
  }

  private async syncMission(id: number) {
    try {
      
      //all data for a mission
      let retriveMission=await apiToMain({
        maxBodyLength: Infinity,
        method:"GET",
        endpoint:`/mission/retrive-mission/${id}`,
        timeout:40000
      })
      console.log("syncing  started",retriveMission.length)
      //first request for all group data

      //one is to get all group
      // let groupExist=await this.prisma.fodGroup.findMany({
      //   where:{
      //     missionId:id
      //   }
      // });
      // let existingGroupIds=groupExist.map(g=>g.groupId);

      //ask backend for remaining group and their respective fod 
      // let data=await apiToMain({
      //   method:"POST",
      //   endpoint:"mission/excluded-group",
      //   data:{
      //     missionId:id,
      //     groupIds:existingGroupIds
      //   }
      // })

      

      if(retriveMission.length){
        retriveMission = retriveMission.map((fod) => {
          console.log("Size",fod.size , " group",fod.groupId)
          let base64 = Buffer.from(fod.frame).toString();
         
          if(!base64.startsWith('/9j/4AA')){
              base64=Buffer.from(fod.frame).toString('base64')
          }
          fod.frame=base64;
          return fod;
        });

        let BATCH_SIZE=10;
        for (let i = 0; i < retriveMission.length; i += BATCH_SIZE) {
          const batch = retriveMission.slice(i, i + BATCH_SIZE);
          await upsertGroupBatch(batch,id); // Process each batch concurrently
        }

        // await Promise.all(
        //   retriveMission.map(fod =>
        //     this.prisma.fodGroup.upsert({
        //       where: {
        //         groupId_missionId: {
        //           groupId: fod.groupId,
        //           missionId: id,
        //         },
        //       },
        //       create: {
        //         groupId: fod.groupId,
        //         missionId: id,
        //         status: fod.status,
        //       },
        //       update: {
        //         status: fod.groupStatus,
        //       },
        //     })
        //   )
        // );

        for (let i = 0; i < retriveMission.length; i += BATCH_SIZE) {
          const batch = retriveMission.slice(i, i + BATCH_SIZE);
          await createFodBatch(batch,id); // Process each batch concurrently
        }

      //   await Promise.all(
      //   retriveMission.map(fod =>
      //     this.prisma.fod.upsert({
      //       where: {
      //         id: fod.id,
      //       },
      //       create: {
      //         id: fod.id,
      //         frame: Buffer.from(fod.frame.data),
      //         sysid: fod.sysid,  // Optional, can be omitted if not present
      //         location: JSON.stringify(fod.location),
      //         confidence: fod.confidence,
      //         timestamp: new Date(fod.timestamp),
      //         class: fod.class,  // Optional
      //         velocity: fod.velocity,
      //         size: fod.size,
      //         groupId: fod.groupId,
      //         missionId: id,
      //         dirty: false  // Optional, default is false
      //       },
      //       update: {},
      //     })
      //   )
      // )
      }

      //start process to get biggest fod for included group


      // Fetch and sync the mission details
      // const selfMissions = await this.prisma.fodGroup.findFirst({
      //   where: {
      //     missionId: id,
      //     dirty: false,
      //   },
      //   orderBy: {
      //     updatedAt: 'desc',  // Sort by `updatedAt` in descending order
      //   },
      // })
      // console.log({ selfMissions })
      // if(!selfMissions)return;

      // const fetchedData = await apiToMain({
      //   method: "get",
      //   endpoint: "/mission/sync-fod",
      //   data: {
      //     missionId: id,
      //     timestamp: !!selfMissions ? selfMissions?.updatedAt : new Date(0)
      //   },
      //   timeout: 5000
      // });
      // console.log({ fetchedData });
    

      // Upsert fodGroups
      // await Promise.all(
      //   fetchedData.fodGroups.map(fodGroup =>
      //     this.prisma.fodGroup.upsert({
      //       where: {
      //         groupId_missionId: {
      //           groupId: fodGroup.groupId,
      //           missionId: fodGroup.missionId,
      //         },
      //       },
      //       create: {
      //         groupId: fodGroup.groupId,
      //         missionId: fodGroup.missionId,
      //         status: fodGroup.status,
      //       },
      //       update: {
      //         status: fodGroup.status,
      //       },
      //     })
      //   )
      // );

      // Upsert fods
      // await Promise.all(
      //   fetchedData.fods.map(fod =>
      //     this.prisma.fod.upsert({
      //       where: {
      //         id: fod.id,
      //       },
      //       create: {
      //         id: fod.id,
      //         frame: Buffer.from(fod.frame.data),
      //         sysid: fod.sysid,  // Optional, can be omitted if not present
      //         location: JSON.stringify(fod.location),
      //         confidence: fod.confidence,
      //         timestamp: new Date(fod.timestamp),
      //         class: fod.class,  // Optional
      //         velocity: fod.velocity,
      //         size: fod.size,
      //         groupId: fod.groupId,
      //         missionId: fod.missionId,
      //         dirty: false  // Optional, default is false
      //       },
      //       update: {
      //         id: fod.id,
      //         frame: Buffer.from(fod.frame.data),
      //         sysid: fod.sysid,  // Optional, can be omitted if not present
      //         location: JSON.stringify(fod.location),
      //         confidence: fod.confidence,
      //         timestamp: new Date(fod.timestamp),
      //         class: fod.class,  // Optional
      //         velocity: fod.velocity,
      //         size: fod.size,
      //         groupId: fod.groupId,
      //         missionId: fod.missionId,
      //         dirty: false  // Optional, default is false
      //       },
      //     })
      //   )
      // );


      // const mission = await apiToMain({
      //   method: "get",
      //   endpoint: `/mission/${id}`,
      // });

      // if (mission) {
      //   await this.prisma.mission.upsert({
      //     where: { id: mission.id },
      //     update: mission,
      //     create: mission,
      //   });
      // }

      // // Sync FOD related to the mission
      // await this.syncFod(id);

      // // Sync FOD group related to the mission
      // await this.syncFodGroup(id);
    } catch (err) {
      console.error(`Error syncing mission: ${err}`);
    }
  }

  private async syncMissionDirty() {
    try {
      let dirtyRows = await this.prisma.fodGroup.findMany({
        where: {
          dirty: true
        }
      });
      if (!!dirtyRows.length) {
        dirtyRows.map((row) => {
          return {
            missionId: row.missionId,
            groupId: row.groupId,
            updatedAt: row.updatedAt,
            status: row.status
          }
        })
        let resolved = await apiToMain({
          method: "post",
          endpoint: "/mission/resolve-conflict",
          data: dirtyRows,
          timeout: 5000
        })
        resolved?.forEach(async (group) => {
          await this.prisma.fodGroup.update({
            where: {
              groupId_missionId: {
                missionId: group.missionId,
                groupId: group.groupId
              }
            },
            data: {
              status: group.status
            }
          })
        })
      };
    } catch (err) {
      console.error(`Error syncing mission dirty fields: ${err}`);
    }
  }

  private async syncFod(missionId: number) {
    try {
      const fods = await apiToMain({
        method: "get",
        endpoint: `/fod/byMission/${missionId}`,
        timeout: 10000
      });

      if (fods && fods.length > 0) {
        for (const fod of fods) {
          await this.prisma.fod.upsert({
            where: {
              missionId,
              groupId: fod.groupId,
              size: fod.size,
              id: "zzz"
            },
            create: fod,
            update: fod
          });
        }
      }
    } catch (err) {
      console.error(`Error syncing FOD: ${err.message}`);
    }
  }

  private async syncFodGroup(missionId: number) {
    try {
      const fodGroups = await apiToMain({
        method: "get",
        endpoint: `/fodGroup/byMission/${missionId}`,
        timeout: 10000
      });

      if (fodGroups && fodGroups.length > 0) {
        await this.prisma.fodGroup.createMany({
          data: fodGroups,
          skipDuplicates: true, // Prevents duplicate entries
        });
      }
    } catch (err) {
      console.error(`Error syncing FOD Group: ${err.message}`);
    }
  }

  private async syncLast50Missions(id: number) {
    // Implement logic to sync the last 50 missions
    console.log(`Syncing the last 50 missions for ID: ${id}`);
  }
}

export const syncService = new SyncProcess();
