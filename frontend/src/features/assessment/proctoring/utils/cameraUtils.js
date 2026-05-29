// AI Proctoring placeholder - implementation will be added in later steps.
export const DEFAULT_CAMERA_CONSTRAINTS = Object.freeze({
  video: {
    width: { ideal: 640 },
    height: { ideal: 480 },
    facingMode: 'user',
  },
  audio: false,
});

export async function requestCameraStream(constraints = DEFAULT_CAMERA_CONSTRAINTS) {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      throw new Error('Camera access requires HTTPS in production.');
    }
    throw new Error('Camera API is not available in this browser.');
  }

  return navigator.mediaDevices.getUserMedia(constraints);
}

export function stopCameraStream(stream) {
  if (!stream?.getTracks) return;
  stream.getTracks().forEach((track) => {
    if (typeof track.stop === 'function') track.stop();
  });
}

export async function attachStreamToVideo(videoElement, stream) {
  if (!videoElement || !stream) return;
  videoElement.srcObject = stream;
  videoElement.muted = true;
  videoElement.playsInline = true;

  if (typeof videoElement.play === 'function') {
    try {
      await videoElement.play();
    } catch {
      // Playback can be blocked until the assessment screen is visible.
    }
  }
}
