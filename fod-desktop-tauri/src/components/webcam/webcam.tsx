import React, { useState, useRef, useEffect } from "react";
import SideBarImgs from "./sidebarImgs";
import { useSelector, useDispatch } from "react-redux";
import { addImageToSideBarImgs } from "@/store/actions/WebCam";
import { RootState } from "@/store";
const WebCam = () => {
  const videoRef = useRef(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [captureButtonActive, setCaptureButtonActive] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [flashEffect, setFlashEffect] = useState(false);
  const { isWebCamStart, WebCamStream } = useSelector((state:RootState) => state.WebCam);
  const dispatch = useDispatch();

  const startCamera = async () => {
    try {
      if (WebCamStream) {
        videoRef.current.srcObject = WebCamStream;
        setCameraStream(WebCamStream);
      } else {
        try {
          const constraints = {
            video: {
              facingMode: "environment"
            },
          };

          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          streamRef.current = stream;
          videoRef.current.srcObject = stream;
          setCameraStream(stream);
        } catch (e) {
          console.log("Camera Stream not initialized inside WebCam.js", e);
        }
      }
    } catch (error) {
      if (error.name === "OverconstrainedError") {
        console.error("OverconstrainedError:", error);
      } else {
        console.error("Error accessing the camera:", error);
      }
    }
  };

  const closeCamera = () => {
    if (cameraStream) {
      setCameraStream(null);
    }
  };

  const capture = () => {
    setCaptureButtonActive(true);
    setFlashEffect(true);

    setTimeout(() => {
      setCaptureButtonActive(false);
      setFlashEffect(false);
    }, 100);

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const context = canvas.getContext("2d");
    context.drawImage(
      videoRef.current,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const imageSrc = canvas.toDataURL("image/jpeg");
    dispatch(addImageToSideBarImgs(imageSrc) as any);
  };

  //This trigger on webCamState change and according to that take camera stream access
  useEffect(() => {
    if (!isWebCamStart) {
      startCamera();
    } else {
      closeCamera()
    }
  }, [isWebCamStart]);

  // Release the physical camera when the capture view unmounts (Back/Next),
  // otherwise the device stays locked until the app closes.
  useEffect(() => {
    return () => {
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      } catch { /* no-op */ }
    };
  }, []);

  return (
    <div className="relative h-full w-full flex justify-start items-center z-[1000] bg-[#D9D9D9]">
      <div className="relative h-full w-3/4">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 w-[65px] h-[65px] flex items-center justify-center rounded-full bg-transparent border-3 border-white">
          <button
            onClick={capture}
            className={`w-[50px] h-[50px] rounded-full bg-white flex items-center justify-center ${captureButtonActive ? "scale-95 bg-gray-300" : ""
              }`}
            disabled={cameraStream === null}
          ></button>
        </div>
      </div>
      {flashEffect && (
        <div className="absolute top-0 left-0 w-full h-full bg-white opacity-70 z-[1000] animate-flash"></div>
      )}
      <SideBarImgs />
    </div>
  );
};

export default WebCam;
