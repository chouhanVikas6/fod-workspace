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
    <div className="absolute inset-0 h-full w-full z-50 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm p-6 flex justify-center items-center font-sans">
      <div
        ref={fodReviewRef}
        onClick={handleButtonClick}
        className="h-full w-full rounded-xl bg-white dark:bg-[#1C2129] border border-slate-200 dark:border-[#383D44] shadow-2xl flex justify-between items-stretch overflow-hidden p-5 gap-5"
      >
        <div className="h-full flex-1 min-w-0 rounded-lg bg-slate-100 dark:bg-[#22262B] border border-slate-200 dark:border-[#2B3542] flex flex-col justify-between gap-4 p-4">
          <div className="flex-1 min-h-0 flex flex-col w-full">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
              Before Clearing
            </div>
            <ReviewPanelImgs isBeforeClear={true} />
          </div>

          <div className="flex-1 min-h-0 flex flex-col w-full">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
              After Clearing
            </div>
            <ReviewPanelImgs isBeforeClear={false} />
          </div>
        </div>
        <div className="h-full w-px bg-slate-200 dark:bg-[#2B3542]" />
        <div className="w-[320px] shrink-0 h-full">
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

  if (ImgList.length === 0) {
    return (
      <div className="w-full flex-1 rounded-lg border border-dashed border-slate-300 dark:border-[#383D44] flex items-center justify-center text-xs text-slate-400 dark:text-slate-500">
        No photos captured
      </div>
    );
  }

  return (
    <div className="w-full flex-1 flex items-center gap-2 overflow-x-auto">
      {ImgList.map((imgSrc, index) => (
        <div key={index} className="flex-shrink-0 h-full max-w-[45%] aspect-video relative rounded-lg overflow-hidden border border-slate-200 dark:border-[#383D44] bg-black/10">
          <img src={imgSrc as any} className="w-full h-full object-cover block" alt={""} />
          <button
            type="button"
            className="absolute top-1.5 right-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 cursor-pointer transition-colors"
            onClick={() => dispatch(deleteWebCamImg(index, isBeforeClear) as any)}
          >
            <RxCross1 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
