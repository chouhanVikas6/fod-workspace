import React from "react";
import { RootState } from "@/store";
import { close_webcam } from "@/store/slices/webCam-slice";
import {
  setSelectedImgList,
  setFodFinalReview,
  deleteWebCamImg,
} from "@/store/actions/WebCam";
import {
  MdCameraAlt,
  MdOutlineKeyboardArrowLeft,
  MdOutlineKeyboardArrowRight,
} from "react-icons/md";
import { RxCross1 } from "react-icons/rx";
import { useDispatch, useSelector } from "react-redux";
import Slider, { LazyLoadTypes } from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

interface SideBarImgsProps {
  onCaptureSection?: (isBeforeClear: boolean) => void;
  hasCamera?: boolean;
}

const SideBarImgs: React.FC<SideBarImgsProps> = ({
  onCaptureSection,
  hasCamera = false,
}) => {
  const { beforeClear, afterClear, selectedList } = useSelector(
    (state: RootState) => state.WebCam
  );
  const dispatch = useDispatch();

  const sliderSettings = {
    infinite: false,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    lazyLoad: "ondemand" as LazyLoadTypes,
    arrows: false,
    dots: false,
  };

  const sections = [
    {
      key: "before",
      title: "Before clearing",
      isBefore: true,
      images: beforeClear || [],
      isSelected: selectedList === true,
    },
    {
      key: "after",
      title: "After clearing",
      isBefore: false,
      images: afterClear || [],
      isSelected: selectedList === false,
    },
  ];

  return (
    <aside className="w-[260px] sm:w-[300px] lg:w-[340px] xl:w-[360px] shrink-0 h-full bg-white dark:bg-[#181C23] border-l border-slate-200 dark:border-[#2B3542] flex flex-col justify-between p-3 sm:p-4 lg:p-5 gap-3 overflow-y-auto select-none transition-colors">
      {/* Top navigation */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-[#2B3542] shrink-0">
        <button
          type="button"
          onClick={() => dispatch(close_webcam())}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-700 dark:text-[#D9DDE2] hover:text-[#017ED7] dark:hover:text-[#38BDF8] transition-colors cursor-pointer group"
        >
          <span className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-[#202632] border border-slate-200 dark:border-[#2B3542] group-hover:border-[#017ED7]/40 flex items-center justify-center transition-colors">
            <MdOutlineKeyboardArrowLeft className="text-lg" />
          </span>
          <span>Back</span>
        </button>

        <span className="text-xs font-semibold tracking-wide text-slate-500 dark:text-[#A8B0BA]">
          FOD Capture
        </span>
      </div>

      {/* Before / After capture sections */}
      <div className="flex-1 min-h-0 flex flex-col justify-center lg:justify-start gap-3 sm:gap-4">
        {sections.map((section) => (
          <div key={section.key} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() =>
                  dispatch(setSelectedImgList(section.isBefore) as any)
                }
                className="flex items-center gap-2 text-left cursor-pointer"
              >
                <span
                  className={`w-2 h-2 rounded-full transition-colors ${
                    section.isSelected
                      ? "bg-[#017ED7]"
                      : "bg-slate-300 dark:bg-slate-600"
                  }`}
                />
                <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-[#D9DDE2]">
                  {section.title}
                </span>
              </button>

              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  section.isSelected
                    ? "bg-[#017ED7]/10 text-[#017ED7] dark:bg-[#017ED7]/20 dark:text-[#38BDF8]"
                    : "bg-slate-100 text-slate-500 dark:bg-[#202632] dark:text-[#A8B0BA]"
                }`}
              >
                {section.images.length}{" "}
                {section.images.length === 1 ? "photo" : "photos"}
              </span>
            </div>

            <div
              onClick={() =>
                dispatch(setSelectedImgList(section.isBefore) as any)
              }
              className={`relative w-full h-[120px] sm:h-[145px] lg:h-[175px] rounded-lg overflow-hidden bg-slate-100 dark:bg-[#202632] transition-all cursor-pointer ${
                section.isSelected
                  ? "border-2 border-[#017ED7] ring-2 ring-[#017ED7]/20"
                  : "border border-slate-200 dark:border-[#2B3542] hover:border-slate-300 dark:hover:border-[#383D44]"
              }`}
            >
              {section.images.length === 0 ? (
                <div className="h-full w-full flex flex-col items-center justify-center gap-1.5 text-slate-400 dark:text-slate-500 px-3 text-center">
                  <MdCameraAlt className="text-xl sm:text-2xl opacity-60" />
                  <span className="text-[11px] sm:text-xs font-medium">
                    No image captured
                  </span>
                </div>
              ) : (
                <Slider
                  {...sliderSettings}
                  className="h-full w-full [&_.slick-list]:h-full [&_.slick-track]:h-full [&_.slick-slide>div]:h-full"
                >
                  {section.images.map((item, index) => (
                    <div key={index} className="relative h-full w-full">
                      <img
                        src={item as any}
                        alt={`${section.title} ${index + 1}`}
                        draggable={false}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          dispatch(
                            deleteWebCamImg(index, section.isBefore) as any
                          );
                        }}
                        aria-label={`Remove ${section.title} image ${index + 1}`}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors cursor-pointer"
                      >
                        <RxCross1 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </Slider>
              )}
            </div>

            <button
              type="button"
              disabled={!hasCamera}
              onClick={() => onCaptureSection?.(section.isBefore)}
              title={
                hasCamera
                  ? `Capture ${section.title.toLowerCase()} photo`
                  : "Connect a camera to capture"
              }
              className={`w-full py-2 px-3 rounded-lg text-xs sm:text-sm font-medium flex items-center justify-center gap-2 border transition-colors ${
                hasCamera
                  ? section.isSelected
                    ? "bg-[#017ED7]/10 hover:bg-[#017ED7]/20 text-[#017ED7] dark:text-[#38BDF8] border-[#017ED7]/40 cursor-pointer"
                    : "bg-slate-50 dark:bg-[#202632] hover:bg-slate-100 dark:hover:bg-[#29313D] text-slate-700 dark:text-[#D9DDE2] border-slate-200 dark:border-[#2B3542] cursor-pointer"
                  : "bg-slate-100 dark:bg-[#202632] text-slate-400 dark:text-slate-500 border-slate-200 dark:border-[#2B3542] opacity-60 cursor-not-allowed"
              }`}
            >
              <MdCameraAlt className="text-base shrink-0" />
              <span>Capture Image</span>
            </button>
          </div>
        ))}
      </div>

      {/* Bottom primary Next button */}
      <div className="pt-1 shrink-0">
        <button
          type="button"
          onClick={() => dispatch(setFodFinalReview(true) as any)}
          className="w-full py-2.5 px-4 rounded-lg bg-[#017ED7] hover:bg-[#016ec0] text-white text-sm font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
        >
          <span>Next</span>
          <MdOutlineKeyboardArrowRight className="text-lg" />
        </button>
      </div>
    </aside>
  );
};

export default SideBarImgs;
