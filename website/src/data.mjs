// Site content. Each list generates pages (machines, features, comparisons, guides).
// Competitor facts: only what was checked on the official pages in Oct 2026 (see `sources`).

export const site = {
  name: "CarvCAM",
  // TODO: final domain.
  // Netlify sets URL during the build (the site's primary address); outside it, the final domain.
  url: (process.env.SITE_URL || process.env.URL || "https://www.carvcam.com").replace(/\/$/, ""),
  download: "/download/",
  // Installers published by CI (desktop/, tag v*) under a fixed name on the latest GitHub
  // Release: the link always downloads the newest version, without changing the site on every release.
  downloads: {
    windows: "https://github.com/lecfmpp/carvcam/releases/latest/download/CarvCAM-Windows-64Bit.exe",
    appimage: "https://github.com/lecfmpp/carvcam/releases/latest/download/CarvCAM-Linux-x86_64.AppImage",
    deb: "https://github.com/lecfmpp/carvcam/releases/latest/download/CarvCAM-Linux-amd64.deb",
    // Raspberry Pi: 64-bit (Pi 4 and 5 on Raspberry Pi OS 64-bit) and 32-bit (armv7l)
    piDeb: "https://github.com/lecfmpp/carvcam/releases/latest/download/CarvCAM-Linux-arm64.deb",
    piAppImage: "https://github.com/lecfmpp/carvcam/releases/latest/download/CarvCAM-Linux-arm64.AppImage",
    pi32Deb: "https://github.com/lecfmpp/carvcam/releases/latest/download/CarvCAM-Linux-armv7l.deb",
    releases: "https://github.com/lecfmpp/carvcam/releases/latest",
  },
  checked: "October 2026",
};

// Supabase project for accounts. The publishable key is meant for browsers: row level security
// decides what each signed-in user can read or write.
export const supabase = {
  url: "https://zveqsvizefgbicwvjvdu.supabase.co",
  key: "sb_publishable_6Y4DigqN04BLaIEppjK8hQ_wHsIG9_g",
};

export const nav = [
  ["How it works", "/#how"],
  ["Features", "/features/"],
  ["Machines", "/machines/"],
  ["Compare", "/compare/"],
  ["Learn", "/learn/"],
  ["Docs", "/docs/"],
];

/* ---------------- Machines ---------------- */
export const machines = [
  {
    slug: "longmill-mk3",
    name: "LongMill MK3",
    status: "Current model",
    sizes: "30×30 and 48×30",
    work: "32 × 32 in or 49 × 32 in",
    controller: "SLB-LITE (grblHAL)",
    link: "USB-C",
    head: "AutoSpin T1 router (Makita and spindle kits also supported)",
    shot: "pick-machine",
    title: "LongMill MK3 Software: Design, Carve and Control in One App",
    description: "CarvCAM is desktop software for the LongMill MK3: design signs, get feeds tuned to your MK3 and AutoSpin, connect with a guided wiring check, and carve. Windows, works offline.",
    intro: "Your MK3 ships ready to cut. CarvCAM gets you from an idea to a finished sign on it without switching apps: the design, the toolpaths, the setup and the carve all happen in one window.",
    wiring: [
      "Power supply into the SLB-LITE, switch on, release the E-stop.",
      "AutoSpin T1: signal cable into the SPINDLE port (the phone-style jack), router in Spindle mode.",
      "USB-C from the controller straight into your computer.",
      "Connect in CarvCAM: it reads the controller, unlocks it and runs a 2 mm Z test and a 3 second spindle test.",
    ],
    presets: ["Work area and Z travel of the 30×30 and 48×30", "AutoSpin T1 speed range (10,000–30,000 RPM), set by the program", "Feeds and speeds for Sienci bits on your MK3"],
  },
  {
    slug: "altmill",
    name: "AltMill",
    status: "Current model",
    sizes: "2×4, 4×4 and 4×8",
    work: "49 × 25 in, 49 × 49 in or 49.8 × 104 in",
    controller: "SLB-EXT (grblHAL)",
    link: "USB-C or Ethernet",
    head: "2.2 kW or 1.5 kW ER20 spindle with VFD",
    shot: "connect-spindle",
    title: "AltMill CNC Software with Guided Setup and Machine-Tuned Feeds",
    description: "Connect, home and probe your AltMill step by step, then V-carve your first sign in the same app. CarvCAM knows the SLB-EXT, the spindle kit and your bed size.",
    intro: "The AltMill is built for production speed. CarvCAM keeps the software side just as quick: one app from layout to the last pass, with the spindle under program control and your full bed available.",
    wiring: [
      "48 V power supply into the SLB-EXT, switch on, release the E-stop.",
      "Spindle cable into the VFD; VFD data cable into the back of the controller, above the power switch.",
      "VFD on first (2.2 kW needs a 240 V outlet), then the controller.",
      "USB-C or Ethernet to your computer, then Connect: CarvCAM proves the Z moves and the spindle spins.",
    ],
    presets: ["2×4, 4×4 and 4×8 work areas", "ER20 spindle speed range (7,500–24,000 RPM) through the VFD", "Feeds and speeds for Sienci bits on the AltMill"],
  },
  {
    slug: "longmill-mk2",
    name: "LongMill MK2",
    status: "Still supported",
    sizes: "12×30, 30×30 and 48×30",
    work: "up to 48 × 30 in",
    controller: "LongBoard (grbl) or SuperLongBoard (grblHAL)",
    link: "USB (LongBoard), USB-C or Ethernet (SuperLongBoard)",
    head: "Makita RT0701C (AutoSpin and spindle kits also supported)",
    shot: "connect-power",
    title: "LongMill MK2 Software: Signs to G-code to Carving",
    description: "One app for LongMill MK2 owners on the LongBoard or SuperLongBoard: design, toolpaths, simulation and machine control. Tells you the Makita dial setting for every cut.",
    intro: "Thousands of MK2s are still carving. CarvCAM supports both of its controllers and the classic Makita router, including the one thing a manual router needs: the dial number for each cut, shown before you start.",
    wiring: [
      "24 V power supply into the LongBoard or SuperLongBoard.",
      "Makita: plugged into the wall, switch off until CarvCAM asks for it.",
      "USB cable straight into your computer (SuperLongBoard: USB-C or Ethernet).",
      "Connect in CarvCAM and pick your controller; no homing sensors? You set zero by hand.",
    ],
    presets: ["12×30, 30×30 and 48×30 work areas", "Makita dial number (1–6) for each operation", "Feeds and speeds for Sienci bits on your MK2"],
  },
];

/* ---------------- Features ---------------- */
export const features = [
  {
    slug: "v-carve",
    name: "V-carving",
    title: "V-Carve Software for Hobby CNC Signs",
    description: "Crisp V-carved letters with sharp corners: CarvCAM computes depth from the line width, adds depth passes, and checks your V-bit before you carve.",
    shot: "carved",
    lead: "V-carving is what makes a sign look professionally cut: deep where the letter is wide, sharp in the corners. CarvCAM does it from the same text you typed.",
    points: ["Depth follows the width of each stroke, so serifs and corners come out sharp", "Multiple passes when the V-bit would go too deep in one", "Flat-bottom warning when a stroke is wider than your bit can reach", "Works on text, shapes, imported SVG/DXF and traced images"],
  },
  {
    slug: "sign-design",
    name: "Sign design",
    title: "CNC Sign and Plaque Design Software",
    description: "Design signs and plaques where you carve them: fonts made for cutting, text on an arc, shapes, frames, a design element library and SVG/DXF import.",
    shot: "design",
    lead: "Design where you carve. The preview shows the wood already cut, so what you see is what comes off the machine.",
    points: ["Text in fonts made for carving, straight or on an arc", "Rectangles, circles, polygons, stars and free curves with a pen tool", "Frames, ornaments and icons already thick enough for a 1/8 in bit", "Import SVG and DXF; align, distribute, offset, subtract and mask"],
  },
  {
    slug: "image-to-vector",
    name: "Image to vector",
    title: "Image to Vector Trace for CNC Carving",
    description: "Turn a logo or drawing into carvable outlines inside your CNC app. Threshold, invert, smooth and ignore specks, with a live preview over your board.",
    shot: "image-to-vector",
    lead: "Got a logo as a JPG? Trace it into clean outlines right on the board, with a live preview, and carve it like any other shape.",
    points: ["Threshold slider with live preview", "Carve the dark parts or the light parts", "Smoothing and speck removal", "The result lands exactly over the image on your board"],
  },
  {
    slug: "feeds-and-speeds",
    name: "Feeds and speeds",
    title: "Automatic Feeds and Speeds for LongMill and AltMill Bits",
    description: "Pick Fast, Balanced or Detailed. CarvCAM sets feed, plunge, depth per pass and RPM for your machine, router or spindle, material and Sienci bit.",
    shot: "prepare",
    lead: "No feeds-and-speeds spreadsheet. Choose how fast you want the job, and CarvCAM fills in every number for your exact machine, router and bit.",
    points: ["Fast, Balanced or Detailed presets", "Values from Sienci's tables for your machine and bit", "Makita users get the dial number for each cut", "Estimated time before you start"],
  },
  {
    slug: "connect-wizard",
    name: "Connect wizard",
    title: "CNC Wiring and Connect Wizard: Power, E-stop, Spindle, USB",
    description: "A step-by-step map of every cable on your LongMill or AltMill, then a real test: the controller answers, the Z moves 2 mm and the spindle spins.",
    shot: "connect-power",
    lead: "Most first-day problems are cables. CarvCAM shows where each one goes for your machine, then proves the connection works before you touch a board.",
    points: ["Wiring map for your controller: power, E-stop, AutoSpin or VFD cable, USB or Ethernet", "One step at a time, with a check you confirm", "Automatic checks: controller answers, E-stop released, machine idle", "Live tests: 2 mm Z move and a 3 second spindle spin"],
  },
  {
    slug: "touch-plate-zero",
    name: "Homing and work zero",
    title: "Guided Homing, Touch Plate Probing and Work Zero",
    description: "Find home, clamp the board, measure the bit with the touch plate and set zero on the corner, guided on a live top view of your bed.",
    shot: "touch-plate",
    lead: "Positioning is where first carves go wrong. CarvCAM walks you through it on a live top view of your bed.",
    points: ["Find home with one click", "Minimum board size shown on the bed", "Touch plate probing with automatic retract", "Click the board corner to move there, then set zero"],
  },
  {
    slug: "simulation",
    name: "Simulation",
    title: "CNC Toolpath Simulation with Verified G-code",
    description: "See the finished piece before you carve: animated toolpaths, a 3D preview, and checks that the job fits your machine and board.",
    shot: "carving",
    lead: "Watch the bit cut the board on screen first. CarvCAM checks the job fits your machine and your board before it unlocks the carve.",
    points: ["Animated toolpath playback", "3D preview of the finished piece", "Checks size, depth and bits against your setup", "The same preview fills in live while the machine carves"],
  },
  {
    slug: "carve-control",
    name: "Carve control",
    title: "Run Your CNC from the Same App You Designed In",
    description: "Pause, resume, stop safely, adjust feed and spindle on the fly, guided bit changes and alarm recovery, without opening a separate sender.",
    shot: "carve-checklist",
    lead: "No exporting, no second program. Press Start in the app you designed in, and stay in control until the last pass.",
    points: ["Pre-carve checklist: size, zero, bit, speed, hold-down", "Pause with the space bar, stop with Esc", "Feed and spindle overrides from 50 to 150%", "Guided bit change with re-measuring; alarm screens that explain the fix"],
  },
];

/* ---------------- How-to guides ---------------- */
export const howtos = [
  {
    slug: "make-a-wooden-sign-with-a-cnc",
    title: "How to Make a Wooden Sign with a CNC (LongMill Step by Step)",
    short: "Make a wooden sign",
    description: "From blank board to finished sign on a LongMill or AltMill: design, pick a speed, set zero with the touch plate, carve and finish. With screenshots.",
    time: "PT45M",
    tools: ["LongMill or AltMill", "1/8 in flat end mill or 60° V-bit", "Touch plate", "A board, 3/4 in pine or MDF"],
    steps: [
      ["Design the sign", "Type your text, pick a font made for carving, and add a frame from the element library. Choose Engrave or V-carve for the letters.", "design"],
      ["Pick a speed", "In Prepare, choose Balanced. Check the board size, depth and estimated time in the summary.", "prepare"],
      ["Connect and home", "Open Connect, follow the cable checks, then click Find home so the machine knows where it is.", "connect-tests"],
      ["Clamp and zero", "Clamp the board, measure the bit with the touch plate and set zero on the bottom-left corner.", "work-zero"],
      ["Carve", "Tick the checklist and press Start. Pause with the space bar if you need to.", "carving"],
      ["Finish", "Vacuum the dust, cut the tabs if you cut the sign out, and sand with 120 then 220 grit.", "carved"],
    ],
    related: ["v-carve", "touch-plate-zero", "carve-control"],
  },
  {
    slug: "v-carve-a-house-number-plaque",
    title: "How to V-Carve a House Number Plaque on a CNC",
    short: "V-carve a house number plaque",
    description: "A step-by-step guide to a V-carved house number plaque: layout with text on an arc, V-bit setup, depth passes and finishing for outdoor use.",
    time: "PT60M",
    tools: ["60° or 90° V-bit", "Touch plate", "Hardwood or cedar board", "Exterior finish"],
    steps: [
      ["Lay out the plaque", "Add the house number in a bold font and the street name on an arc. Frame it with an oval or a double frame.", "design"],
      ["Set the letters to V-carve", "Select the text and choose V-carve. CarvCAM computes the depth from the stroke width.", "carved"],
      ["Check the preview", "Play the toolpath and look at the 3D view; fix any warning with one click.", "prepare"],
      ["Zero on the board", "Home, clamp, measure the V-bit with the touch plate and set zero.", "touch-plate"],
      ["Carve and finish", "Carve, then seal with an exterior finish so the plaque lasts outdoors.", "carving"],
    ],
    related: ["v-carve", "sign-design", "simulation"],
  },
  {
    slug: "set-work-zero-with-a-touch-plate",
    title: "How to Set Work Zero with a Touch Plate",
    short: "Set work zero with a touch plate",
    description: "Set X, Y and Z zero on a LongMill or AltMill with the touch plate: where the zero goes, how the probe works, and how to check it before carving.",
    time: "PT5M",
    tools: ["Touch plate with magnet clip", "Your bit installed"],
    steps: [
      ["Find home first", "Home the machine so every move afterwards is safe and inside the bed.", "position-home"],
      ["Clamp the board", "CarvCAM shows the minimum board size on the bed. Clamp anywhere it fits.", "position-clamp"],
      ["Measure the bit", "Clip the magnet to the bit, put the plate under it and click Measure height. The bit touches, records the height and lifts 5 mm.", "touch-plate"],
      ["Set X and Y", "Click the board corner on screen to move there, fine-tune with the arrow keys, then Set zero here.", "work-zero"],
    ],
    related: ["touch-plate-zero", "carve-control"],
  },
  {
    slug: "connect-a-longmill-or-altmill",
    title: "How to Connect a LongMill or AltMill to Your Computer",
    short: "Connect your machine",
    description: "Where each cable goes on the LongBoard, SuperLongBoard, SLB-EXT and SLB-LITE, and how to prove the connection works before your first carve.",
    time: "PT10M",
    tools: ["Your controller and power supply", "USB cable that carries data (or Ethernet)", "Router or spindle"],
    steps: [
      ["Power the controller", "Switch off, plug the power supply in (red on top), plug into the wall, switch on.", "connect-power"],
      ["Release the E-stop", "Press the red button and twist it clockwise until it pops up and lights.", "connect-power"],
      ["Connect the router or spindle", "AutoSpin: signal cable into the SPINDLE port. Spindle kit: VFD data cable into the back of the controller. Makita: wall outlet only.", "connect-spindle"],
      ["Plug in USB or Ethernet", "Use the cable that came with the machine, straight into the computer. Ethernet: controller at 192.168.5.1.", "connect-ethernet"],
      ["Connect and test", "Pick the controller in the list, press Connect, unlock, then run the 2 mm Z test and the spindle test.", "connect-tests"],
    ],
    related: ["connect-wizard"],
  },
  {
    slug: "recover-from-a-cnc-alarm",
    title: "How to Recover from a CNC Alarm (Grbl) Without Ruining the Job",
    short: "Recover from an alarm",
    description: "What door, limit, E-stop, position-lost and probe alarms mean on a LongMill or AltMill, and how to resume the operation safely.",
    time: "PT5M",
    tools: ["Your machine connected in CarvCAM"],
    steps: [
      ["Read the alarm screen", "CarvCAM names the alarm in plain words (door, travel limit, E-stop, position lost, touch plate) and keeps your job.", "carve-checklist"],
      ["Fix the cause", "Close the door, release the E-stop, clip the magnet, or check the board fits the bed.", "connect-tests"],
      ["Unlock and home if asked", "Limit, E-stop and position-lost alarms need a new home so moves are safe again.", "position-home"],
      ["Restart the operation", "CarvCAM lifts to safe height, restarts the spindle, returns over the last point and continues from the start of that operation.", "carving"],
    ],
    related: ["carve-control"],
  },
];

/* ---------------- FAQ (home) ---------------- */
export const faq = [
  ["Which machines does CarvCAM support?", "Sienci Labs LongMill MK2 (LongBoard or SuperLongBoard), LongMill MK3 (SLB-LITE) and AltMill 2×4, 4×4 and 4×8 (SLB-EXT), with the Makita, AutoSpin T1 or ER20 spindle kits."],
  ["Do I still need gSender or another sender?", "No. CarvCAM connects to the controller and runs the job itself. You can still export the G-code file if you want to."],
  ["Which computers can run it?", "Windows 10 and 11, and Linux (AppImage or .deb for Ubuntu, Debian and Mint). Raspberry Pi (64-bit and 32-bit). The Mac version is coming soon."],
  ["Does it need internet?", "Only to download it. After that it runs entirely on your computer, workshop Wi-Fi or not."],
  ["Can I import my own designs?", "Yes: SVG and DXF files, and images you can trace into outlines."],
  ["Do I need to know G-code or feeds and speeds?", "No. Pick Fast, Balanced or Detailed and CarvCAM sets the numbers for your machine, router and bit, then checks the job before you carve."],
];
