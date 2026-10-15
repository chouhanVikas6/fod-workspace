const GPS = ({ nodeData, nodeId }) => {
    // console.log(nodeData)
    const GpsStatusClass = (rtk) => {
      const { fix } = rtk;
      if (fix === "RTK") {
        return "health-Status-Ok";
      } else if (fix === "GPS") {
        return "health-Status-Problem";
      } else {
        return "health-Status-Error";
      }
    };
  
    const parseSd = (nodeData) => {
      if (!nodeData || !nodeData.hasOwnProperty('sd')) {
        return -1;
      }
  
      const { sd } = nodeData;
      if (typeof (sd) === 'number' && isFinite(sd)) {
        return sd.toFixed(2);
      }
  
      return -1;
    }
  
    const parseFix = () => {
      if (!nodeData || !nodeData.hasOwnProperty('fix')) {
        return "NOT CON";
      }
  
      const { fix } = nodeData;
      if (typeof (fix) === 'string') {
        return fix.slice(0, 7);
      }
  
      return "NOT CON";
    }
  
  
    return (
      <div className="gps_node">
        <div className="node_id w-[50px]  text-[#717171] text-[14px] text-left">
          <div className={`${GpsStatusClass(nodeData)} status-circle`}></div>
          <div>{nodeId}</div>
        </div>
        <div className="gps_node_data">
          <span><div className="w-[50px]  text-[#717171] text-[14px] text-left">SD</div><div className=" text-[#717171] text-[14px]">{parseSd(nodeData)}</div></span>
          <span><div className="w-[50px]  text-[#717171] text-[14px] text-left">Fix</div><div className="text-[#717171] text-[14px]">{parseFix()}</div></span>
        </div>
      </div>);
  };

  export default GPS;