import { useEffect, useRef } from "react";

interface Props {
  stream: MediaStream | null;
  isActive: boolean;
  isPaused: boolean;
}

/**
 * Real-time audio waveform visualizer using Web Audio API.
 * Shows animated bars that respond to audio input levels.
 */
export default function AudioVisualizer({ stream, isActive, isPaused }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!stream || !isActive || !canvasRef.current) {
      // Clear canvas when not active
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set up audio analysis
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.8;
    analyserRef.current = analyser;

    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const BAR_COUNT = 40;
    const BAR_GAP = 2;

    function draw() {
      animFrameRef.current = requestAnimationFrame(draw);

      const width = canvas.width;
      const height = canvas.height;
      ctx!.clearRect(0, 0, width, height);

      if (isPaused) {
        // Draw flat line when paused
        ctx!.fillStyle = "rgba(245, 158, 11, 0.3)";
        const barWidth = (width - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT;
        for (let i = 0; i < BAR_COUNT; i++) {
          const x = i * (barWidth + BAR_GAP);
          ctx!.fillRect(x, height / 2 - 1, barWidth, 2);
        }
        return;
      }

      analyser.getByteFrequencyData(dataArray);

      const barWidth = (width - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT;
      const step = Math.floor(bufferLength / BAR_COUNT);

      for (let i = 0; i < BAR_COUNT; i++) {
        // Average a few frequency bins per bar
        let sum = 0;
        for (let j = 0; j < step; j++) {
          sum += dataArray[i * step + j] || 0;
        }
        const avg = sum / step;

        // Normalize to 0-1 range with some minimum height
        const normalized = Math.max(0.05, avg / 255);
        const barHeight = normalized * height * 0.9;

        const x = i * (barWidth + BAR_GAP);
        const y = (height - barHeight) / 2;

        // Gradient color: green → teal → red based on level
        const hue = 160 - normalized * 120; // 160 (green) → 40 (orange/red)
        const saturation = 70 + normalized * 30;
        const lightness = 45 + normalized * 15;
        ctx!.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${0.6 + normalized * 0.4})`;

        // Draw rounded bar
        const radius = Math.min(barWidth / 2, 3);
        ctx!.beginPath();
        ctx!.roundRect(x, y, barWidth, barHeight, radius);
        ctx!.fill();
      }
    }

    draw();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      source.disconnect();
      audioCtx.close();
    };
  }, [stream, isActive, isPaused]);

  if (!isActive) return null;

  return (
    <div className="w-full max-w-xs mx-auto mt-4">
      <canvas
        ref={canvasRef}
        width={320}
        height={48}
        className="w-full h-12 rounded-lg"
      />
    </div>
  );
}
