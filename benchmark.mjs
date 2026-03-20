/**
 * Particle Architect — Hand Tracking Performance Benchmark
 *
 * Measures FPS, frame times, and responsiveness across three phases:
 *   1. Baseline: particles only, no camera
 *   2. Camera idle: hand tracking enabled, no hand visible
 *   3. Camera active: hand tracking enabled, hand detected (simulated)
 *
 * Usage: node benchmark.mjs [--duration=10] [--label="baseline"]
 */

import { chromium } from 'playwright';

const args = process.argv.slice(2);
const DURATION = parseInt(args.find(a => a.startsWith('--duration='))?.split('=')[1] || '8') * 1000;
const LABEL = args.find(a => a.startsWith('--label='))?.split('=')[1] || 'current';

async function collectMetrics(page, phaseName, durationMs) {
  // Inject performance observer
  await page.evaluate((duration) => {
    window.__perfData = {
      frames: [],
      longTasks: 0,
      longTaskTotalMs: 0,
      memSnapshots: [],
      startTime: performance.now(),
    };

    // RAF-based frame timing
    let lastFrame = performance.now();
    function measureFrame() {
      const now = performance.now();
      const dt = now - lastFrame;
      lastFrame = now;
      window.__perfData.frames.push(dt);
      if (now - window.__perfData.startTime < duration) {
        requestAnimationFrame(measureFrame);
      }
    }
    requestAnimationFrame(measureFrame);

    // Long task observer
    if (window.PerformanceObserver) {
      try {
        const obs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 50) {
              window.__perfData.longTasks++;
              window.__perfData.longTaskTotalMs += entry.duration;
            }
          }
        });
        obs.observe({ entryTypes: ['longtask'] });
        window.__perfObs = obs;
      } catch(e) {}
    }

    // Memory snapshots every 500ms
    const memInterval = setInterval(() => {
      if (performance.memory) {
        window.__perfData.memSnapshots.push({
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
        });
      }
      if (performance.now() - window.__perfData.startTime >= duration) {
        clearInterval(memInterval);
      }
    }, 500);
  }, durationMs);

  // Wait for collection
  await page.waitForTimeout(durationMs + 500);

  // Harvest results
  const data = await page.evaluate(() => {
    if (window.__perfObs) window.__perfObs.disconnect();
    const d = window.__perfData;
    const frames = d.frames.slice(1); // drop first (warmup)
    if (frames.length === 0) return null;

    frames.sort((a, b) => a - b);
    const sum = frames.reduce((a, b) => a + b, 0);
    const avg = sum / frames.length;
    const fps = 1000 / avg;
    const p50 = frames[Math.floor(frames.length * 0.5)];
    const p95 = frames[Math.floor(frames.length * 0.95)];
    const p99 = frames[Math.floor(frames.length * 0.99)];
    const min = frames[0];
    const max = frames[frames.length - 1];
    const jank = frames.filter(f => f > 33.33).length; // frames below 30fps
    const severe = frames.filter(f => f > 100).length;  // frames below 10fps

    // Memory
    let memAvg = null, memMax = null;
    if (d.memSnapshots.length > 0) {
      const heaps = d.memSnapshots.map(m => m.usedJSHeapSize);
      memAvg = Math.round(heaps.reduce((a, b) => a + b, 0) / heaps.length / 1024 / 1024);
      memMax = Math.round(Math.max(...heaps) / 1024 / 1024);
    }

    return {
      totalFrames: frames.length,
      avgFps: Math.round(fps * 10) / 10,
      avgFrameTime: Math.round(avg * 100) / 100,
      p50: Math.round(p50 * 100) / 100,
      p95: Math.round(p95 * 100) / 100,
      p99: Math.round(p99 * 100) / 100,
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100,
      jankFrames: jank,
      jankPct: Math.round(jank / frames.length * 1000) / 10,
      severeFrames: severe,
      longTasks: d.longTasks,
      longTaskTotalMs: Math.round(d.longTaskTotalMs),
      memAvgMB: memAvg,
      memMaxMB: memMax,
    };
  });

  return { phase: phaseName, ...data };
}

async function run() {
  console.log(`\n🔬 Particle Architect Benchmark — "${LABEL}"`);
  console.log(`   Duration per phase: ${DURATION / 1000}s\n`);

  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--enable-precise-memory-info',
    ]
  });

  const context = await browser.newContext({ permissions: ['camera'] });
  const page = await context.newPage();

  // Collect console errors
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  console.log('Loading app...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000); // let WebGL settle

  // ─── Phase 1: Baseline (no camera) ───
  console.log('Phase 1: Baseline (particles only)...');
  const baseline = await collectMetrics(page, 'baseline', DURATION);

  // ─── Phase 2: Camera on, no hand visible ───
  console.log('Phase 2: Camera on, idle (no hand)...');
  const gestureBtn = page.locator('button[title="Toggle Gesture OS"]');
  if (await gestureBtn.count() > 0) {
    await gestureBtn.click();
    await page.waitForTimeout(2000); // let MediaPipe initialize
  }
  const cameraIdle = await collectMetrics(page, 'camera_idle', DURATION);

  // ─── Phase 3: Camera on, hand detected ───
  // With fake camera, MediaPipe may or may not detect a "hand" in the test pattern.
  // We measure whatever state the system is in with camera active.
  console.log('Phase 3: Camera active (processing frames)...');
  const cameraActive = await collectMetrics(page, 'camera_active', DURATION);

  // Turn off camera
  if (await gestureBtn.count() > 0) {
    await gestureBtn.click();
  }

  // ─── Phase 4: Recovery (camera off again) ───
  console.log('Phase 4: Recovery (camera off)...');
  await page.waitForTimeout(1000);
  const recovery = await collectMetrics(page, 'recovery', DURATION);

  await browser.close();

  // ─── Report ───
  const results = [baseline, cameraIdle, cameraActive, recovery].filter(Boolean);

  console.log('\n' + '═'.repeat(90));
  console.log(`  BENCHMARK RESULTS — "${LABEL}"  (${new Date().toISOString()})`);
  console.log('═'.repeat(90));

  // Header
  const cols = ['Metric', ...results.map(r => r.phase)];
  const colW = [22, ...results.map(() => 16)];
  console.log(cols.map((c, i) => c.padEnd(colW[i])).join('│'));
  console.log(colW.map(w => '─'.repeat(w)).join('┼'));

  // Rows
  const metrics = [
    ['Avg FPS', 'avgFps'],
    ['Avg Frame (ms)', 'avgFrameTime'],
    ['P50 Frame (ms)', 'p50'],
    ['P95 Frame (ms)', 'p95'],
    ['P99 Frame (ms)', 'p99'],
    ['Max Frame (ms)', 'max'],
    ['Jank Frames', 'jankFrames'],
    ['Jank %', 'jankPct'],
    ['Severe (>100ms)', 'severeFrames'],
    ['Long Tasks', 'longTasks'],
    ['Long Task (ms)', 'longTaskTotalMs'],
    ['Heap Avg (MB)', 'memAvgMB'],
    ['Heap Max (MB)', 'memMaxMB'],
    ['Total Frames', 'totalFrames'],
  ];

  for (const [label, key] of metrics) {
    const vals = results.map(r => {
      const v = r[key];
      return v !== null && v !== undefined ? String(v) : 'n/a';
    });
    console.log([label.padEnd(colW[0]), ...vals.map((v, i) => v.padEnd(colW[i + 1]))].join('│'));
  }

  console.log('═'.repeat(90));

  // Degradation analysis
  if (baseline && cameraIdle) {
    const fpsDrop = Math.round((1 - cameraIdle.avgFps / baseline.avgFps) * 1000) / 10;
    const p95Increase = Math.round((cameraIdle.p95 / baseline.p95 - 1) * 1000) / 10;
    console.log(`\n  Camera impact: ${fpsDrop}% FPS drop, ${p95Increase}% P95 increase`);
  }
  if (baseline && recovery) {
    const recoveryDelta = Math.round((recovery.avgFps / baseline.avgFps) * 1000) / 10;
    console.log(`  Recovery: ${recoveryDelta}% of baseline FPS`);
  }
  if (errors.length > 0) {
    console.log(`\n  ⚠ Page errors: ${errors.length}`);
    errors.forEach(e => console.log(`    - ${e.substring(0, 120)}`));
  }

  console.log('');

  // Output JSON for comparison
  const jsonOut = { label: LABEL, timestamp: Date.now(), phases: {} };
  for (const r of results) {
    jsonOut.phases[r.phase] = r;
  }
  const fs = await import('fs');
  const outFile = `benchmark-${LABEL}-${Date.now()}.json`;
  fs.writeFileSync(outFile, JSON.stringify(jsonOut, null, 2));
  console.log(`  Raw data saved to ${outFile}\n`);
}

run().catch(err => {
  console.error('Benchmark failed:', err.message);
  process.exit(1);
});
