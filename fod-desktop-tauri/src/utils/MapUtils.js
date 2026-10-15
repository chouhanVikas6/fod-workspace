import * as turf from '@turf/turf';
import { isValidLatitude,isValidLongitude } from "./FodParser"

export const validateSelfLocation =(selfLocation)=>{
    if(typeof(selfLocation) !== 'object' || !selfLocation.hasOwnProperty('lat') || !selfLocation.hasOwnProperty('lon')){
          return null;
    }

    const {lat,lon,heading,sd} = selfLocation;
    
    if (
        isValidLatitude(lat) &&
        isValidLongitude(lon) &&
        typeof(heading)==='number'
    ) {
        return {'coord':[lon,lat],'heading':heading ,'sd': sd || 0 };
    }
    return null;
}

export const validateSelectedFodLocation =(fod)=>{

    // if(!fod || !fod.hasOwnProperty("FodPoint")){
    //     return null;
    // }

    // const FodPoint = fod.FodPoint;

    // if(!FodPoint || !FodPoint.hasOwnProperty("location")){
    //     return null;
    // }

    const location = fod.location;
 
    if(!location || typeof(location) !== 'object'  || !isValidLatitude(location.lat) || ! isValidLongitude(location.lon)){
        return null;
    }

    return [location.lon,location.lat];
    

}

export const validateFodLocation =(fod)=>{

    if(!fod || !fod.hasOwnProperty("FodPoint")){
        return null;
    }

    const FodPoint = fod.FodPoint;

    if(!FodPoint || !FodPoint.hasOwnProperty("location")){
        return null;
    }

    const location = FodPoint.location;
 
    if(!location || typeof(location) !== 'object'  || !isValidLatitude(location.lat) || ! isValidLongitude(location.lon)){
        return null;
    }

    return [location.lon,location.lat];
    

}


export const validateCarLocation =(carLocation)=>{
    if(typeof(carLocation) !== 'object' || !carLocation.hasOwnProperty('lat') || !carLocation.hasOwnProperty('lon')){
        return null;
  }

  const {lat,lon,heading} = carLocation;
  
  if (
      isValidLatitude(lat) &&
      isValidLongitude(lon) &&
      typeof(heading)==='number'
  ) {
      return {'coord':[lon,lat],'heading':heading};
  }
  return null;
}


export const distanceBwCollectorAndFod =(selectedFod,selfLocation) =>{
    const selectedFodLocation = validateSelectedFodLocation(selectedFod)
     
     const validatedSelfLocation = validateSelfLocation(selfLocation);
 
     if(!selectedFodLocation || !validatedSelfLocation){
       return ""
     }
     const point1 = turf.point(validatedSelfLocation.coord);
     const point2 = turf.point(selectedFodLocation);
     
     // Calculate distance in kilometers
     const options = { units: 'meters' };
     const distance = turf.distance(point1, point2, options);
     if(distance<1){
        const distInCm = distance*100;
       return distInCm.toFixed(1) + ' cm'
     }
      
     if(distance > 999){
       const distanceInKm = distance/1000;
       return  distanceInKm.toFixed(1) + " Km"
     }
 
     return distance.toFixed(1) + " m"
   }

   export const validateCollectorLocation = (fod)=>{
    const {collectorResponse} = fod;
    if(!collectorResponse || typeof(collectorResponse) !== 'object' || !collectorResponse.hasOwnProperty('location')) return null;

    const {location}= collectorResponse;

    if(!location || typeof(location) !== 'object') return null;

    const {lat,lon,heading} = location;

    if(isValidLatitude(lat) && isValidLongitude(lon)){
      return { "coord":[lon,lat], "heading":heading || 0} 
    }

    return null
}