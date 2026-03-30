export const ATTENDANCE_STATUS = {
  PRESENT: "present",
  ABSENT: "absent",
  LEAVE: "leave",
  NOT_MARKED: "not_marked",
};

export const ATTENDANCE_REASON = {
  OUTSIDE_LOCATION: "outside_location",
  LOCATION_UNRELIABLE: "location_unreliable",
  LOCATION_STALE: "location_stale",
  LOCATION_TAMPERING: "location_tampering",
  AUTO_ABSENT: "auto_absent",
};

export function getStatusLabel(status) {
  switch (status) {
    case ATTENDANCE_STATUS.PRESENT:
      return "Present";
    case ATTENDANCE_STATUS.ABSENT:
      return "Absent";
    case ATTENDANCE_STATUS.LEAVE:
      return "Leave";
    default:
      return "Not Marked";
  }
}

export function getReasonLabel(reason) {
  switch (reason) {
    case ATTENDANCE_REASON.OUTSIDE_LOCATION:
      return "Outside Location";
    case ATTENDANCE_REASON.LOCATION_UNRELIABLE:
      return "Low GPS Accuracy";
    case ATTENDANCE_REASON.LOCATION_STALE:
      return "Stale GPS Reading";
    case ATTENDANCE_REASON.LOCATION_TAMPERING:
      return "Location Verification Failed";
    case ATTENDANCE_REASON.AUTO_ABSENT:
      return "Auto-Absent";
    default:
      return "";
  }
}

export function getStatusClasses(status) {
  switch (status) {
    case ATTENDANCE_STATUS.PRESENT:
      return "status-chip status-chip-success";
    case ATTENDANCE_STATUS.ABSENT:
      return "status-chip status-chip-danger";
    case ATTENDANCE_STATUS.LEAVE:
      return "status-chip bg-blue-100 text-blue-800 border-blue-200";
    default:
      return "status-chip status-chip-neutral";
  }
}

export function getReasonClasses(reason) {
  switch (reason) {
    case ATTENDANCE_REASON.OUTSIDE_LOCATION:
      return "status-chip status-chip-warning";
    case ATTENDANCE_REASON.LOCATION_UNRELIABLE:
    case ATTENDANCE_REASON.LOCATION_STALE:
    case ATTENDANCE_REASON.LOCATION_TAMPERING:
      return "status-chip status-chip-danger";
    case ATTENDANCE_REASON.AUTO_ABSENT:
      return "status-chip status-chip-neutral";
    default:
      return "status-chip status-chip-neutral";
  }
}

export function formatRecordSummary(record) {
  if (!record) {
    return "";
  }

  if (record.status === ATTENDANCE_STATUS.PRESENT) {
    return `Recorded at ${record.time}`;
  }

  if (record.reason === ATTENDANCE_REASON.OUTSIDE_LOCATION) {
    return "Latest attempt was outside the allowed location.";
  }

  return "Attendance not completed.";
}

export function getLocationErrorMessage(error) {
  if (!error) {
    return "Unable to retrieve your location.";
  }

  switch (error.code) {
    case 1:
      return "Location access was denied. Allow location permission and try again.";
    case 2:
      return "Unable to retrieve your location. Check GPS and try again.";
    case 3:
      return "Location request timed out. Move to an open area and try again.";
    default:
      return "Unable to retrieve your location.";
  }
}
