'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Circle, Download, Film, Square, TriangleAlert, Sparkles } from 'lucide-react';
import { GISFeature } from '../../types/gis';

type CaptureState = 'ready' | 'preparing' | 'exporting' | 'saving' | 'saved' | 'error';
type CaptureQuality = 'sd' | 'hd' | '4k';

const QUALITY_PRESETS: Record<CaptureQuality, { width: number; height: number; bitrate: number }> = {
  sd: { width: 854, height: 480, bitrate: 4_000_000 },
  hd: { width: 1920, height: 1080, bitrate: 20_000_000 },
  '4k': { width: 3840, height: 2160, bitrate: 70_000_000 },
};

interface RouteCaptureControlsProps {
  route: GISFeature;
}

const waitForMapIdle = (map: any, timeoutMs = 15_000) => new Promise<void>((resolve, reject) => {
  let timeout = 0;
  const finish = () => {
    window.clearTimeout(timeout);
    map.off('idle', finish);
    resolve();
  };
  timeout = window.setTimeout(() => {
    map.off('idle', finish);
    reject(new Error('the map took too long to finish drawing. try again when the map has loaded.'));
  }, timeoutMs);
  map.once('idle', finish);
  map.triggerRepaint();
});

const renderRouteFrame = (featureId: number, progress: number, elapsedMs: number) => new Promise<void>((resolve, reject) => {
  window.dispatchEvent(new CustomEvent('atlas:render-route-export-frame', {
    detail: { featureId, progress, elapsedMs, resolve, reject },
  }));
});

export const RouteCaptureControls: React.FC<RouteCaptureControlsProps> = ({ route }) => {
  const abortRef = useRef(false);
  const routeIdRef = useRef(route.id);
  const mountedRef = useRef(true);
  const [captureState, setCaptureState] = useState<CaptureState>('ready');
  const [captureQuality, setCaptureQuality] = useState<CaptureQuality>('hd');
  const [frameRate, setFrameRate] = useState<30 | 60>(60);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current = true;
      window.dispatchEvent(new CustomEvent('atlas:stop-route-animation'));
    };
  }, []);

  useEffect(() => {
    if (routeIdRef.current === route.id) return;
    routeIdRef.current = route.id;
    abortRef.current = true;
    window.dispatchEvent(new CustomEvent('atlas:stop-route-animation'));
    setCaptureState('ready');
    setProgress(0);
    setErrorMessage('');
  }, [route.id]);

  const startExport = async () => {
    setErrorMessage('');
    setProgress(0);
    abortRef.current = false;
    const map = (window as any).__map;
    const mapCanvas = map?.getCanvas?.() as HTMLCanvasElement | undefined;
    const preset = QUALITY_PRESETS[captureQuality];
    const settings = (route.props as any).routeAnimation || {};
    const durationSeconds = Math.min(300, Math.max(1, Number(settings.durationSeconds) || 12));
    const totalFrames = Math.max(1, Math.round(durationSeconds * frameRate));
    const expectedBytes = (preset.bitrate * durationSeconds) / 8;
    const baseName = route.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'route';

    if (!map || !mapCanvas || route.props.visible === 0) {
      setErrorMessage('show the route on the map before exporting it.');
      setCaptureState('error');
      return;
    }

    setCaptureState('preparing');
    let output: any = null;
    let oldPixelRatio: number | null = null;
    try {
      if (expectedBytes > 400 * 1024 * 1024) {
        throw new Error('this export would use too much browser memory. shorten the route or choose a lower quality.');
      }

      const { BufferTarget, CanvasSource, Output, Quality, WebMOutputFormat } = await import('mediabunny');
      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = preset.width;
      outputCanvas.height = preset.height;
      const outputContext = outputCanvas.getContext('2d', { alpha: false });
      if (!outputContext) throw new Error('could not prepare the video canvas.');

      const target = new BufferTarget();
      output = new Output({ format: new WebMOutputFormat(), target });
      const videoSource = new CanvasSource(outputCanvas, {
        codec: 'vp9',
        quality: new Quality({ bitrate: preset.bitrate }),
        latencyMode: 'quality',
      });
      output.addVideoTrack(videoSource, { frameRate });
      await output.start();

      await waitForMapIdle(map);
      oldPixelRatio = map.getPixelRatio?.() ?? window.devicePixelRatio ?? 1;
      const mapWidth = map.getContainer().clientWidth;
      if (!mapWidth) throw new Error('the map is not ready to export.');
      map.setPixelRatio(preset.width / mapWidth);
      await waitForMapIdle(map);
      if (mapCanvas.width < preset.width || mapCanvas.height < preset.height) {
        throw new Error('your graphics device cannot render this size. choose a lower video quality.');
      }

      window.dispatchEvent(new CustomEvent('atlas:play-route-animation', {
        detail: { featureId: route.id, ...settings, captureMode: true },
      }));
      await waitForMapIdle(map);
      setCaptureState('exporting');

      outputContext.imageSmoothingEnabled = true;
      outputContext.imageSmoothingQuality = 'high';
      for (let index = 0; index < totalFrames; index += 1) {
        if (abortRef.current) throw new DOMException('export cancelled', 'AbortError');
        const frameProgress = totalFrames === 1 ? 1 : index / (totalFrames - 1);
        const elapsedMs = (index / frameRate) * 1000;
        await renderRouteFrame(route.id, frameProgress, elapsedMs);

        const sourceWidth = mapCanvas.width;
        const sourceHeight = mapCanvas.height;
        const scale = Math.min(preset.width / sourceWidth, preset.height / sourceHeight);
        const drawWidth = sourceWidth * scale;
        const drawHeight = sourceHeight * scale;
        outputContext.fillStyle = '#05070b';
        outputContext.fillRect(0, 0, preset.width, preset.height);
        outputContext.drawImage(mapCanvas, (preset.width - drawWidth) / 2, (preset.height - drawHeight) / 2, drawWidth, drawHeight);

        await videoSource.add(index / frameRate, 1 / frameRate);
        if (index % Math.max(1, Math.floor(frameRate / 2)) === 0 || index === totalFrames - 1) {
          if (mountedRef.current) setProgress(Math.round(((index + 1) / totalFrames) * 100));
        }
      }

      videoSource.close();
      setCaptureState('saving');
      await output.finalize();
      const buffer = target.buffer;
      if (!buffer?.byteLength) throw new Error('video export produced an empty file.');
      const blob = new Blob([buffer], { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${baseName}-${captureQuality}.webm`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      if (mountedRef.current) setCaptureState('saved');
    } catch (error) {
      if (output) {
        try { await output.cancel(); } catch (_) {}
      }
      if (!(error instanceof DOMException && error.name === 'AbortError') && mountedRef.current) {
        setErrorMessage(error instanceof Error ? error.message.toLowerCase() : 'could not export this route.');
        setCaptureState('error');
      } else if (mountedRef.current) {
        setCaptureState('ready');
      }
    } finally {
      if (oldPixelRatio != null) {
        try {
          map.setPixelRatio(oldPixelRatio);
          await waitForMapIdle(map, 5000);
        } catch (_) {}
      }
      window.dispatchEvent(new CustomEvent('atlas:stop-route-animation'));
    }
  };

  const isBusy = captureState === 'preparing' || captureState === 'exporting' || captureState === 'saving';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div className="rounded-lg bg-sky-400/10 p-2 text-sky-300"><Film className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-white">capture the map</h4>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">export the route as a smooth video at the selected size and frame rate.</p>
        </div>
      </div>

      <fieldset disabled={isBusy} className="space-y-2 disabled:opacity-60">
        <legend className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-zinc-300"><Sparkles className="h-3.5 w-3.5 text-sky-300" /> video quality</legend>
        <div className="grid grid-cols-3 gap-2">
          {([
            { id: 'sd' as const, label: 'sd', detail: '480p · 4 mbps' },
            { id: 'hd' as const, label: 'hd', detail: '1080p · 20 mbps' },
            { id: '4k' as const, label: '4k', detail: '2160p · 70 mbps' },
          ]).map((option) => (
            <button key={option.id} type="button" aria-pressed={captureQuality === option.id} onClick={() => setCaptureQuality(option.id)} className={`rounded-xl border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${captureQuality === option.id ? 'border-sky-400 bg-sky-400/10 text-white' : 'border-white/10 bg-white/[0.02] text-zinc-300 hover:bg-white/5'}`}>
              <span className="block text-sm font-bold">{option.label}</span><span className="mt-0.5 block text-[10px] text-zinc-400">{option.detail}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center justify-between text-xs text-zinc-300">
        <span>frame rate</span>
        <div className="flex rounded-lg border border-white/10 p-0.5">
          {([30, 60] as const).map((rate) => (
            <button key={rate} type="button" disabled={isBusy} aria-pressed={frameRate === rate} onClick={() => setFrameRate(rate)} className={`rounded-md px-3 py-1.5 disabled:cursor-not-allowed ${frameRate === rate ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'}`}>{rate} fps</button>
          ))}
        </div>
      </div>

      {isBusy ? (
        <button type="button" onClick={() => { abortRef.current = true; }} disabled={captureState === 'saving'} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-100 disabled:opacity-50">
          {captureState === 'saving' ? <><Download className="h-4 w-4 animate-pulse" /> saving video</> : <><Square className="h-4 w-4 fill-current" /> cancel export</>}
        </button>
      ) : (
        <button type="button" onClick={startExport} disabled={route.props.visible === 0} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
          {captureState === 'saved' ? <><Download className="h-4 w-4" /> export again</> : <><Circle className="h-3.5 w-3.5 fill-current" /> export route video</>}
        </button>
      )}

      <p aria-live="polite" className="flex min-h-4 items-center justify-center gap-1.5 text-center text-xs text-zinc-400">
        {captureState === 'preparing' && 'preparing map and video encoder'}
        {captureState === 'exporting' && `rendering frames · ${progress}%`}
        {captureState === 'saving' && 'finishing video file'}
        {captureState === 'saved' && <><Download className="h-3.5 w-3.5" /> video saved</>}
        {captureState === 'ready' && `${captureQuality} · ${frameRate} fps`}
        {captureState === 'error' && <><TriangleAlert className="h-3.5 w-3.5 text-amber-400" /> {errorMessage}</>}
      </p>
    </div>
  );
};
