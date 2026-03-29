const DEFAULT_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Kolkata";

const ATTENDANCE_STATUS = Object.freeze({
  PRESENT: "present",
  ABSENT: "absent",
});

const ATTENDANCE_REASON = Object.freeze({
  OUTSIDE_LOCATION: "outside_location",
  LOCATION_UNRELIABLE: "location_unreliable",
  LOCATION_STALE: "location_stale",
  LOCATION_TAMPERING: "location_tampering",
  AUTO_ABSENT: "auto_absent",
});

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getDateTimeParts(date = new Date(), timeZone = DEFAULT_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    now: date,
    timeZone,
  };
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const earthRadiusMeters = 6371e3;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;

  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const originLat = toRadians(lat1);
  const destinationLat = toRadians(lat2);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(originLat) * Math.cos(destinationLat) *
    Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getGeofenceConfig() {
  const latitude = toNumber(process.env.GEOFENCE_LAT);
  const longitude = toNumber(process.env.GEOFENCE_LNG);
  const radius = toNumber(process.env.GEOFENCE_RADIUS);
  const maxAccuracyMeters =
    toNumber(process.env.MAX_LOCATION_ACCURACY_METERS) ??
    Math.max(radius || 0, 120);
  const maxLocationAgeMs = Number.parseInt(process.env.MAX_LOCATION_AGE_MS || "120000", 10);

  return {
    latitude,
    longitude,
    radius,
    maxAccuracyMeters,
    maxLocationAgeMs: Number.isFinite(maxLocationAgeMs) ? maxLocationAgeMs : 120000,
    timeZone: DEFAULT_TIMEZONE,
  };
}

function validateLocationPayload(payload = {}, config = getGeofenceConfig()) {
  const latitude = toNumber(payload.latitude);
  const longitude = toNumber(payload.longitude);
  const accuracy = toNumber(payload.accuracy);
  const mocked = payload.mocked === true;
  const capturedAt = payload.capturedAt ? new Date(payload.capturedAt) : null;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return {
      ok: false,
      statusCode: 400,
      code: "invalid_coordinates",
      message: "Valid location coordinates are required.",
    };
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return {
      ok: false,
      statusCode: 400,
      code: "invalid_coordinates",
      message: "Location coordinates are outside the supported range.",
    };
  }

  if (mocked) {
    return {
      ok: false,
      statusCode: 403,
      code: ATTENDANCE_REASON.LOCATION_TAMPERING,
      message: "Location verification failed. Disable mock locations and try again.",
    };
  }

  if (accuracy !== null && (!Number.isFinite(accuracy) || accuracy <= 0)) {
    return {
      ok: false,
      statusCode: 400,
      code: "invalid_accuracy",
      message: "Location accuracy is invalid. Refresh GPS and try again.",
    };
  }

  if (accuracy !== null && accuracy > config.maxAccuracyMeters) {
    return {
      ok: false,
      statusCode: 403,
      code: ATTENDANCE_REASON.LOCATION_UNRELIABLE,
      message: "Location accuracy is too low. Move to an open area and try again.",
      detail: `Current accuracy: ${Math.round(accuracy)}m. Required: ${Math.round(config.maxAccuracyMeters)}m or better.`,
      accuracyMeters: Math.round(accuracy),
      requiredAccuracyMeters: Math.round(config.maxAccuracyMeters),
    };
  }

  if (capturedAt && Number.isNaN(capturedAt.getTime())) {
    return {
      ok: false,
      statusCode: 400,
      code: "invalid_timestamp",
      message: "Location timestamp is invalid.",
    };
  }

  if (capturedAt) {
    const ageMs = Date.now() - capturedAt.getTime();

    if (ageMs > config.maxLocationAgeMs || ageMs < -30000) {
      return {
        ok: false,
        statusCode: 403,
        code: ATTENDANCE_REASON.LOCATION_STALE,
        message: "Location is outdated. Refresh GPS and try again.",
      };
    }
  }

  return {
    ok: true,
    location: {
      latitude,
      longitude,
      accuracy,
      mocked,
      capturedAt,
    },
  };
}

module.exports = {
  ATTENDANCE_REASON,
  ATTENDANCE_STATUS,
  getDateTimeParts,
  getGeofenceConfig,
  haversineDistance,
  validateLocationPayload,
};
