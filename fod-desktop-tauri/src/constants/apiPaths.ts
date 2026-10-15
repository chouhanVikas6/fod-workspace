const RestPath={
   GETALLMISSION:'/api/mission',
   MISSIONWITHSTAT:'/api/mission/stat',
   LOADACTIVEMISSION:'/api/mission/load/active',
   LOADNEWMISSION:'/api/mission/load/new',
   EXPLOREMISSION:(id:number)=>'/api/mission/explore/'+id,
   UPDATEMISSION:(id:number)=>'/api/mission/update/'+id,
   GETMISSIONWITHID:(id:number)=>'/api/mission/'+id,
   LOADMISSIONWITHID:(id:number)=>'/api/mission/load/'+id,
   JOINMISSIONWITHID:(id:number)=>'/api/mission/join/'+id,
   RESTARTMISSIONWITHID:(id:number)=>'/api/mission/restart/'+id,
   HEALTH_DATA:'/api/health-data'
}
export default RestPath;