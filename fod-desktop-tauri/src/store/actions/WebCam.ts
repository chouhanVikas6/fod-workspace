import { Dispatch } from "redux";
import { toast } from "react-toastify";
import { sendFodClearingInfo_ApiCall } from "../../ApiCalls/FodOperations";
import { validateSelfLocation } from "../../utils/MapUtils";
import { add_ToClearedFod } from "../slices/fodReducer-slice";
import { close_SideBarFodDetail, set_StatusOFFod } from "../slices/selectedFod-slice";
import { addAfterClearImg, addBeforeClearImg, clearWebCamData, deleteFromAfterClearImg, deleteFromBeforeClearImg, set_FodFinalReview, set_SelectedImgList } from "../slices/webCam-slice";

// Function to remove Base64 prefix and pack image data similar to cv2.imencode and msgpack.packb
export const addImageToSideBarImgs = (imageSrc) => (dispatch, getState) => {
  const { selectedList } = getState().WebCam;

  if (typeof imageSrc === 'string') {
    // Step 1: Remove the "data:image/jpeg;base64," part from imageSrc
    const base64String = imageSrc.replace(/^data:image\/\w+;base64,/, '');

    // Step 2: Decode the Base64 string to binary (this is similar to getting frame_bytes in Python)
    // const binaryData = Buffer.from(base64String, 'base64');

    // Step 3: Pack the binary image data into MessagePack format (equivalent to msgpack.packb in Python)
    // const packedData = msgpack.encode({ frame: binaryData });

    // Dispatch the appropriate action with the MessagePack packed data
    if (selectedList) {
      dispatch(addBeforeClearImg(imageSrc));  // Using packed data
    } else {
      dispatch(addAfterClearImg(imageSrc));  // Using packed data
    }
  }
};

export const setSelectedImgList =(selectedlist) =>(dispatch,getState)=>{
   
    const {selectedList} = getState().WebCam;
    if(typeof(selectedlist) === 'boolean' && selectedList !== selectedlist){

        dispatch(set_SelectedImgList(selectedlist))
    }
}

export const setFodFinalReview = (isOpen)=>(dispatch,getState)=>{
    if(typeof(isOpen) === 'boolean'){
        dispatch(set_FodFinalReview(isOpen))
    }
}

export const deleteWebCamImg = (index,isBeforeClear) =>(dispatch,getState)=>{
    if(typeof(index)!=='number' || typeof(isBeforeClear) !== 'boolean'){
        return
    }

    if(isBeforeClear){
        dispatch(deleteFromBeforeClearImg(index));
    }
    else{
        dispatch(deleteFromAfterClearImg(index));
    } 
}


// Helper function to map numeric status to a string representation.
// Codes come from the fodDetail buttons: setFodStatus(1)="FOD Found",
// setFodStatus(2)="False Found", setFodStatus(3)="Not Found".
const getFodStatusString = (status: number): string => {
  const statusMap: { [key: number]: string } = {
    1: 'found',
    2: 'false_positive',
    3: 'not_found',
  };
  return statusMap[status] ?? 'found'; // Default to 'found'
};

// Helper function to construct location object
const getLocation = (selfLocation: any) => {
  const defaultLocation = {
    lat: -1,
    lon: -1,
    sd: 0,
    heading: 0,
  };

  if (!selfLocation || !selfLocation.coord) return defaultLocation;

  return {
    lat: selfLocation.coord[1],
    lon: selfLocation.coord[0],
    sd: selfLocation.sd || 0,
    heading: selfLocation.heading || 0,
  };
};

// Main action
export const sendFodReport = (val: any) => async (dispatch: Dispatch, getState: any) => {
  try {
    const mission=getState().MissionState;
    // Destructure necessary values from state
    const { beforeClear, afterClear } = getState().WebCam;
    const { data } = getState().SystemHealth.RtkData;
    const { fod, FodStatus } = getState().SelectedFod;

    const { groupId } = fod;

    console.log(getState().selectedFod)
    console.log(fod)

    // Validate self location
    const selfLocation = validateSelfLocation(data);
    console.log(selfLocation);

    // Create location object using helper function
    const location = getLocation(selfLocation);

    // Construct the package with necessary data
    const Package = {
      status: getFodStatusString(FodStatus), // Map numeric FodStatus to string
      beforeClearImg: beforeClear || [],
      afterClearImg: afterClear || [],
      location, 
      groupId,
      missionId:mission.missionNumber
    };

    // Make API call — resolves true only on 2xx (the ApiCall toasts on failure)
    const response = await sendFodClearingInfo_ApiCall(Package);

    if (response) {
      // Dispatch actions in the correct order
      dispatch(add_ToClearedFod(groupId));
      dispatch(set_StatusOFFod(FodStatus)); // Assuming numeric status is still needed
      dispatch(clearWebCamData());
      dispatch(set_FodFinalReview(false));
      dispatch(close_SideBarFodDetail());
      toast.success('FOD report submitted');
    }
  } catch (error) {
    console.error('Error in sending FOD report:', error);
  }
};

