// Generates a lightweight, valid local WebM video blob on the fly using standard Web APIs
// Ensures native video playback, controls, pausing and navigation testing work 100% locally without external files.

let cachedVideoUrl: string | null = null;

export async function getLocalPlayableVideoBlobUrl(): Promise<string> {
  if (cachedVideoUrl) {
    return cachedVideoUrl;
  }

  return new Promise((resolve) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');

      if (!ctx || typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
        resolve('');
        return;
      }

      const stream = canvas.captureStream(30); // 30 fps
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        cachedVideoUrl = URL.createObjectURL(blob);
        resolve(cachedVideoUrl);
      };

      recorder.start();

      let frame = 0;
      const totalFrames = 60; // 2 seconds

      const interval = setInterval(() => {
        // Draw soothing ambient moving shapes
        ctx.fillStyle = '#2A3B32';
        ctx.fillRect(0, 0, 640, 360);

        ctx.fillStyle = '#52664F';
        ctx.beginPath();
        ctx.arc(320 + Math.sin(frame * 0.1) * 80, 180 + Math.cos(frame * 0.1) * 30, 60, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#E6ECE5';
        ctx.font = 'bold 24px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('MemoryFlow Local Demo Video', 320, 180);

        ctx.font = '14px -apple-system, sans-serif';
        ctx.fillText(`Frame ${frame + 1} / ${totalFrames} • Native Playback`, 320, 210);

        frame++;
        if (frame >= totalFrames) {
          clearInterval(interval);
          recorder.stop();
        }
      }, 33);
    } catch {
      resolve('');
    }
  });
}
