// Advanced synthesizer for game sound effects using Web Audio API

type SoundType = 'BUY' | 'SELL' | 'MOON' | 'RUG' | 'CHAT' | 'HEARTBEAT' | 'EVENT';

const AudioContextClass = window.AudioContext
  || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
let ctx: AudioContext | null = null;

const initCtx = () => {
  if (!AudioContextClass) return null;
  if (!ctx) ctx = new AudioContextClass();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
};

// Helper to create white noise buffer
const createNoiseBuffer = () => {
  if (!ctx) return null;
  const bufferSize = ctx.sampleRate * 2; 
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
};

let noiseBuffer: AudioBuffer | null = null;

export const playSound = (type: SoundType) => {
  const audio = initCtx();
  if (!audio) return;
  if (!noiseBuffer) noiseBuffer = createNoiseBuffer();

  const now = audio.currentTime;

  switch (type) {
    case 'BUY':
      // Arcade "Power Up"
      const osc1 = audio.createOscillator();
      const gain1 = audio.createGain();
      osc1.type = 'square'; 
      osc1.frequency.setValueAtTime(880, now); 
      osc1.frequency.exponentialRampToValueAtTime(1760, now + 0.1); 
      gain1.gain.setValueAtTime(0.1, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc1.connect(gain1);
      gain1.connect(audio.destination);
      osc1.start(now);
      osc1.stop(now + 0.3);

      const osc2 = audio.createOscillator();
      const gain2 = audio.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1100, now); 
      osc2.frequency.exponentialRampToValueAtTime(2200, now + 0.1);
      gain2.gain.setValueAtTime(0.1, now);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc2.connect(gain2);
      gain2.connect(audio.destination);
      osc2.start(now);
      osc2.stop(now + 0.3);
      
      if (navigator.vibrate) navigator.vibrate(50);
      break;

    case 'SELL':
      // "Cha-Ching"
      const sOsc1 = audio.createOscillator();
      const sGain1 = audio.createGain();
      sOsc1.type = 'sine';
      sOsc1.frequency.setValueAtTime(2000, now);
      sGain1.gain.setValueAtTime(0.1, now);
      sGain1.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      sOsc1.connect(sGain1);
      sGain1.connect(audio.destination);
      sOsc1.start(now);
      sOsc1.stop(now + 0.1);

      const sOsc2 = audio.createOscillator();
      const sGain2 = audio.createGain();
      sOsc2.type = 'sine';
      sOsc2.frequency.setValueAtTime(4000, now + 0.1);
      sGain2.gain.setValueAtTime(0.1, now + 0.1);
      sGain2.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      sOsc2.connect(sGain2);
      sGain2.connect(audio.destination);
      sOsc2.start(now + 0.1);
      sOsc2.stop(now + 0.4);
      
      if (navigator.vibrate) navigator.vibrate(50);
      break;

    case 'MOON':
      // Rocket Launch
      const mOsc = audio.createOscillator();
      const mGain = audio.createGain();
      mOsc.type = 'sawtooth'; 
      mOsc.frequency.setValueAtTime(200, now);
      mOsc.frequency.exponentialRampToValueAtTime(2000, now + 2); 
      mGain.gain.setValueAtTime(0.1, now);
      mGain.gain.linearRampToValueAtTime(0.15, now + 1);
      mGain.gain.linearRampToValueAtTime(0, now + 2);
      mOsc.connect(mGain);
      mGain.connect(audio.destination);
      mOsc.start(now);
      mOsc.stop(now + 2);
      
      const noiseSrc = audio.createBufferSource();
      if (noiseBuffer) {
        noiseSrc.buffer = noiseBuffer;
      }
      const noiseGain = audio.createGain();
      const noiseFilter = audio.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(500, now);
      noiseFilter.frequency.linearRampToValueAtTime(3000, now + 2); 
      
      noiseSrc.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(audio.destination);
      
      noiseGain.gain.setValueAtTime(0.05, now);
      noiseGain.gain.linearRampToValueAtTime(0, now + 2);
      noiseSrc.start(now);
      noiseSrc.stop(now + 2);

      if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 500]);
      break;

    case 'RUG':
      // System Failure
      const rOsc = audio.createOscillator();
      const rGain = audio.createGain();
      rOsc.type = 'sawtooth';
      rOsc.frequency.setValueAtTime(500, now);
      rOsc.frequency.linearRampToValueAtTime(50, now + 1.5); 
      
      const lfo = audio.createOscillator();
      lfo.frequency.value = 20; 
      const lfoGain = audio.createGain();
      lfoGain.gain.value = 100; 
      lfo.connect(lfoGain);
      lfoGain.connect(rOsc.frequency);
      lfo.start(now);
      lfo.stop(now + 1.5);

      rGain.gain.setValueAtTime(0.2, now);
      rGain.gain.linearRampToValueAtTime(0, now + 1.5);
      
      rOsc.connect(rGain);
      rGain.connect(audio.destination);
      rOsc.start(now);
      rOsc.stop(now + 1.5);
      
      if (navigator.vibrate) navigator.vibrate([500, 200, 500]);
      break;

    case 'CHAT':
      // iOS-like "Glass/Tri-tone" notification
      // A clean, high-pitched sine wave with quick decay
      const cOsc = audio.createOscillator();
      const cGain = audio.createGain();
      
      // Use a triangle wave for a "bell" like quality, or sine for "glass"
      cOsc.type = 'sine'; 
      
      // E6 note (approx 1318Hz) - typical notification pitch
      cOsc.frequency.setValueAtTime(1000, now); 
      
      // Envelope: Fast attack, smooth decay
      cGain.gain.setValueAtTime(0, now);
      cGain.gain.linearRampToValueAtTime(0.1, now + 0.01); // Attack
      cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5); // Decay
      
      cOsc.connect(cGain);
      cGain.connect(audio.destination);
      
      cOsc.start(now);
      cOsc.stop(now + 0.5);
      break;
      
    case 'HEARTBEAT':
      // Low thud
      const hOsc = audio.createOscillator();
      const hGain = audio.createGain();
      hOsc.type = 'sine';
      hOsc.frequency.setValueAtTime(60, now); // Low frequency
      hOsc.frequency.exponentialRampToValueAtTime(40, now + 0.1); // Pitch drop
      
      hGain.gain.setValueAtTime(0.3, now);
      hGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15); // Short thud
      
      hOsc.connect(hGain);
      hGain.connect(audio.destination);
      
      hOsc.start(now);
      hOsc.stop(now + 0.15);
      break;

    case 'EVENT':
       // Alert
       const eOsc = audio.createOscillator();
       const eGain = audio.createGain();
       eOsc.type = 'square';
       eOsc.frequency.setValueAtTime(600, now);
       eOsc.frequency.setValueAtTime(800, now + 0.1);
       eGain.gain.setValueAtTime(0.1, now);
       eGain.gain.linearRampToValueAtTime(0, now + 0.3);
       eOsc.connect(eGain);
       eGain.connect(audio.destination);
       eOsc.start(now);
       eOsc.stop(now + 0.3);
       if (navigator.vibrate) navigator.vibrate(200);
       break;
  }
};
