/**
 * Tutorial videos per instruction. Paste the YouTube link into `url`, the time the instruction starts
 * into `start` ("m:ss") and, optionally, when it ends into `end`, so the player stops there.
 */
export interface Video { title: string; url: string; start: string; end?: string }

// Sienci Labs' own videos (youtube.com/@SienciLabs). Times come from the video's chapters, Sienci's docs
// or the transcript; "approx" marks times placed from the transcript (±10–20 s). Checked October 2026.
export const VIDEOS: Record<string, Video> = {
  // No Sienci video designs a sign in a tool like CarvCAM (theirs use VCarve), so this stays empty.
  'create-design':    { title: 'Design a sign',                           url: '', start: '0:00' },
  'prepare':          { title: 'Assign bits to toolpaths',                url: 'https://www.youtube.com/watch?v=fEaCbxw3s6I', start: '2:15', end: '4:40' },
  'position-connect': { title: 'Connect the machine',                     url: 'https://www.youtube.com/watch?v=w9mRrniH6S8', start: '1:17', end: '2:43' },
  'position-home':    { title: 'Home the machine',                        url: 'https://www.youtube.com/watch?v=w9mRrniH6S8', start: '3:25', end: '4:20' },
  'position-stock':   { title: 'Secure the board: tape, screws, clamps',  url: 'https://www.youtube.com/watch?v=xbVuRSMwJcI', start: '1:25', end: '2:12' }, // start approx
  'position-zero':    { title: 'Jog to the corner and zero X/Y',          url: 'https://www.youtube.com/watch?v=xbVuRSMwJcI', start: '2:12', end: '2:52' }, // end approx
  'position-probe':   { title: 'Probe with the AutoZero touch plate',     url: 'https://www.youtube.com/watch?v=I1EhAPNXdzQ', start: '0:20', end: '3:28' }, // start approx
  'carve-checklist':  { title: 'Safety check before you carve',           url: 'https://www.youtube.com/watch?v=w9mRrniH6S8', start: '0:49', end: '1:17' },
  'carve-running':    { title: 'Start the job and watch it carve',        url: 'https://www.youtube.com/watch?v=xbVuRSMwJcI', start: '3:33', end: '4:08' },
  'carve-toolchange': { title: 'Change the bit and re-zero Z only',       url: 'https://www.youtube.com/watch?v=fEaCbxw3s6I', start: '8:42', end: '9:46' },
  'carve-finishing':  { title: 'Take the finished part out',              url: 'https://www.youtube.com/watch?v=xbVuRSMwJcI', start: '4:08' },
  'alarm-door':       { title: 'Door opened during a carve',              url: '', start: '0:00' },
  'alarm-limit':      { title: 'Fix Alarm 1 and 2 (limits)',              url: 'https://www.youtube.com/watch?v=I1EhAPNXdzQ', start: '3:28', end: '4:27' },
  'alarm-estop':      { title: 'Recover from an emergency stop',          url: '', start: '0:00' },
  'alarm-lost':       { title: 'When the machine loses its position',     url: '', start: '0:00' },
  'alarm-probe':      { title: 'Fix probe Alarm 4 and 5',                 url: 'https://www.youtube.com/watch?v=I1EhAPNXdzQ', start: '4:27', end: '5:25' }, // end approx
  'surfacing':        { title: 'Surface the spoilboard',                  url: 'https://www.youtube.com/watch?v=w9mRrniH6S8', start: '12:22' },
};
