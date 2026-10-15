import React, { useState, useRef, useEffect } from "react";
import SideBarImgs from "./sidebarImgs";
import { useSelector, useDispatch } from "react-redux";
import { addImageToSideBarImgs } from "@/store/actions/WebCam";
import { RootState } from "@/store";
import { MdRefresh, MdFileUpload, MdVideocamOff } from "react-icons/md";
import { HiOutlinePhotograph } from "react-icons/hi";

const WebCam = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [captureButtonActive, setCaptureButtonActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [flashEffect, setFlashEffect] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const { isWebCamStart, WebCamStream, selectedList } = useSelector(
    (state: RootState) => state.WebCam
  );
  const dispatch = useDispatch();

  const startCamera = async () => {
    setIsLoading(true);
    setCameraError(null);

    try {
      if (WebCamStream) {
        if (videoRef.current) {
          videoRef.current.srcObject = WebCamStream;
        }
        setCameraStream(WebCamStream);
        setIsLoading(false);
        return;
      }

      // Check available media devices first
      if (navigator.mediaDevices?.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter((d) => d.kind === "videoinput");
          if (devices.length > 0 && videoInputs.length === 0) {
            setCameraError("No camera device detected on this system.");
            setIsLoading(false);
            return;
          }
        } catch (e) {
          console.warn("enumerateDevices failed:", e);
        }
      }

      let stream: MediaStream | null = null;

      // 1. Try ideal environment facingMode (tablets/back camera)
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
      } catch (e1) {
        console.warn("Environment camera constraint failed, attempting generic video:", e1);
        // 2. Fallback to generic video device (front/USB webcam)
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        } catch (e2: any) {
          console.error("Camera access failed:", e2);
          const msg =
            e2?.name === "NotFoundError" || e2?.name === "DevicesNotFoundError"
              ? "No camera device detected on this system."
              : e2?.name === "NotAllowedError" || e2?.name === "PermissionDeniedError"
              ? "Camera permission was denied."
              : e2?.name === "NotReadableError"
              ? "Camera is already in use by another application."
              : `Camera unavailable (${e2?.name || "device error"}).`;
          setCameraError(msg);
          setIsLoading(false);
          return;
        }
      }

      if (stream) {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch((err) => console.warn("Video play error:", err));
        }
        setCameraStream(stream);
        setCameraError(null);
      }
    } catch (error: any) {
      console.error("Error accessing the camera:", error);
      setCameraError(error?.message || "Could not start camera.");
    } finally {
      setIsLoading(false);
    }
  };

  const closeCamera = () => {
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((t) => t.stop());
      } catch {
        /* no-op */
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraStream(null);
  };

  const triggerFlash = () => {
    setCaptureButtonActive(true);
    setFlashEffect(true);
    setTimeout(() => {
      setCaptureButtonActive(false);
      setFlashEffect(false);
    }, 120);
  };

  // Generate a simulated high-resolution inspection snapshot for dev/testing when no hardware camera exists
  const generateMockPhoto = () => {
    triggerFlash();

    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background: asphalt tarmac gradient
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, "#3e4042");
    grad.addColorStop(0.5, "#303234");
    grad.addColorStop(1, "#252628");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle runway texture / grain
    ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
    for (let i = 0; i < 400; i++) {
      const rx = Math.random() * canvas.width;
      const ry = Math.random() * canvas.height;
      const rw = Math.random() * 4 + 1;
      const rh = Math.random() * 4 + 1;
      ctx.fillRect(rx, ry, rw, rh);
    }

    // Runway yellow guidance line
    ctx.strokeStyle = "rgba(235, 180, 20, 0.75)";
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(80, canvas.height * 0.75);
    ctx.lineTo(canvas.width - 80, canvas.height * 0.75);
    ctx.stroke();

    // Stage badge (Before Clearing vs After Clearing)
    const isBefore = selectedList;
    ctx.fillStyle = isBefore ? "rgba(220, 38, 38, 0.9)" : "rgba(16, 185, 129, 0.9)";
    ctx.fillRect(40, 40, 340, 48);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px monospace";
    ctx.fillText(isBefore ? "STAGE: BEFORE CLEARING" : "STAGE: AFTER CLEARING", 55, 72);

    if (isBefore) {
      // Simulated FOD target
      ctx.fillStyle = "#a855f7";
      ctx.beginPath();
      ctx.arc(canvas.width * 0.5, canvas.height * 0.48, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Bounding box indicator
      ctx.strokeStyle = "rgba(239, 68, 68, 0.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(canvas.width * 0.5 - 45, canvas.height * 0.48 - 45, 90, 90);
      ctx.fillStyle = "rgba(239, 68, 68, 0.95)";
      ctx.font = "bold 15px monospace";
      ctx.fillText("FOD DETECTED", canvas.width * 0.5 - 45, canvas.height * 0.48 - 52);
    } else {
      // Cleared confirmation
      ctx.strokeStyle = "rgba(16, 185, 129, 0.9)";
      ctx.lineWidth = 3;
      ctx.strokeRect(canvas.width * 0.5 - 45, canvas.height * 0.48 - 45, 90, 90);
      ctx.fillStyle = "rgba(16, 185, 129, 0.95)";
      ctx.font = "bold 15px monospace";
      ctx.fillText("CLEARED", canvas.width * 0.5 - 32, canvas.height * 0.48 - 52);
    }

    // Telemetry strip
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fillRect(40, canvas.height - 65, 580, 38);
    ctx.fillStyle = "#38bdf8";
    ctx.font = "14px monospace";
    const now = new Date().toISOString().replace("T", " ").substring(0, 19);
    ctx.fillText(`ZOID FOD CAPTURE | ${now} UTC | SIMULATED`, 55, canvas.height - 41);

    const imageSrc = canvas.toDataURL("image/jpeg", 0.92);
    dispatch(addImageToSideBarImgs(imageSrc) as any);
  };

  const capture = () => {
    // If live camera is active, grab frame from video element
    if (cameraStream && videoRef.current && videoRef.current.videoWidth > 0) {
      triggerFlash();
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const context = canvas.getContext("2d");
      if (context) {
        context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const imageSrc = canvas.toDataURL("image/jpeg", 0.92);
        dispatch(addImageToSideBarImgs(imageSrc) as any);
      }
    } else {
      // Fallback when no physical camera is connected
      generateMockPhoto();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        triggerFlash();
        dispatch(addImageToSideBarImgs(reader.result) as any);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = ""; // Reset for re-selection
  };

  // Trigger on webCamState change
  useEffect(() => {
    if (!isWebCamStart) {
      startCamera();
    } else {
      closeCamera();
    }
  }, [isWebCamStart]);

  // Release the physical camera when the capture view unmounts (Back/Next)
  useEffect(() => {
    return () => {
      closeCamera();
    };
  }, []);

  return (
    <div className="relative h-full w-full flex justify-start items-center z-[1000] bg-[#1a1a1f]">
      {/* Hidden file input for uploading images directly */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Main viewport (3/4 width) */}
      <div className="relative h-full w-3/4 flex items-center justify-center bg-[#18181b] overflow-hidden">
        {/* Live video feed */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${cameraStream ? "block" : "hidden"}`}
        />

        {/* Top-right quick actions bar */}
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-black/60 hover:bg-black/80 backdrop-blur-md text-white text-xs font-medium rounded-md border border-white/20 transition-all cursor-pointer shadow-md"
            title="Upload an image from disk"
          >
            <MdFileUpload className="text-sm" />
            <span>Upload Image</span>
          </button>
          <button
            onClick={generateMockPhoto}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-black/60 hover:bg-black/80 backdrop-blur-md text-white text-xs font-medium rounded-md border border-white/20 transition-all cursor-pointer shadow-md"
            title="Generate a test capture photo"
          >
            <HiOutlinePhotograph className="text-sm" />
            <span>Test Photo</span>
          </button>
        </div>

        {/* State when no live camera is active */}
        {!cameraStream && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10 bg-gradient-to-b from-[#27272a] to-[#18181b]">
            {isLoading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
                <p className="text-sm text-gray-300">Searching for camera device...</p>
              </div>
            ) : (
              <div className="max-w-md bg-black/40 backdrop-blur-md p-6 rounded-xl border border-white/10 shadow-2xl flex flex-col items-center">
                <div className="w-14 h-14 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mb-4 text-2xl border border-amber-500/30">
                  <MdVideocamOff />
                </div>
                <h3 className="text-white text-lg font-semibold mb-1">
                  Camera Not Detected
                </h3>
                <p className="text-xs text-gray-400 mb-5 leading-relaxed">
                  {cameraError ||
                    "No video capture device (/dev/video*) is currently connected. You can plug in a USB camera, upload a photo, or generate a test photo."}
                </p>

                <div className="flex flex-wrap items-center justify-center gap-2 w-full">
                  <button
                    onClick={startCamera}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-medium rounded-lg border border-white/15 transition-all cursor-pointer"
                  >
                    <MdRefresh className="text-base" />
                    <span>Retry Camera</span>
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-[#017ED7] hover:bg-[#016ec0] text-white text-xs font-medium rounded-lg transition-all cursor-pointer shadow-md"
                  >
                    <MdFileUpload className="text-base" />
                    <span>Upload Photo</span>
                  </button>
                  <button
                    onClick={generateMockPhoto}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-all cursor-pointer shadow-md"
                  >
                    <HiOutlinePhotograph className="text-base" />
                    <span>Take Test Photo</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Shutter capture button at the bottom */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-20 flex flex-col items-center gap-1">
          <div className="w-[65px] h-[65px] flex items-center justify-center rounded-full bg-black/30 backdrop-blur-sm border-2 border-white/80 shadow-xl">
            <button
              onClick={capture}
              className={`w-[50px] h-[50px] rounded-full bg-white flex items-center justify-center transition-all cursor-pointer shadow-md ${
                captureButtonActive
                  ? "scale-90 bg-gray-300"
                  : "hover:scale-105 active:scale-95"
              }`}
              title={cameraStream ? "Take Live Photo" : "Capture Test Photo"}
            ></button>
          </div>
          <span className="text-[11px] text-white/70 font-medium tracking-wide">
            {cameraStream ? "Capture" : "Capture Test Photo"}
          </span>
        </div>
      </div>

      {/* Camera shutter flash effect */}
      {flashEffect && (
        <div className="absolute top-0 left-0 w-full h-full bg-white opacity-70 z-[1100] animate-flash pointer-events-none"></div>
      )}

      {/* Sidebar with Before/After review thumbnails */}
      <SideBarImgs />
    </div>
  );
};

export default WebCam;
