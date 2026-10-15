import React, { useEffect, useReducer, useState } from "react";
import mapboxgl from "mapbox-gl";
import { useSelector, useDispatch } from "react-redux";
import { updateSelectedFod } from "@/store/actions/SelectedFod";
import { setSideBarVisibility } from "@/store/slices/selectedFod-slice";
import { RootState } from "@/store";
import { config } from "@/config/clientConfig";

const initialState = {
  fodMarkers: [],
};

function reducer(state, action) {
  console.log(action.type, action.payload);
  switch (action.type) {
    case "ADD_MARKER":
      return {
        ...state,
        fodMarkers: [...state.fodMarkers, ...action.payload],
      };
    case "REMOVE_MARKERS":
      return {
        ...state,
        fodMarkers: state.fodMarkers.filter(
          (marker) => !action.payload.includes(marker.groupId)
        ),
      };
    default:
      return state;
  }
}

const MissedMarkers = ({ map }) => {
  const dispatch = useDispatch();
  const selected_queue = useSelector((state:RootState) => state.MapReducer.selectedQueue);
  const [state, localDispatch] = useReducer(reducer, initialState);
  const fods = useSelector((state: RootState) => state.FodReducer.fods);
  const { selectedQueue } = useSelector((state: RootState) => state.MapReducer);
  const { isSidebarVisible } = useSelector((state: RootState) => state.SelectedFod);

  const plotFodMarker = (fod, queueNum, className) => {
    if (state.fodMarkers.some((marker) => marker.groupId === fod.groupId)) return;
    const icon = document.createElement("div");
    icon.className = className;

    const fodMarker = new mapboxgl.Marker(icon)
      .setLngLat([fod.lon, fod.lat])
      .addTo(map.current);

    const payload = { groupId: fod.groupId, marker: fodMarker, queueNum, className };
    localDispatch({ type: "ADD_MARKER", payload: [payload] });
  };

  const removeMarker = (marker) => {
    marker.marker.remove();
    localDispatch({ type: "REMOVE_MARKERS", payload: [marker.groupId] });
  };

  const removeAllMarkers = () => {
    state.fodMarkers.forEach((marker) => marker.marker.remove());
    localDispatch({
      type: "REMOVE_MARKERS",
      payload: state.fodMarkers.map((marker) => marker.groupId),
    });
  };

  useEffect(() => {
   
    if (!selectedQueue.includes("MISSED")) {
        console.log("missed")
      removeAllMarkers();
    } else {
        console.log("catched")
        config.missedFod.forEach((fod,idx)=>{
            const existingMarker = state.fodMarkers.find(
                (marker) => marker.groupId === fod.groupId
              );
              if(!existingMarker){
                plotFodMarker(
                    {...fod,groupId:idx},
                    "MISSED",
                    `${"MISSED".toLowerCase()}-marker `
                  );
              }
        })
    }
  }, [selectedQueue]);



  return null;
};

export default MissedMarkers;
