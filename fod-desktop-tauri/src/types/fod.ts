export type fod={
    id?: string;
    frame?: Buffer;
    sysid?: string;
    location?: {
        lat?: number;
        lon?: number;
        sd?: number;
    };
    confidence?: number;
    timestamp?: Date;
    class?: string;
    velocity?: number;
    size?: number;
    groupId?:number;
    missionId?:number;
    status?:number;
}