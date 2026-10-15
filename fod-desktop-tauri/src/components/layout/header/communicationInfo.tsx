import React, { useState, useMemo } from "react";
import CommBar_0 from "@/assets/images/svg/header/nocomm.svg";
// import CommBar_1 from "@/assets/images/svg/header/comm1bar.svg";
// import CommBar_2 from "@/assets/images/svg/header/comm2bar.svg";
// import CommBar_3 from "@/assets/images/svg/header/comm3bar.svg";
import CommBar_4 from "@/assets/images/svg/header/comm4bar.svg";
import atcCommImg from "@/assets/images/atc-comm.svg";
import tabletCommImg from "@/assets/images/tablet-comm.svg";
import carCommImg from "@/assets/images/car-comm.svg";
import { useSelector } from "react-redux";
import Image from "next/image";
import { RootState } from "@/store";
import AtcIcon from "./atcIcon";

const CommunicationInfo = () => {
    const [showTooltip, setShowTooltip] = useState(false);
    const { latency, availableCommunication } = useSelector((state: RootState) => state.SystemHealth);
    const comms = (availableCommunication as Array<{ type: string; sysId: string }>);

    const handleHover = (val) => {
        setShowTooltip(val);
    };

    const getCommBarImage = useMemo(() => {
        if (latency?.connected) {
            // Assuming handleLatency function is no longer needed.
            // if (latency.ping <= 5) return CommBar_0;
            // if (latency.ping <= 25) return CommBar_1;
            // if (latency.ping <= 50) return CommBar_2;
            // if (latency.ping <= 80) return CommBar_3;
            return CommBar_4;
        }
        return CommBar_0;
    }, [latency]);

    const getImage = (type) => {
        switch (type) {
            case 'atc':
                return atcCommImg;
            case 'car':
                return carCommImg;
            case 'client':
                return tabletCommImg;
            default:
                return null;
        }
    };

    return (
        <div
            className="flex items-center justify-center relative font-normal text-[18px] line-height-[1] cursor-pointer "
            onMouseEnter={() => handleHover(true)}
            onMouseLeave={() => handleHover(false)}
            onClick={() => setShowTooltip(prev => !prev)}
        >
            <div className="flex items-center active:scale-95 space-x-2   p-2">
                <Image src={getCommBarImage} alt="Communication Bar" width={30} height={30} />
                <AtcIcon/>
                {comms?.map((ele) => (
                            <div key={`${ele.type}-${ele.sysId}`} className="flex items-center">
                                <Image src={getImage(ele.type)} alt={ele.type} width={15} height={15} />
                                <span>{`${ele.type} `}</span>
                            </div>
                        ))}
            </div>

        </div>
    );
};

export default CommunicationInfo;
