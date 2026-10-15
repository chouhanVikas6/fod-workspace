import { RootState } from "@/store";
import { close_webcam } from "@/store/slices/webCam-slice";
import React from "react";
import { addImageToSideBarImgs,setSelectedImgList,setFodFinalReview,deleteWebCamImg } from "@/store/actions/WebCam";
import { MdOutlineKeyboardArrowLeft, MdOutlineKeyboardArrowRight } from "react-icons/md";
import { RxCross1 } from "react-icons/rx";
import { useDispatch, useSelector } from "react-redux";
import Slider from "react-slick";
import {LazyLoadTypes} from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { base64decodedFrame } from "@/utils/DecodeFrames";

const SideBarImgs = () => {
  const {  beforeClear, afterClear, selectedList } = useSelector((state:RootState) => state.WebCam);
  console.log("aaaaaaaaaaaaaaaa",selectedList)
  const dispatch = useDispatch();

  const settings = {
    infinite: false,
    speed: 1000,
    slidesToShow: 1,
    slidesToScroll: 1,
    lazyLoad: 'ondemand' as LazyLoadTypes,
    arrows: false, // Set arrows to false to hide them
    dots: false,
  };

  return (
    <div className="h-full w-1/4 bg-[#EBEBEB] p-[60px] [15px]">
      <div className="flex gap-[40px]">
        <button className="flex justify-center items-center text-[#696972] text-[18px] font-normal"
         onClick={() => dispatch(close_webcam())}
         >
          <MdOutlineKeyboardArrowLeft className="text-[22px]"/>
          <span>Back</span>
        </button>
        <button className="flex justify-center items-center text-[#696972] text-[18px] font-normal" 
        onClick={() => dispatch(setFodFinalReview(true) as any)}
        >
          <span>Next</span>
          <MdOutlineKeyboardArrowRight className="text-[22px]"/>
        </button>
      </div>

      <div 
      onClick={() => dispatch(setSelectedImgList(true) as any)} 
      className="mt-[15px] w-full">
        <div className="text-[#404048] font-semibold text-[18px] mb-[6px]">Before clearing</div>
        <Slider {...settings} className={`relative w-full h-[210px] bg-[#D9D9D9] border-3 overflow-hidden rounded-[8px] border-[2px] ${selectedList ? 'border-[#00B829]' : ''}`}>
          {beforeClear?.map((item, index) => (
            <div key={index} className="relative h-full">
             <img src={item as any} alt="image" draggable="false" className="w-full h-full" width="auto" height="auto" />

              <button className="absolute top-[10px] right-[10px] text-[#ffffff] text-[20px] cursor-pointer" onClick={() => dispatch(deleteWebCamImg(index, true) as any)}>
                <RxCross1/>
              </button>
            </div>
          ))}
        </Slider>
      </div>

      <div 
      onClick={() => dispatch(setSelectedImgList(false) as any)} 
      className="mt-[15px] w-full">
        <div className="text-[#404048] font-semibold text-[18px] mb-[6px]">After clearing</div>
        <Slider {...settings} className={`relative w-full h-[210px] bg-[#D9D9D9] border-3 overflow-hidden rounded-[8px] border-[2px] ${!selectedList ? 'border-[#00B829]' : ''}`}>
          {afterClear?.map((item, index) => (
            <div key={index} className="relative h-full">
             <img src={item as any} alt="image" draggable="false" className="w-full h-full" width="auto" height="auto" />

              <button className="absolute top-[10px] right-[10px] text-[#ffffff] text-[20px] cursor-pointer" onClick={() => dispatch(deleteWebCamImg(index, false) as any)}>
                <RxCross1/>
              </button>
            </div>
          ))}
        </Slider>
      </div>
    </div>
  );
};

export default SideBarImgs;
