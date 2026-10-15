import getPrismaInstance from "../helper/prismaClient";
import { Mission } from "@prisma/client";

class MissionService {
    private prismaClient = getPrismaInstance();
    getSelfMissionNumberList() {
        return this.prismaClient.mission.findMany({
            select: {
                id: true
            }
        })
    }

    getSelfMissionList() {
        return this.prismaClient.mission.findMany()
    }

    async upsertMissionData(mission:Mission) {
        console.log("upserting mission data",mission)
        let missionId=mission.id;
        if(!missionId){
            console.log("Mission not updated by hook cause missed missionId")
            return;
        }
        let result=await this.prismaClient.mission.upsert({
            where: {
                id: missionId
            },
            create: { ...mission },
            update: {
                status: mission.status,
                scanStatus: mission.scanStatus
            }
        })
        console.log("writing updates", result)
    }

    async activateMission(mission:Mission) {
        await this.prismaClient.$transaction([
            this.prismaClient.mission.updateMany({
                where: {
                    status: 'ACTIVE',
                },
                data: {
                    status: 'INACTIVE',
                    scanStatus: 'PAUSE'
                }
            }),
            this.prismaClient.mission.upsert({
                where: {
                    id: mission.id
                },
                create: { ...mission },
                update: {
                    status: mission.status,
                    scanStatus: mission.scanStatus
                }
            })
        ]);
    }
}

export const missionService = new MissionService();