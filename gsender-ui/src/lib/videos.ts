/** Tutorial videos per instruction. Paste the YouTube link into `url` and the start time into `start` ("m:ss"). */
export interface Video { title: string; url: string; start: string }

export const VIDEOS: Record<string, Video> = {
  'create-design':      { title: 'Design a sign by chatting and editing', url: '', start: '0:00' },
  'prepare':            { title: 'Speed presets, tabs and a second bit',  url: '', start: '0:00' },
  'position-connect':   { title: 'Connect your machine',                 url: '', start: '0:00' },
  'position-home':      { title: 'Find machine home',                    url: '', start: '0:00' },
  'position-stock':     { title: 'Clamp the board',                      url: '', start: '0:00' },
  'position-zero':      { title: 'Set work zero on the corner',          url: '', start: '0:00' },
  'position-probe':     { title: 'Measure height with the touch plate',  url: '', start: '0:00' },
  'carve-checklist':    { title: 'Pre-carve checklist',                  url: '', start: '0:00' },
  'carve-running':      { title: 'What to watch while it carves',        url: '', start: '0:00' },
  'carve-toolchange':   { title: 'Change the bit mid-job',               url: '', start: '0:00' },
  'carve-finishing':    { title: 'Cut the tabs and sand the edges',      url: '', start: '0:00' },
  'alarm-door':         { title: 'Door opened during a carve',           url: '', start: '0:00' },
  'alarm-limit':        { title: 'Recover from a travel limit',          url: '', start: '0:00' },
  'alarm-estop':        { title: 'Recover from an emergency stop',       url: '', start: '0:00' },
  'alarm-lost':         { title: 'When the machine loses its position',  url: '', start: '0:00' },
  'alarm-probe':        { title: 'Touch plate did not make contact',     url: '', start: '0:00' },
  'surfacing':          { title: 'Surface your spoilboard',              url: '', start: '0:00' },
};
