// AI Proctoring placeholder - implementation will be added in later steps.
export const DEFAULT_CAMERA_CONSTRAINTS = Object.freeze({
  video: {
    width: { ideal: 424, max: 640 },
    height: { ideal: 240, max: 480 },
    frameRate: { ideal: 12, max: 15 },
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
  videoElement.autoplay = true;
  videoElement.setAttribute?.('muted', '');
  videoElement.setAttribute?.('playsinline', '');
  videoElement.setAttribute?.('autoplay', '');

  if (typeof videoElement.play === 'function') {
    try {
      await videoElement.play();
    } catch {
      // Mobile browsers may require the assessment-start gesture before play.
    }
  }

  await waitForVideoFrame(videoElement);
}

export function waitForVideoFrame(videoElement, timeoutMs = 3000) {
  if (!videoElement) return Promise.resolve(false);
  const isReady = () => videoElement.readyState >= 2
    && videoElement.videoWidth > 0
    && videoElement.videoHeight > 0;
  if (isReady()) return Promise.resolve(true);

  return new Promise((resolve) => {
    let timeoutId = null;
    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      videoElement.removeEventListener?.('loadeddata', handleReady);
      videoElement.removeEventListener?.('canplay', handleReady);
    };
    const handleReady = () => {
      if (!isReady()) return;
      cleanup();
      resolve(true);
    };

    videoElement.addEventListener?.('loadeddata', handleReady);
    videoElement.addEventListener?.('canplay', handleReady);
    timeoutId = setTimeout(() => {
      cleanup();
      resolve(isReady());
    }, timeoutMs);
  });
}
