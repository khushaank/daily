// Call play() in the click handler so mobile browsers can authorize playback.
// Reuse a small pool so consecutive check-ins don't cut each other's chimes off.
export function createSounds(AudioType = globalThis.Audio) {
  const sources = {complete:'./audio/complete.wav',tap:'./audio/tap.wav'};
  const pools = {};
  let cursor = 0;
  function pool(name) {
    if (!AudioType) throw Error('Audio playback is unavailable in this browser.');
    if (!pools[name]) pools[name] = Array.from({length:3}, () => {
      const audio = new AudioType(sources[name]);
      audio.preload = 'auto';
      audio.volume = name === 'tap' ? .25 : .7;
      return audio;
    });
    return pools[name];
  }
  return {
    preload() { try { pool('complete'); pool('tap'); } catch {} },
    stop() { Object.values(pools).flat().forEach(audio => { audio.pause(); audio.currentTime = 0; }); },
    play(name = 'complete') {
      try {
        const audio = pool(name)[cursor++ % 3];
        audio.currentTime = 0;
        return Promise.resolve(audio.play());
      } catch (error) { return Promise.reject(error); }
    }
  };
}
