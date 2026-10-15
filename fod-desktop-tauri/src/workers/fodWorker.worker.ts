export interface FodItem {
  id: string;
  size: number;
  timeStamp: string;
  groupId: string;
  groupStatus: string;
  location?: {
    lat: number;
    lng: number;
  };
}

const data={
  type:"temp",
  deviceId:"abc",
  deviceType:"server",
  lowerLimit:2,
  upperLimit:4,
  data:{
    error:{
      message:"temp at its peak",
      minRange:4,
      maxRange:5
    },
    warning:{
      message:"temp is up",
      minRange:2,
      maxRange:3
    },
    info:{
      message:"temp is normal",
      minRange:0,
      maxRange:1
    }
  }
}


export interface Filters {
  size: {
    min?: number;
  };
  sortby: string;
}

export interface WorkerInput {
  fods: FodItem[];
  filters: Filters;
  doubleAccepted: Record<string, boolean>;
  currentLocation: { lat: number; lng: number } | null;
}

self.addEventListener("message", (event: MessageEvent<WorkerInput>) => {
  console.log("22222222222")
});
self.onmessage = function (e: MessageEvent<WorkerInput>) {

  console.log("Worker received message:", e.data);
  const { fods, filters, doubleAccepted, currentLocation } = e.data;
if(!fods || fods.length === 0)return [];
  const filtered = fods.filter((fod) => {
    const sizeInRange = fod.size >= (filters.size?.min || 0);
    return sizeInRange && !doubleAccepted[fod.groupId];
  });

  let sorted = [...filtered];

  switch (filters.sortby) {
    case "latest":
      sorted.sort((a, b) => new Date(b.timeStamp).getTime() - new Date(a.timeStamp).getTime());
      break;
    case "oldest":
      sorted.sort((a, b) => new Date(a.timeStamp).getTime() - new Date(b.timeStamp).getTime());
      break;
    case "biggestTosmallest":
      sorted.sort((a, b) => b.size - a.size);
      break;
    case "smallestTobiggest":
      sorted.sort((a, b) => a.size - b.size);
      break;
    case "nearestFirst":
      if (currentLocation) {
        const distance = (a: FodItem) => {
          const dx = (a.location?.lat ?? 0) - currentLocation.lat;
          const dy = (a.location?.lng ?? 0) - currentLocation.lng;
          return Math.sqrt(dx * dx + dy * dy);
        };
        sorted.sort((a, b) => distance(a) - distance(b));
      }
      break;
  }

  self.postMessage(sorted);
};

export default {} as typeof Worker & { new(): Worker };
