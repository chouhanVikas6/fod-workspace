import React, { useRef, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RxCross1 } from "react-icons/rx";
import FodDetail from "../fodCategoryAndDetail/fodDetail";
import { deleteWebCamImg } from "@/store/actions/WebCam";
import { RootState } from "@/store";

const FodFinalReview = () => {
  const dispatch = useDispatch();
  const fodReviewRef = useRef(null);

  //adding event for closing modal
  useEffect(() => {
    function handleClickOutside(event) {
      if (fodReviewRef.current && !fodReviewRef.current.contains(event.target)) {
        // dispatch(removeDetailedViewFod());
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside); // Add touchstart event listener

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside); // Remove touchstart event listener
    };
  }, [dispatch, fodReviewRef]);

  function handleButtonClick(event) {
    // Prevent clicks on buttons from bubbling up to the document level
    event.stopPropagation();
  }

  return (
    <div className="absolute top-0 right-0 h-full w-full z-50 bg-[rgba(167,162,162,0.4)] backdrop-blur-[10px] p-8 flex justify-center items-center text-[#a3a3af] font-sans">
      <div ref={fodReviewRef} onClick={handleButtonClick} className="h-full w-full rounded-[10px] bg-[#FCFCFC] flex justify-around items-center overflow-hidden p-8">
        <div className="h-full w-[70%] rounded-[8px] bg-[#F5F5F5] flex flex-col justify-between p-4">
          <div className="h-[50%] w-full">
            <div className="text-[#a3a3af] mb-2">Before Clearing</div>
            <ReviewPanelImgs isBeforeClear={true} />
          </div>

          <div className="h-[50%] w-full">
            <div className="text-[#a3a3af] mb-2">After Clearing</div>
            <ReviewPanelImgs isBeforeClear={false} />
          </div>
        </div>
        <div className="h-full w-[1px] bg-[#CED0D5] mx-12"></div>
        <div className="w-[30%] h-full">
          <FodDetail />
        </div>
      </div>
    </div>
  );
};

export default FodFinalReview;

const ReviewPanelImgs = ({ isBeforeClear }) => {
  const dispatch = useDispatch();
  const { beforeClear, afterClear } = useSelector((state:RootState) => state.WebCam);
  const ImgList = isBeforeClear ? (beforeClear || []) : (afterClear || []);

  return (
    <div className="w-full flex overflow-x-auto">
      {ImgList.map((imgSrc, index) => (
        <div key={index} className="flex-shrink-0 w-[40%] mx-1 relative">
          <img src={imgSrc as any} className="w-full h-auto block" alt={""} />
          <button className="absolute top-1.5 right-1.5 text-white w-5 h-5 text-2xl cursor-pointer" onClick={() => dispatch(deleteWebCamImg(index, isBeforeClear) as any)}>
            <RxCross1 />
          </button>
        </div>
      ))}
    </div>
  );
};
