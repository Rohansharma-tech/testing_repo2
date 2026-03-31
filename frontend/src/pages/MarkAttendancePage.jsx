import { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import api from "../api/axios";
import { AttendanceReasonBadge, AttendanceStatusBadge } from "../components/AttendanceBadges";
import PageWrapper from "../components/PageWrapper";
import { useToast } from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import {
  ATTENDANCE_REASON,
  ATTENDANCE_STATUS,
  getLocationErrorMessage,
  getReasonLabel,
  formatTime12h,
} from "../utils/attendance";
import {
  ensureCameraSupport,
  getCameraErrorMessage,
  getCameraPermissionState,
} from "../utils/media";

const MODEL_URL = "/models";
const FACE_MATCH_THRESHOLD = 0.6;
const LOCATION_ACQUISITION_TIMEOUT_MS = 20000;

function euclideanDistance(firstDescriptor, secondDescriptor) {
  if (!firstDescriptor || !secondDescriptor || firstDescriptor.length !== secondDescriptor.length) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.sqrt(
    firstDescriptor.reduce((total, value, index) => total + (value - secondDescriptor[index]) ** 2, 0)
  );
}

function getPermissionState() {
  if (!navigator.permissions?.query) return Promise.resolve("prompt");
  return navigator.permissions
    .query({ name: "geolocation" })
    .then((result) => result.state)
    .catch(() => "prompt");
}

function buildLocationPayload(position) {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    mocked: position.coords.mocked === true,
    capturedAt: new Date(position.timestamp).toISOString(),
  };
}

function formatAccuracyMeters(value) {
  return Number.isFinite(value) ? `${Math.round(value)} m` : "Unavailable";
}

function buildLocationProgressMessage(currentAccuracy, requiredAccuracy) {
  return `Improving GPS accuracy... Current: ${formatAccuracyMeters(currentAccuracy)}. Required: ${formatAccuracyMeters(requiredAccuracy)} or better.`;
}

function buildLowAccuracyMessage(responseData, accuracy) {
  if (responseData?.detail) return `${responseData.message} ${responseData.detail}`;
  return accuracy
    ? `Location accuracy is too low. Current accuracy: ${formatAccuracyMeters(accuracy)}. Move to an open area and try again.`
    : "Location accuracy is too low. Move to an open area and try again.";
}

function acquireBestLocation({ requiredAccuracyMeters, onProgress, timeoutMs = LOCATION_ACQUISITION_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported on this device."));
      return;
    }
    let bestPosition = null;
    let settled = false;
    let watchId = null;
    let timeoutId = null;

    const cleanup = () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (timeoutId !== null) clearTimeout(timeoutId);
    };

    const finalizeWithBest = () => {
      if (settled) return;
      settled = true;
      cleanup();
      if (bestPosition) resolve(buildLocationPayload(bestPosition));
      else reject(new Error("Unable to retrieve your location. Move to an open area and try again."));
    };

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!bestPosition || position.coords.accuracy < bestPosition.coords.accuracy) bestPosition = position;
        onProgress?.(buildLocationPayload(bestPosition));
        if (
          Number.isFinite(bestPosition.coords.accuracy) &&
          Number.isFinite(requiredAccuracyMeters) &&
          bestPosition.coords.accuracy <= requiredAccuracyMeters
        ) finalizeWithBest();
      },
      (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(getLocationErrorMessage(error)));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    timeoutId = setTimeout(finalizeWithBest, timeoutMs);
  });
}

export default function MarkAttendancePage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const detectionIntervalRef = useRef(null);

  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("loading");
  const [statusMessage, setStatusMessage] = useState("Loading face recognition models...");
  const [geofenceInfo, setGeofenceInfo] = useState(null);
  const [locationPayload, setLocationPayload] = useState(null);
  const [windowInfo, setWindowInfo] = useState(null);
  const [todayState, setTodayState] = useState({
    status: ATTENDANCE_STATUS.NOT_MARKED,
    record: null,
    marked: false,
    canRetry: true,
    cutoffPassed: false,
  });

  const { user } = useAuth();
  const { showToast, ToastContainer } = useToast();

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const [geofenceRes, todayRes] = await Promise.all([
          api.get("/settings/geofence"),
          api.get("/attendance/today"),
        ]);
        if (cancelled) return;

        setGeofenceInfo(geofenceRes.data);
        setTodayState(todayRes.data);
        setWindowInfo(todayRes.data.windowInfo || null);

        if (todayRes.data.status === ATTENDANCE_STATUS.PRESENT) {
          setStage("done");
          setStatusMessage(`Attendance already marked at ${formatTime12h(todayRes.data.record?.time)}.`);
          return;
        }
        if (todayRes.data.cutoffPassed) {
          setStage("blocked");
          setStatusMessage("The attendance window has closed for today. You were automatically marked absent at the cutoff time.");
          return;
        }
        const wi = todayRes.data.windowInfo;
        if (wi?.status === "before_window") {
          setStage("window_waiting");
          setStatusMessage(`Attendance window opens at ${formatTime12h(wi.startTime)}. Please come back then.`);
          return;
        }
        if (wi?.status === "after_window") {
          setStage("blocked");
          setStatusMessage(`The attendance window closed at ${wi.endTime}. You were or will be marked absent automatically.`);
          return;
        }
        if (todayRes.data.record?.reason === ATTENDANCE_REASON.OUTSIDE_LOCATION) {
          setStage("blocked");
          setStatusMessage("You are not in the allowed location");
        } else {
          setStage("idle");
          setStatusMessage("Location and face verification are ready.");
        }

        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        if (!cancelled) setModelsLoaded(true);
      } catch {
        if (!cancelled) {
          setStage("error");
          setStatusMessage("Unable to initialize attendance verification.");
        }
      }
    }

    initialize();
    return () => { cancelled = true; stopCamera(); };
  }, []);

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

  const startCamera = async () => {
    ensureCameraSupport();
    const permissionState = await getCameraPermissionState();
    if (permissionState === "denied") throw new Error("Camera access is blocked. Allow camera permission for this site in your browser settings and reload.");
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 960, height: 540, facingMode: "user" } });
    streamRef.current = stream;
    setCameraActive(true);
    videoRef.current.srcObject = stream;
    await videoRef.current.play().catch(() => {});
    detectionIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks();
      const canvas = canvasRef.current;
      const dimensions = faceapi.matchDimensions(canvas, videoRef.current, true);
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      faceapi.draw.drawDetections(canvas, faceapi.resizeResults(detection ? [detection] : [], dimensions));
      setFaceDetected(Boolean(detection));
    }, 300);
  };

  const requestLocation = async () => {
    if (!window.isSecureContext) throw new Error("Location services require a secure context.");
    const permissionState = await getPermissionState();
    if (permissionState === "denied") throw new Error("Location access was denied. Allow location permission and try again.");
    const requiredAccuracyMeters = geofenceInfo?.maxAccuracyMeters;
    return acquireBestLocation({
      requiredAccuracyMeters,
      onProgress: (payload) => {
        setLocationPayload(payload);
        setStatusMessage(
          Number.isFinite(requiredAccuracyMeters)
            ? buildLocationProgressMessage(payload.accuracy, requiredAccuracyMeters)
            : "Retrieving current GPS location..."
        );
      },
    });
  };

  const handleBlockedAttempt = (responseData) => {
    stopCamera();
    setTodayState({ status: responseData.record?.status || ATTENDANCE_STATUS.ABSENT, record: responseData.record || null, marked: false, canRetry: true });
    setStage("blocked");
    setStatusMessage(responseData.message || "You are not in the allowed location");
  };

  const startAttendanceFlow = async () => {
    if (!user?.hasFace) { showToast("Register your face before marking attendance.", "warning"); return; }
    if (todayState.status === ATTENDANCE_STATUS.PRESENT) {
      setStage("done");
      setStatusMessage(`Attendance already marked at ${formatTime12h(todayState.record?.time)}.`);
      return;
    }
    setBusy(true);
    setStatusMessage("Retrieving current GPS location...");
    setStage("locating");
    try {
      const currentLocation = await requestLocation();
      setLocationPayload(currentLocation);
      setStatusMessage("Validating your location against the allowed geofence...");
      const validation = await api.post("/attendance/location-check", currentLocation);
      if (validation.data.alreadyMarked) {
        setTodayState({ status: validation.data.record?.status || ATTENDANCE_STATUS.PRESENT, record: validation.data.record || null, marked: true, canRetry: false });
        setStage("done");
        setStatusMessage(`Attendance already marked at ${formatTime12h(validation.data.record?.time)}.`);
        return;
      }
      await startCamera();
      setStage("camera");
      setStatusMessage("Location validated. Complete face verification to submit attendance.");
    } catch (err) {
      const responseData = err.response?.data;
      const errCode = responseData?.code;
      const isCutoffPassed = errCode === "cutoff_passed";
      const isWindowNotOpen = errCode === "window_not_open";
      const isWindowClosed = errCode === "window_closed";
      const lowAccuracyMessage = errCode === ATTENDANCE_REASON.LOCATION_UNRELIABLE ? buildLowAccuracyMessage(responseData, locationPayload?.accuracy) : null;
      const message = lowAccuracyMessage || responseData?.message || getCameraErrorMessage(err) || "Unable to validate attendance.";
      if (isCutoffPassed) {
        stopCamera();
        setTodayState((prev) => ({ ...prev, canRetry: false, cutoffPassed: true, record: responseData.record || prev.record }));
        setStage("blocked");
        setStatusMessage(responseData.detail || message);
      } else if (isWindowNotOpen) {
        stopCamera();
        setStage("window_waiting");
        setStatusMessage(message);
        if (responseData.appealWindowStart || responseData.windowStart) {
          setWindowInfo((prev) => ({ ...prev, startTime: responseData.appealWindowStart || responseData.windowStart, endTime: responseData.appealWindowEnd || responseData.windowEnd, status: "before_window" }));
        }
      } else if (isWindowClosed) {
        stopCamera();
        setStage("blocked");
        setStatusMessage(message);
      } else if (responseData?.message === "You are not in the allowed location") {
        handleBlockedAttempt(responseData);
      } else {
        setStage("error");
        setStatusMessage(message);
      }
      showToast(message, "error");
    } finally {
      setBusy(false);
    }
  };

  const verifyAndSubmit = async () => {
    if (!faceDetected || !locationPayload) { showToast("Position your face clearly before submitting.", "warning"); return; }
    setBusy(true);
    setStage("verifying");
    setStatusMessage("Matching live face data with your registered descriptor...");
    try {
      const faceDescriptorRes = await api.get("/settings/face-descriptor");
      const storedDescriptor = faceDescriptorRes.data.faceDescriptor;
      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      if (!detection) {
        setStage("camera");
        setStatusMessage("No face was detected clearly. Adjust your position and try again.");
        showToast("No clear face detected.", "warning");
        return;
      }
      const liveDescriptor = Array.from(detection.descriptor);
      const distance = euclideanDistance(liveDescriptor, storedDescriptor);
      if (distance > FACE_MATCH_THRESHOLD) {
        setStage("camera");
        setStatusMessage("Face verification failed. The live capture does not match the registered descriptor.");
        showToast("Face verification failed.", "error");
        return;
      }
      setStage("submitting");
      setStatusMessage("Face verified. Submitting attendance...");
      const response = await api.post("/attendance/mark", locationPayload);
      stopCamera();
      setTodayState({ status: response.data.record?.status || ATTENDANCE_STATUS.PRESENT, record: response.data.record || null, marked: true, canRetry: false });
      setStage("done");
      setStatusMessage(`Attendance marked successfully at ${formatTime12h(response.data.record?.time)}.`);
      showToast("Attendance marked successfully.", "success");
    } catch (err) {
      const responseData = err.response?.data;
      const errCode = responseData?.code;
      const isCutoffPassed = errCode === "cutoff_passed";
      const isWindowNotOpen = errCode === "window_not_open";
      const isWindowClosed = errCode === "window_closed";
      const message = responseData?.message || err.message || "Attendance submission failed.";
      if (isCutoffPassed) {
        stopCamera();
        setTodayState((prev) => ({ ...prev, canRetry: false, cutoffPassed: true, record: responseData.record || prev.record }));
        setStage("blocked");
        setStatusMessage(responseData.detail || message);
      } else if (isWindowNotOpen) {
        stopCamera();
        setStage("window_waiting");
        setStatusMessage(message);
      } else if (isWindowClosed) {
        stopCamera();
        setStage("blocked");
        setStatusMessage(message);
      } else if (responseData?.message === "You are not in the allowed location") {
        handleBlockedAttempt(responseData);
      } else if (responseData?.alreadyMarked) {
        stopCamera();
        setTodayState({ status: responseData.record?.status || ATTENDANCE_STATUS.PRESENT, record: responseData.record || null, marked: true, canRetry: false, cutoffPassed: false });
        setStage("done");
        setStatusMessage(`Attendance already marked at ${formatTime12h(responseData.record?.time)}.`);
      } else {
        setStage("error");
        setStatusMessage(message);
      }
      showToast(message, "error");
    } finally {
      setBusy(false);
    }
  };

  const resetFlow = () => {
    stopCamera();
    setLocationPayload(null);
    if (todayState.cutoffPassed) {
      setStage("blocked");
      setStatusMessage("The attendance window has closed for today. You were automatically marked absent at the cutoff time.");
      return;
    }
    if (windowInfo?.status === "before_window") {
      setStage("window_waiting");
      setStatusMessage(`Attendance window opens at ${formatTime12h(windowInfo.startTime)}. Please come back then.`);
      return;
    }
    if (windowInfo?.status === "after_window") {
      setStage("blocked");
      setStatusMessage(`The attendance window closed at ${windowInfo.endTime}.`);
      return;
    }
    setStage(todayState.status === ATTENDANCE_STATUS.ABSENT ? "blocked" : "idle");
    setStatusMessage(
      todayState.record?.reason === ATTENDANCE_REASON.OUTSIDE_LOCATION
        ? "You are not in the allowed location"
        : "Location and face verification are ready."
    );
  };

  // ── Derived UI values (unchanged) ─────────────────────────────────────────
  const stageTone =
    stage === "done" ? "status-chip status-chip-success"
    : stage === "blocked" ? "status-chip status-chip-warning"
    : stage === "window_waiting" ? "status-chip status-chip-info"
    : stage === "error" ? "status-chip status-chip-danger"
    : "status-chip status-chip-info";

  const isWindowWaiting = stage === "window_waiting";
  const isDisabled =
    busy ||
    !modelsLoaded ||
    todayState.status === ATTENDANCE_STATUS.PRESENT ||
    todayState.cutoffPassed ||
    isWindowWaiting;

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <PageWrapper
      title="Mark Attendance"
      description="Attendance is accepted only after geofence validation and face verification both succeed."
    >
      <ToastContainer />

      <div className="space-y-5">

        {/* ── Stats-style status strip ── */}
        <div className="grid grid-cols-3 gap-4">
          <div className="card py-4">
            <p className="section-label">Today's Status</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <AttendanceStatusBadge status={todayState.status} />
              <AttendanceReasonBadge reason={todayState.record?.reason} />
            </div>
          </div>
          <div className="card py-4">
            <p className="section-label">Geofence Radius</p>
            <p className="metric-value mt-3">{geofenceInfo?.radius ?? "—"}<span className="text-base font-normal text-slate-400"> m</span></p>
          </div>
          <div className="card py-4">
            <p className="section-label">GPS Accuracy Required</p>
            <p className="metric-value mt-3">{geofenceInfo?.maxAccuracyMeters ?? "—"}<span className="text-base font-normal text-slate-400"> m</span></p>
          </div>
        </div>

        {/* ── Main content ── */}
        <div className="grid gap-5 xl:grid-cols-[1fr_340px] items-start">

          {/* ── Left: camera + status ── */}
          <div className="space-y-5">

            {/* Status card */}
            <div className="card">
              <div className="flex flex-wrap items-center gap-2">
                <span className={stageTone}>
                  {stage === "done" ? "Completed"
                    : stage === "blocked" ? "Blocked"
                    : stage === "window_waiting" ? "Waiting"
                    : stage === "error" ? "Needs Attention"
                    : "Ready"}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-600">{statusMessage}</p>

              {/* Window info banner */}
              {windowInfo && !todayState.marked && (
                <div className={`mt-4 rounded-xl border p-3.5 text-sm ${
                  windowInfo.status === "before_window"
                    ? "border-blue-200 bg-blue-50 text-blue-800"
                    : windowInfo.status === "after_window"
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-emerald-200 bg-emerald-50 text-emerald-800"
                }`}>
                  {windowInfo.type === "appeal_revalidation" ? (
                    <>
                      <p className="font-semibold">Appeal Re-validation Window</p>
                      <p className="mt-1">
                        Mark attendance between{" "}
                        <strong>{formatTime12h(windowInfo.startTime)}</strong> and{" "}
                        <strong>{formatTime12h(windowInfo.endTime)}</strong> today.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold">
                        {windowInfo.status === "before_window"
                          ? `Attendance window opens at ${formatTime12h(windowInfo.startTime)}`
                          : windowInfo.status === "after_window"
                            ? `Attendance window closed at ${formatTime12h(windowInfo.endTime)}`
                            : `Attendance window: ${formatTime12h(windowInfo.startTime)} – ${formatTime12h(windowInfo.endTime)}`}
                      </p>
                      {windowInfo.status === "before_window" && (
                        <p className="mt-1 text-xs opacity-75">Button enables once the window opens.</p>
                      )}
                      {windowInfo.status === "after_window" && (
                        <p className="mt-1 text-xs opacity-75">Window is closed. You may be marked absent automatically.</p>
                      )}
                    </>
                  )}
                </div>
              )}

              {todayState.record?.reason && todayState.record.reason !== ATTENDANCE_REASON.OUTSIDE_LOCATION && (
                <p className="mt-2 text-xs text-slate-400">{getReasonLabel(todayState.record.reason)}</p>
              )}
            </div>

            {/* Camera — compact, centred, fixed height */}
            <div className="card overflow-hidden p-0">
              <div className="border-b border-slate-100 px-5 py-3 flex items-center justify-between">
                <p className="section-label">Face Verification Camera</p>
                {cameraActive && (
                  <span className={faceDetected ? "status-chip status-chip-success" : "status-chip status-chip-warning"}>
                    {faceDetected ? "Face detected" : "Waiting for face"}
                  </span>
                )}
              </div>

              {/* Fixed-height camera box — not full-bleed aspect ratio */}
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
                    <p className="text-xs text-slate-500">Activates after location is confirmed inside the geofence.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Right sidebar ── */}
          <div className="space-y-5">

            {/* Action buttons */}
            <div className="card">
              <p className="section-label">Controls</p>
              <div className="mt-4 grid gap-3">
                {stage === "camera" ? (
                  <>
                    <button onClick={verifyAndSubmit} disabled={busy || !faceDetected} className="btn-primary w-full disabled:opacity-50">
                      {busy ? "Submitting…" : "Verify face & submit"}
                    </button>
                    <button onClick={resetFlow} className="btn-secondary w-full">
                      Cancel verification
                    </button>
                  </>
                ) : (
                  <button onClick={startAttendanceFlow} disabled={isDisabled} className="btn-primary w-full disabled:opacity-50">
                    {busy ? "Processing…"
                      : todayState.status === ATTENDANCE_STATUS.PRESENT ? "Attendance completed"
                      : todayState.cutoffPassed ? "Attendance window closed"
                      : isWindowWaiting ? `Opens at ${formatTime12h(windowInfo?.startTime)}`
                      : "Start attendance"}
                  </button>
                )}
              </div>
            </div>

            {/* Location reading */}
            <div className="card overflow-hidden p-0">
              <div className="border-b border-slate-100 px-5 py-3">
                <p className="section-label">Current Location Reading</p>
              </div>
              <div className="divide-y divide-slate-100">
                {locationPayload ? (
                  <>
                    <div className="flex items-center justify-between px-5 py-3 text-sm">
                      <span className="text-slate-500">Latitude</span>
                      <span className="font-medium text-slate-900">{locationPayload.latitude.toFixed(6)}</span>
                    </div>
                    <div className="flex items-center justify-between px-5 py-3 text-sm">
                      <span className="text-slate-500">Longitude</span>
                      <span className="font-medium text-slate-900">{locationPayload.longitude.toFixed(6)}</span>
                    </div>
                    <div className="flex items-center justify-between px-5 py-3 text-sm">
                      <span className="text-slate-500">GPS Accuracy</span>
                      <span className="font-medium text-slate-900">
                        {locationPayload.accuracy != null ? `${Math.round(locationPayload.accuracy)} m` : "—"}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="px-5 py-4 text-sm text-slate-400">No location captured yet.</p>
                )}
                {todayState.record?.distanceMeters != null && (
                  <div className="flex items-center justify-between px-5 py-3 text-sm">
                    <span className="text-slate-500">Distance from geofence</span>
                    <span className="font-medium text-slate-900">{todayState.record.distanceMeters} m</span>
                  </div>
                )}
              </div>
            </div>

            {/* Verification rules */}
            <div className="card overflow-hidden p-0">
              <div className="border-b border-slate-100 px-5 py-3">
                <p className="section-label">Verification Rules</p>
              </div>
              <ul className="divide-y divide-slate-100">
                {[
                  "Blocked immediately if outside the configured geofence.",
                  "Low-accuracy, stale, or tampered GPS payloads are rejected.",
                  "Outside-location attempts are saved as absent records.",
                  "Returning inside the geofence allows a fresh retry.",
                  "Camera requires a secure URL and browser camera permission.",
                  "Use a GPS-enabled device or move near a window for best accuracy.",
                ].map((rule, i) => (
                  <li key={i} className="flex items-start gap-3 px-5 py-3 text-xs text-slate-500">
                    <span className="mt-0.5 flex-shrink-0 h-4 w-4 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400">{i + 1}</span>
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