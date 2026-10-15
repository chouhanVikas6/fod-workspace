import React, { useEffect, useState, useMemo } from "react";
import GpsIcon from "@/assets/images/svg/header/gps_health.svg";
import Image from "next/image";
import { useSelector } from "react-redux";
import { RootState } from "@/store";

const GpsInfo = ({ isToolTipVisible }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const l = useSelector((state:RootState) => state.SystemHealth)
console.info("l", l);
  const { data} = useSelector((state:RootState) => state.SystemHealth.carData);
  const { primary_data, secondary_data } = data;

  const handleHover = (val) => setShowTooltip(val);
  const handleClick = () => setShowTooltip((prev) => !prev);

  const allGpsStatus = useMemo(() => {
    const hasFix = (data) => data && data.hasOwnProperty('fix') && data.fix === 'RTK';
    const notConnected = (data) => !data || !data.hasOwnProperty('fix') || ['NOT_CONNECTED', 'NO_GPS'].includes(data.fix);

    if (notConnected(primary_data) && notConnected(secondary_data)) {
      return 'health-Status-Error';
    }
    
    if (hasFix(primary_data) && hasFix(secondary_data)) {
      return 'health-Status-Ok';
    }
    
    return 'health-Status-Problem';
  }, [ primary_data, secondary_data]);

  useEffect(() => {
    if (!isToolTipVisible) setShowTooltip(false);
  }, [isToolTipVisible]);

  return (
    <div
      className="healthbar-component"
      onMouseEnter={() => handleHover(true)}
      onMouseLeave={() => handleHover(false)}
      onClick={handleClick}
    >
      <span className="text-sm my-auto">Car </span>
      <div className="healthbar-icon active:scale-95">
        <Image src={GpsIcon} alt="" />
        <div className={`health-Status ${allGpsStatus}`}></div>
      </div>
      {showTooltip && (
        <div className="tool-tip gps">
          <div className="gpsCard-container">
            {primary_data && <GPS nodeData={primary_data} nodeId='CAR1' />}
            {secondary_data && <GPS nodeData={secondary_data} nodeId='CAR2' />}
          </div>
        </div>
      )}
    </div>
  );
};

export default GpsInfo;

const GPS = ({ nodeData, nodeId }) => {
  const GpsStatusClass = (rtk) => {
    const { fix } = rtk;
    if (fix === "RTK") return "health-Status-Ok";
    if (fix === "GPS") return "health-Status-Problem";
    return "health-Status-Error";
  };

  const parseSd = (nodeData) => {
    const { sd } = nodeData || {};
    return typeof sd === 'number' && isFinite(sd) ? sd.toFixed(2) : -1;
  };

  const parseFix = () => {
    const { fix } = nodeData || {};
    return typeof fix === 'string' ? fix.slice(0, 7) : "NOT CON";
  };

  return (
    <div className="gps_node">
      <div className="node_id w-[50px] text-[#717171] text-[14px] text-left">
        <div className={`${GpsStatusClass(nodeData)} status-circle`}></div>
        <div>{nodeId}</div>
      </div>
      <div className="gps_node_data">
        <span>
          <div className="w-[50px] text-[#717171] text-[14px] text-left">SD</div>
          <div className="text-[#717171] text-[14px]">{parseSd(nodeData)}</div>
        </span>
        <span>
          <div className="w-[50px] text-[#717171] text-[14px] text-left">Fix</div>
          <div className="text-[#717171] text-[14px]">{parseFix()}</div>
        </span>
      </div>
    </div>
  );
};
