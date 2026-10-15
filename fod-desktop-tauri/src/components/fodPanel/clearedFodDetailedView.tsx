import React, { useRef, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Fod_FodId, Fod_Riskfactor, Fod_ClearenceTime, Fod_Confidence } from "@/utils/FodParser";
import { validateSelectedFodLocation, validateCollectorLocation } from "@/utils/MapUtils";
import Slider, { LazyLoadTypes } from "react-slick";
import * as turf from '@turf/turf';
import type { Units } from '@turf/helpers';
import { removeClearedDetailedViewFod } from "@/store/actions/ClearedFodDetailView";
import Image from "next/image";
import { RootState } from "@/store";
import axiosClient from "@/utils/axios";
import { url } from "inspector";
import { AppDispatch } from "@/store";
const OperationSideBarStyle = {
    width: 6,
    background: '#FCFCFC',
    borderColor: '#DDDDE7'
}
const FodPanelStyle = {
    width: 100 - (OperationSideBarStyle.width || 0),
    background: "#F8F8F8",
}
const ClearedFodDetailView = () => {
    const dispatch = useDispatch<AppDispatch>();
    const { width } = FodPanelStyle;
    const detailedViewRef = useRef(null);
    const { isOpen } = useSelector((state: RootState) => state.ClearedFodDetailView);
    const { fod } = useSelector((state: RootState) => state.ClearedFodDetailView);
    const [clearedResponse,setClearedResponse]=useState(null);
    function handleButtonClick(event) {
        event.stopPropagation();
    }

    //add  event for closing detail view
    useEffect(() => {
        function handleClickOutside(event) {
            if (detailedViewRef.current && !detailedViewRef.current.contains(event.target)) {
                dispatch(removeClearedDetailedViewFod());
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("touchstart", handleClickOutside);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("touchstart", handleClickOutside);
        };
    }, [dispatch, detailedViewRef]);

    return (
        <>
            {isOpen && (
                <div className="fixed top-0 right-0 h-full w-full z-50 bg-gray-700 bg-opacity-40 flex justify-center items-center text-gray-600">
                    <div className={`detailedView_container`} style={{ width: `${width}%` }}>
                        <div className="clearedDetailedView_body" ref={detailedViewRef} onClick={handleButtonClick}>
                            <div className="clear-header flex justify-between">
                                <FodGrid />
                                <ClearedFodData />
                            </div>
                            <div className="clear-bottom flex justify-between">
                                <div className="clearedReportMap w-2/5">
                                    {/* <ClearedReportMap /> */}
                                </div>
                                <div className="collectorImg-container flex w-3/5">
                                    <div className="collectorImg">
                                        <ImgSlider clearedResponse={fod.collectorResponse} beforeImg={true} />
                                        <div className="text-center">Before Clearing</div>
                                    </div>
                                    <div className="collectorImg">
                                        <ImgSlider clearedResponse={fod.collectorResponse} beforeImg={false} />
                                        <div className="text-center">After Clearing</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default ClearedFodDetailView;

const FodGrid = () => {
    const getFrames = (fod) => {
        const { FodPoints } = fod;
        let frames = [];
        frames = FodPoints.map(FodPoint => FodPoint.frame);
        return frames.filter(frame => typeof (frame) === 'string');
    }
    const { fod } = useSelector((state: RootState) => state.ClearedFodDetailView);
    const frames = getFrames(fod);
console.log({fod})

    return (
        <div className="w-full h-full grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4 bg-[#EBEBEB] overflow-y-auto">
            {frames.map((frame, index) => (
                <div
                    key={index}
                    className={`relative w-full aspect-[4/3] bg-white ${index === 0 ? "border-2 border-black" : ""
                        }`}
                >
                    <Image
                        src={`${frame}`}
                        layout="fill"
                        objectFit="cover"
                        alt="FOD frame"
                        className="rounded-md"
                    />
                </div>
            ))}
        </div>
    );
};

const ImgSlider = ({ clearedResponse,beforeImg }) => {
    const settings = {
        infinite: false,
        speed: 1000,
        slidesToShow: 1,
        slidesToScroll: 1,
        lazyLoad: 'ondemand' as LazyLoadTypes,
        arrows: false,
        dots: false,
    };

    const ImgList = () => {
        if (!clearedResponse) return [];
        if (beforeImg) {
            return clearedResponse.beforeClearImg;
        } else {
            return clearedResponse.afterClearImg;
        }
    }

    return (
        <Slider {...settings} className={` cleared-slider-container `}>
            {ImgList().map((item, index) => (
                <div key={index} className={`cleared-slider-image-container`}>
                    <Image src={`${item}`} height={100} width={100} alt="image" key={index} draggable="false" />
                </div>
            ))}
        </Slider>
    )
}

const ClearedFodData = () => {
    const { fod } = useSelector((state: RootState) => state.ClearedFodDetailView);

    const distanceBwCollectorAndFOd = (clearedFod) => {
        const selectedFodLocation = validateSelectedFodLocation(clearedFod);
        const validatedCollectorLocation = validateCollectorLocation(clearedFod);

        if (!selectedFodLocation || !validatedCollectorLocation) {
            return "";
        }

        const point1 = turf.point(validatedCollectorLocation.coord);
        const point2 = turf.point(selectedFodLocation);

        const options = { units: 'meters' as Units };
        const distance = turf.distance(point1, point2, options);

        if (distance < 0) {
            const distInCm = distance * 100;
            return distInCm.toFixed(2) + ' cm';
        }

        if (distance > 999) {
            const distanceInKm = distance / 1000;
            return distanceInKm.toFixed(2) + " Km";
        }

        return distance.toFixed(2) + " m";
    }

    return (
        <div className="clearedfod-data-container">
            <div className="cleardfod-id text-2xl font-bold mb-4">{Fod_FodId(fod)}</div>
            <div className="clearedfod-data flex justify-between">
                <div className="clearedfod-data-left w-1/2">
                    <div><span>CAM ID</span><span>{(fod as any).sysid ?? ''}</span></div>
                    <div><span>Class</span><span>{(fod as any).class ?? ''}</span></div>
                    <div><span>Size</span><span>{(fod as any).size ?? ''}</span></div>
                    <div><span>Velocity</span><span>{(fod as any).velocity ?? ''}</span></div>
                    <div><span>Risk Factor</span><span>{Fod_Riskfactor(fod)}</span></div>
                </div>
                <div className="clearedfod-data-left w-1/2 ">
                    <div><span>Fod Status</span><span>{(fod as any).groupStatus ?? ''}</span></div>
                    <div><span>Detection Time</span><span>{(fod as any).timestamp ? new Date((fod as any).timestamp).toLocaleTimeString() + ' ' + new Date((fod as any).timestamp).toLocaleDateString() : ''}</span></div>
                    <div><span>Clearence Time</span><span>{Fod_ClearenceTime(fod)}</span></div>
                    <div><span>Distance</span><span>{distanceBwCollectorAndFOd(fod)}</span></div>
                    <div><span>Confidence</span><span>{Fod_Confidence(fod)}</span></div>
                </div>
            </div>
        </div>
    )
}
