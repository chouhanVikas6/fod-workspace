export const findFodInQueues = (fod, FodReducer) => {

    if (
        typeof fod !== 'object' ||
        !fod.hasOwnProperty('FodId') ||
        typeof fod.FodId !== 'number' ||
        !isFinite(fod.FodId)
    ) {
        return;
    }

    if ( typeof(FodReducer)!=='object' ||
        !Array.isArray(FodReducer.alertQueue) ||
        !Array.isArray(FodReducer.clearenceQueue) ||
        !Array.isArray(FodReducer.rejectedQueue) ||
        !Array.isArray(FodReducer.clearedQueue)
    ) {
        return;
    }

    // Check if fodId is present in alertQueue
    if (FodReducer.alertQueue.length > 0) {
        const alertItem = FodReducer.alertQueue.find(item => item.FodId === fod.FodId);
        if (alertItem) {
            return alertItem;
        }
    }

    // Check if FodId is present in clearenceQueue
    if (FodReducer.clearenceQueue.length > 0) {
        const clearenceItem = FodReducer.clearenceQueue.find(item => item.FodId === fod.FodId);
        if (clearenceItem) {
            return clearenceItem;
        }
    }

    // Check if FodId is present in rejectedQueue
    if (FodReducer.rejectedQueue.length > 0) {
        const rejectedItem = FodReducer.rejectedQueue.find(item => item.FodId === fod.FodId);
        if (rejectedItem) {
            return rejectedItem;
        }
    }

    // Check if FodId is present in clearedQueue
    if (FodReducer.clearedQueue.length > 0) {
        const clearedItem = FodReducer.clearedQueue.find(item => item.FodId === fod.FodId);
        if (clearedItem) {
            return clearedItem;
        }
    }

    return null; // Return null if not found in any queue
};


export const segregateFods = (decodedPayload,FodReducer) => {
  
    const modifiedPayload={'newFod':[]};
    decodedPayload.forEach(fod => {
         let listName = null;
         let index = null;
       
         // Check if fodId is present in alertQueue
         const alertIndex = FodReducer.alertQueue.findIndex(item => item.FodId === fod.FodId);
         if (alertIndex !== -1) {
           listName = 'alertQueue';
           index = alertIndex;
         } else {
           // Check if FodId is present in clearenceQueue
           const clearenceIndex = FodReducer.clearenceQueue.findIndex(item => item.id === fod.FodId);
           if (clearenceIndex !== -1) {
             listName = 'clearenceQueue';
             index = clearenceIndex;
           } else {
             // Check if FodId is present in rejectedQueue
             const rejectedIndex = FodReducer.rejectedQueue.findIndex(item => item.id === fod.FodId);
             if (rejectedIndex !== -1) {
               listName = 'rejectedQueue';
               index = rejectedIndex;
             } else {
               // Check if FodId is present in clearedQueue
               const clearedIndex = FodReducer.clearedQueue.findIndex(item => item.id === fod.FodId);
               if (clearedIndex !== -1) {
                 listName = 'clearedQueue';
                 index = clearedIndex;
               }
             }
           }
         }
          
         if(listName){
             // if fod present in any list then it means max Riskfactor frame of fod is received 
             //then add it in the modified payload correspond to its list name 
             // this help to update max riskFactoer frame 
             if(!modifiedPayload.hasOwnProperty(listName)){
                 modifiedPayload[listName] = [];
             }
             modifiedPayload[listName].push({index,fod});
         } 
         else{
             // if fod Not present in any list and in newFod List 
             modifiedPayload['newFod'].push(fod);
         }
 
     });
     return modifiedPayload
   };