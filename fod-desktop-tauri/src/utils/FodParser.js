export const Fod_FodId =(fod)=>{
   
     if(typeof(fod)==='object' && fod.hasOwnProperty('groupId')){
          const {groupId:FodId} = fod;
          if(typeof(FodId)=== 'number'  && isFinite(FodId)){
            const  fodId = (String(FodId)).length>9 ? String(FodId).slice(0,9) : String(FodId);
              return "#" +fodId;
          }    
     }
     return '#';
}

export const Fod_Location = (fod) => {
    // console.log("I AM CALLED AAAAAAAAAAAAAAAAAAAA______________________________")
    if (!validateFodPoint(fod) || !(fod.FodPoint).hasOwnProperty('location') ) {
        return [-1, -1];
    }

    const { location } = fod.FodPoint;
    if (!location &&
       typeof(location) ==='object' &&
        isValidLatitude(location.lat) &&
        isValidLongitude(location.lon)
    ) {
        return [location.lon,location.lat];
    }
    return [-1, -1];
}

export const Fod_Riskfactor = (fod) => {
    if (!validateFodPoint(fod) || !(fod.FodPoint).hasOwnProperty('Riskfactor')) {
        return 0;
    }

    const { Riskfactor } = fod.FodPoint;
    if (typeof Riskfactor === 'number') {
        // Ensure Riskfactor is within the range 0 to 100
        return Math.min(Math.max(Riskfactor, 0), 100);
    }

    return 0;
}

export const Fod_Size = (fod) => {
    if (!(fod).hasOwnProperty('size')) {
        return "N/A";
    }

    const { size } = fod;
    if (typeof size === 'number') {
        // Ensure size is within the range 0 to 100
        if(size < 100){
             return Math.floor(size) + 'mm'
        }
        else{
            const sizeInCm = size/100;
            return   sizeInCm.toFixed(1) + "cm"
        }
    }

    return 'N/A';
}

export const Fod_Confidence = (fod) => {
    if (!validateFodPoint(fod) || !(fod.FodPoint).hasOwnProperty('confidence')) {
        return 0;
    }

    const { confidence } = fod.FodPoint;
    if (typeof confidence === 'number') {
        // Convert confidence from 0-1 range to 0-100 range
        let confidencePercentage = Math.round(confidence * 100);
        
        // Ensure confidencePercentage is bounded between 0 and 100
        confidencePercentage = Math.min(Math.max(confidencePercentage, 0), 100);

        return confidencePercentage+'%';
    }

    return 0;
}

export const Fod_Class = (fod) => {

    if (!validateFodPoint(fod) || !(fod.FodPoint).hasOwnProperty('class')) {
        return 'Unknown';
    }
   // class is a reserved keyword in JS o need to use bracket notation cannot destructure
   // also need to assign to something different from class
    const fod_Class = fod.FodPoint['class']; // Use bracket notation to access the 'class' property

    if (typeof(fod_Class) === 'string') {
        const fodClass =  fod_Class.length > 8 ? fod_Class.slice(0,8): fod_Class;
        return fodClass.slice(0,1).toUpperCase() + fodClass.slice(1);
    }

    return 'Unknown';
}

export const Fod_Class_DetailView = (fod) => {

    if (!validateFodPoint(fod) || !(fod.FodPoint).hasOwnProperty('class')) {
        return 'Unknown';
    }
   // class is a reserved keyword in JS o need to use bracket notation cannot destructure
   // also need to assign to something different from class
    const fod_Class = fod.FodPoint['class']; // Use bracket notation to access the 'class' property

    if (typeof(fod_Class) === 'string') {
        const fodClass =  fod_Class.length > 15 ? fod_Class.slice(0,15): fod_Class;
        return fodClass.slice(0,1).toUpperCase() + fodClass.slice(1);
    }

    return 'Unknown';
}

export const Fod_CamId=(fod)=>{
    if(!validateFodPoint(fod) || !(fod.FodPoint).hasOwnProperty('sysid')){
        return 'N/A';
    }

    const {sysid} = fod.FodPoint;
    if(typeof(sysid) === 'string'){
        const sys_id = sysid.length >7 ? sysid.slice(0,7) : sysid
        return sys_id;
    }

    return 'N/A';
}

export const Fod_Velocity=(fod)=>{
    // if(!validateFodPoint(fod)){
    //     return 'N/A';
    // }

    const {velocity } = fod;

    if(typeof(velocity) === 'number' && isFinite(velocity)){
        return (Math.round(velocity) + 'Km/h');
    }

    return 'N/A';
}

export const Fod_DetectionTime =(fod)=>{
    if(!validateFodPoint(fod)){
        return 'N/A';
    }

    const { timeStamp } = fod.FodPoint;

    if (!timeStamp || typeof timeStamp !== 'string') {
        return 'N/A';
    }
    const istDateTime = convertUTCtoIST(timeStamp);
    return `${istDateTime.date} ${istDateTime.time}`;
    
}

export const Fod_Status = (fod)=>{
    if(!validateCollectorResponse(fod)) return 'N/A';

    const {FodStatus} = fod.collectorResponse;

    if(typeof(FodStatus) === 'number' && FodStatus >=0 && FodStatus <=3){

        if(FodStatus===1){
            return 'Found';
        }
        else if(FodStatus===2){
            return 'False Found';
        }
        else{
            return 'Not Found'
        }
    }
     return 'N/A'
}



export const validatedFodPoints=(fod)=> {
    let result = [];
    if (typeof (fod) === 'object' && fod.hasOwnProperty('FodPoints')) {
        const { FodPoints } = fod;
        if (Array.isArray(FodPoints)) {
            result = FodPoints.filter(FodPoint => {
                return validateFrame(FodPoint);
            }).sort((a, b) => {
                const riskA = a.Riskfactor || 0;
                const riskB = b.Riskfactor || 0;
                return riskB - riskA;
            });
        }
    }
    return result;
}

const validateFodPoint = (fod) =>{
    if( typeof(fod)==='object' && fod.hasOwnProperty('FodPoint') ){
       
        const FodPoint = fod.FodPoint;
        if(FodPoint !== null && typeof FodPoint === 'object'){
            return true;
        } 
    }
    return false;
}



export const Fod_ClearenceTime =(fod)=>{
    if(!validateCollectorResponse(fod)){
        return 'N/A';
    }

    const { timeStamp } = fod.collectorResponse;

    if (!timeStamp || typeof timeStamp !== 'string') {
        return 'N/A';
    }
    const istDateTime = convertUTCtoIST(timeStamp);
    return `${istDateTime.date} ${istDateTime.time}`;
    
}

const validateCollectorResponse = (fod) =>{
    if( typeof(fod)==='object' && fod.hasOwnProperty('collectorResponse') ){
       
        const collectorResponse = fod.collectorResponse;
        if(collectorResponse !== null && typeof collectorResponse === 'object'){
            return true;
        } 
    }
    return false;
}



export const isValidLatitude=(latitude) =>{
    return typeof latitude === 'number' && latitude!==-1 && latitude >= -90 && latitude <= 90;
}

export const isValidLongitude=(longitude)=> {
    return typeof longitude === 'number' && longitude!==-1 && longitude >= -180 && longitude <= 180;
}

function convertUTCtoIST(utcTimestamp) {
    // Convert UTC to IST
    var istTimestamp = new Date(utcTimestamp);

    // Format IST timestamp
    var options = { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit', 
        hour12: false,
        timeZone: 'Asia/Kolkata'
    };

    // Extracting date and time from IST timestamp
    var istDateString = istTimestamp.toLocaleString('en-IN', options);
    var istDate = istDateString.split(',')[0].trim();
    var istTime = istDateString.split(',')[1].trim();

    return { date: istDate, time: istTime };
}



function validateFrame(FodPoint) {
    if (typeof (FodPoint) === 'object' && FodPoint.hasOwnProperty('frame')) {
        const { frame } = FodPoint;
        if (typeof (frame) === 'string') {
            return true;
        }
    }
    return false;
}

