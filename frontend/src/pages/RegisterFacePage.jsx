import { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import api from "../api/axios";
import PageWrapper from "../components/PageWrapper";
import { useToast } from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import {
  ensureCameraSupport,
  getCameraErrorMessage,
  getCameraPermissionState,
} from "../utils/media";

const MODEL_URL = "/models";

export default function RegisterFacePage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const detectionIntervalRef = useRef(null);

  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const { user, updateUser } = useAuth();
  const { showToast, ToastContainer } = useToast();

  useEffect(() => {
    if (user?.hasFace) {
      setStatusMessage("Face already registered");
      return undefined;
    }

    let cancelled = false;

    async function loadModels() {
      setStatusMessage("Loading face recognition models...");
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        if (!cancelled) {
          setModelsLoaded(true);
          setStatusMessage("Models are ready. Start the camera to capture your face.");
        }
      } catch {
        if (!cancelled) setStatusMessage("Unable to load face recognition models.");
      }
    }

    loadModels();
    return () => { cancelled = true; stopCamera(); };
  }, [user?.hasFace]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    canvasRef.current?.getContext("2d")?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setCameraActive(false);
    setFaceDetected(false);
  };

  const startLiveFaceDetection = () => {
    detectionIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      try {
        const detection = await faceapi
          .detectSingleFace(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
          .withFaceLandmarks();
        const canvas = canvasRef.current;
        const dimensions = faceapi.matchDimensions(canvas, videoRef.current, true);
        canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
        faceapi.draw.drawDetections(canvas, faceapi.resizeResults(detection ? [detection] : [], dimensions));
        setFaceDetected(Boolean(detection));
      } catch {
        setFaceDetected(false);
      }
    }, 300);
  };

  const startCamera = async () => {
    try {
      ensureCameraSupport();
      const permissionState = await getCameraPermissionState();
      if (permissionState === "denied") throw new Error("Camera access is blocked. Allow camera permission for this site in your browser settings and reload.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 960, height: 540, facingMode: "user" } });
      streamRef.current = stream;
      setCameraActive(true);
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});
      setStatusMessage("Camera is active. Center your face and capture when the detector is ready.");
      startLiveFaceDetection();
    } catch (err) {
      const message = getCameraErrorMessage(err);
      setStatusMessage(message);
      showToast(message, "error");
    }
  };

  const captureFace = async () => {
    if (!videoRef.current || !modelsLoaded || user?.hasFace) return;
    setSubmitting(true);
    setStatusMessage("Capturing face descriptor...");
    try {
      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (!detection) {
        setStatusMessage("No face was detected clearly. Adjust your position and try again.");
        return;
      }
      const descriptor = Array.from(detection.descriptor);
      await api.put("/settings/register-face", { faceDescriptor: descriptor });
      updateUser({ hasFace: true });
      stopCamera();
      setStatusMessage("Face already registered");
      showToast("Face registered successfully.", "success");
    } catch (err) {
      const responseData = err.response?.data;
      const message = responseData?.message || "Face registration failed. Please try again.";
      const isDuplicate = responseData?.code === "FACE_DUPLICATE";
      const isAlreadyRegistered = message === "Face already registered";
      if (isAlreadyRegistered) updateUser({ hasFace: true });
      setStatusMessage(message);
      showToast(message, isAlreadyRegistered || isDuplicate ? "warning" : "error");
    } finally {
      setSubmitting(false);
    }
  };

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <PageWrapper
      title="Face Registration"
      description="A face can only be registered once. The backend blocks duplicate registration attempts."
    >
      <ToastContainer />

      <div className="space-y-5">

        {/* ── Status strip ── */}
        <div className="grid grid-cols-3 gap-4">
          <div className="card py-4">
            <p className="section-label">Registration Status</p>
            <div className="mt-3">
              <span className={user?.hasFace ? "status-chip status-chip-success" : "status-chip status-chip-info"}>
                {user?.hasFace ? "Registered" : "Not Registered"}
              </span>
            </div>
          </div>
          <div className="card py-4">
            <p className="section-label">Models</p>
            <div className="mt-3">
              <span className={user?.hasFace || modelsLoaded ? "status-chip status-chip-success" : "status-chip status-chip-neutral"}>
                {user?.hasFace ? "Not Required" : modelsLoaded ? "Ready" : "Loading…"}
              </span>
            </div>
          </div>
          <div className="card py-4">
            <p className="section-label">Camera</p>
            <div className="mt-3">
              <span className={cameraActive ? (faceDetected ? "status-chip status-chip-success" : "status-chip status-chip-warning") : "status-chip status-chip-neutral"}>
                {cameraActive ? (faceDetected ? "Face detected" : "Waiting for face") : "Inactive"}
              </span>
            </div>
          </div>
        </div>

        {/* ── Main content ── */}
        <div className="grid gap-5 xl:grid-cols-[1fr_340px] items-start">

          {/* ── Left: status + camera ── */}
          <div className="space-y-5">

            {/* Status card */}
            <div className="card">
              <h2 className="text-base font-semibold text-slate-900">
                {user?.hasFace ? "Face registration is locked" : "Register your face"}
              </h2>
              <p className="mt-2 text-sm text-slate-500">{statusMessage}</p>
            </div>

            {/* Compact camera */}
            <div className="card overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                <p className="section-label">Camera Preview</p>
                {cameraActive && (
                  <span className={faceDetected ? "status-chip status-chip-success" : "status-chip status-chip-warning"}>
                    {faceDetected ? "Face detected" : "Waiting for face"}
                  </span>
                )}
              </div>

              <div className="relative h-64 bg-slate-950 flex items-center justify-center overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className={`mirror-video h-full w-full object-cover transition-opacity ${cameraActive ? "opacity-100" : "opacity-0"}`}
                />
                <canvas ref={canvasRef} className="face-overlay absolute inset-0 h-full w-full" />
                {!cameraActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                    <svg className="h-10 w-10 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 9.75v9A2.25 2.25 0 004.5 18.75z" />
                    </svg>
                    <p className="text-sm font-medium text-slate-300">Camera inactive</p>
                    <p className="text-xs text-slate-500">Start the camera to capture a single face descriptor.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Right sidebar ── */}
          <div className="space-y-5">

            {/* Controls */}
            <div className="card">
              <p className="section-label">Controls</p>
              <div className="mt-4 grid gap-3">
                {!cameraActive ? (
                  <button
                    onClick={startCamera}
                    disabled={!modelsLoaded || user?.hasFace}
                    className="btn-primary w-full disabled:opacity-50"
                  >
                    {user?.hasFace ? "Face already registered" : modelsLoaded ? "Start camera" : "Loading models…"}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={captureFace}
                      disabled={submitting || !faceDetected || user?.hasFace}
                      className="btn-primary w-full disabled:opacity-50"
                    >
                      {submitting ? "Capturing…" : "Capture and register"}
                    </button>
                    <button onClick={stopCamera} className="btn-secondary w-full">
                      Stop camera
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Guidelines */}
            <div className="card overflow-hidden p-0">
              <div className="border-b border-slate-100 px-5 py-3">
                <p className="section-label">Guidelines</p>
              </div>
              <ul className="divide-y divide-slate-100">
                {[
                  "Use a well-lit area with only one face in the frame.",
                  "Hold still until the detector shows a confirmed face state.",
                  "Registration is locked after the first successful submission.",
                  "Re-registration stays blocked if a descriptor already exists.",
                  "Camera requires a secure URL (https or localhost).",
                  "If blocked, open browser site settings and allow camera access.",
                ].map((rule, i) => (
                  <li key={i} className="flex items-start gap-3 px-5 py-3 text-xs text-slate-500">
                    <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-400">
                      {i + 1}
                    </span>
                    {rule}
                  </li>
                ))}
              </ul>
            </div>

          </div>
        </div>
      </div>
    </PageWrapper>
  );
}