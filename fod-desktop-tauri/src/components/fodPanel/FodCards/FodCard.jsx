import React, { useState, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RxCross1 } from "react-icons/rx";
import { HiOutlineCheck } from "react-icons/hi";
import MapMode from '@/assets/images/svg/MissionControl/MapMode.svg';
import {  Fod_Velocity, Fod_Size } from "../../../utils/FodParser";
import { set_Map_view } from '@/store/actions/MapOperations';
import { updateSelectedFod } from "@/store/actions/SelectedFod";
import BarLoader from '../../../utils/Helper/BarLoader.jsx'
import { config } from "@/config/clientConfig";
import Image from "next/image";
// import Skeleton from "@mui/material/Skeleton"; 
// import { base64decodedFrame } from "@/utils/DecodeFrames";
import { accept_Fod, doubleAccept, reject_Fod, undo_fod } from '../../../store/slices/fodReducer-slice';
import axiosClient from '@/utils/axios';
import { toast } from 'react-toastify';

const Fodcard = ({ fod, handleDetailViewRequest }) => {
  const dispatch = useDispatch();
  const [imgLoaded, setImgLoaded] = useState(false);
  const missionNumber = useSelector((store) => store.MissionState?.missionNumber);
  const { FodSize, distanceUpdatedTimeInterval } = config.FodCard;
  const [fade, setFade] = useState(false);
  const [imgModal,setImageModal] = useState(false);
  // const selfLocation = useSelector((state) => state.SystemHealth.RtkData.data);
  // const selfLocationRef = useRef(selfLocation);
 
    const getStyleBySize = (value) => {
    const { medium, large } = FodSize;
    if (value >= large) {
      return {
        alertStyle: "bg-[#C12A23]",
        borderStyle: "border-2 border-[#C12A23]",
        text: "High risk",
      };
    } else if (value >= medium) {
      return {
        alertStyle: "bg-[#ded74b]",
        borderStyle: "border-2 border-[#ded74b]",
        text: "Mid risk",
      };
    } else {
      return {
        alertStyle: "hidden",
        borderStyle: "",
        text: "",
      };
    }
  };

//fod.FodPoint
  const { frame } = fod;
  let base64String = frame;

  const { size } = fod;
  const style = getStyleBySize(size);

  const openMapAndSelectFod = () => {
    dispatch(set_Map_view);
    dispatch(updateSelectedFod(fod));
  };

  const acceptFod = async (fod)=>{
    try{
      if(fod.groupStatus=="ACCEPTED"){
        dispatch(doubleAccept(fod.groupId));
        return;
      }
    
      setImageModal(true)
      const {groupId:FodId} = fod;
      console.log(fod)
      const response = await axiosClient({
        method:"POST",
        url:"/api/fod-group/update/"+FodId,
        data:{
          status:"ACCEPTED",
          missionId:missionNumber
        }
      })
        
      if(response){
        setFade(true)
        setTimeout(()=>{
          dispatch(accept_Fod(FodId));
          setFade(false);
          setImageModal(false);
        },50)
       
      }
  
    }
    catch(e){
      console.error(e)
      setImageModal(false);
      toast.error(e?.data?.message || e?.data?.error || 'Failed to accept FOD');
    }


  }

  const rejectFod = async (fod) => {
    try{
      setImageModal(true)
      const {groupId:FodId} = fod;
      const response = await axiosClient({
        method:"POST",
        url:"/api/fod-group/update/"+FodId,
        data: {
          status:"REJECTED",
          missionId:missionNumber
        }
      })

      if(response){
        setFade(true)
        setTimeout(()=>{
          dispatch(reject_Fod(FodId))
          setFade(false);
          setImageModal(false);
        },50)
    }
   }
    catch(e){
      console.error(e);
      setImageModal(false);
      toast.error(e?.data?.message || e?.data?.error || 'Failed to reject FOD');
    }

  }

  // useEffect(() => {
  //   selfLocationRef.current = selfLocation;
  // }, [selfLocation]);



  return (
    <div id={fod.id} key={fod.id} className={`h-[210px] w-[180px] min-w-[180px] relative z-0 hover:z-20 text-[#E2E2E2] transition-transform duration-200 ease-out transform hover:scale-105 active:scale-100 ${fade ? "fade-out" : ""}`}>
     
      <div className={`absolute top-[-8px] right-[25px] h-[18px] w-[70px] rounded-[10px] z-10 flex justify-center items-center text-[14px] ${style.alertStyle}`}>{style.text}</div>
      <div className={`h-full w-full relative rounded-[10px] overflow-hidden text-white shadow-md hover:shadow-xl transition-shadow ${style.borderStyle}`}>
      {imgModal &&  <div className="absolute h-full w-full bg-[grey] opacity-[35%]  z-10 ">    <BarLoader /></div>  }
        <div className="relative h-[80%] w-full cursor-pointer group" onClick={() => handleDetailViewRequest(fod)}>
          <Image 
          src={`${config.ImagesBase}/${missionNumber}/${fod.groupId}/${fod.id}.jpg`}
          draggable={false} 
          alt="Fod Image" 
          className="h-full w-full object-cover object-center group-hover:brightness-105 transition-all" 
          width={100} 
          height={100} 
          loading="lazy"
          />
          <div className="absolute top-0 h-full w-full flex flex-col justify-between p-2.5 text-lg">
            <div className="flex justify-between items-start">
              <div className="flex flex-col gap-1 items-start">
                <div className="text-[22px] text-white font-bold bg-gray-600 px-2 rounded-full bg-opacity-30">{fod.groupId}</div>
                {fod.class && <div className="text-[12px] text-white font-semibold bg-black/40 px-2 py-0.5 rounded-full">{fod.class}</div>}
              </div>
              <div className='cursor-pointer' onClick={(e) => { e.stopPropagation(); openMapAndSelectFod(); }}>
                {/* Show this FOD directly on the map */}
                <Image src={MapMode} alt="Show on map" width={30} height={30} className="text-white"/>
              </div>
            </div>
            <div className="flex justify-between items-center text-[16px] whitespace-nowrap">
              <div>
                <p className="text-shadow text-sm">{Fod_Velocity(fod)}</p>
              </div>
              <div>
                <p className="text-shadow font-extrabold">{Fod_Size(fod)}</p>
              </div>
             {/* <Distance fod={fod}/> */}
            </div>
          </div>
        </div>
        <div className=" h-[20%] w-full flex justify-center items-center">
          <button
            disabled={imgModal}
            className="h-full w-[50%] flex justify-center items-center text-xl text-white bg-[#017ED7] hover:bg-[#016ec0] transition-colors cursor-pointer"
            onClick={() => acceptFod(fod)}
          >
            <HiOutlineCheck className="h-[90%] w-auto stroke-2" />
          </button>
          <button
            disabled={imgModal}
            className="h-full w-[50%] flex justify-center items-center text-xl text-white bg-[#C8CDD1] hover:bg-[#b0b6bb] transition-colors cursor-pointer"
            onClick={() => rejectFod(fod)}
          >
            <RxCross1 className="h-[60%] w-auto stroke-1" />
          </button>
        </div>
      </div>
    </div>
  );
}

// export default Fodcard;
export default React.memo(Fodcard, (prevProps, nextProps) => {
  return prevProps.fod.id === nextProps.fod.id && prevProps.fod.groupStatus === nextProps.fod.groupStatus;
});
