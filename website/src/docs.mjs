// Documentação (docs/): o manual do usuário v1.0 reescrito para a web, em páginas curtas de passo a passo.
// Cada página é uma lista de blocos:
//   ["p", texto]                       parágrafo
//   ["h2", título]                     seção (entra no "On this page")
//   ["steps", [[título, texto, print?], ...]]
//   ["callout", "tip" | "note" | "warn", título, texto]
//   ["table", [cabeçalhos], [[células], ...]]
//   ["shot", print, legenda]           print de assets/screens
//   ["clip", cena, legenda]            clipe em loop de assets/video/feature-<cena>.mp4
//   ["cards", [[título, texto, link], ...]]
// Texto aceita **negrito**, `código` e [link](/docs/pagina/).

export const docSections = [
  { name: "Get started", pages: ["quickstart", "install", "workshop", "how-it-works"] },
  { name: "Design", pages: ["create", "cut-styles", "text-shapes-library", "import-and-trace"] },
  { name: "Prepare", pages: ["prepare"] },
  { name: "Connect", pages: ["connect", "usb-or-ethernet", "longmill-mk3", "longmill-mk2", "altmill"] },
  { name: "Position & carve", pages: ["position", "carve", "bit-changes-and-alarms"] },
  { name: "Help", pages: ["safety", "troubleshooting"] },
];

export const docs = {
  quickstart: {
    title: "Quickstart: carve your first sign",
    nav: "Quickstart",
    description: "Go from a blank board to a carved sign on your LongMill or AltMill in about 15 minutes of setup. Five steps, with screenshots.",
    lead: "Five steps from a blank board to a carved sign. Each step links to the full page if you want more detail.",
    time: "PT15M",
    howto: true,
    blocks: [
      ["callout", "note", "Before you start", "You need CarvCAM installed, your machine assembled, a board clamped nearby, a bit in the router and the touch plate. No machine yet? Pick **Simulator** in step 3 and follow along."],
      ["clip", "hero", "The whole flow in 35 seconds."],
      [
        "steps",
        [
          ["Design the sign", "Open **Create**, click **+ Text** and type your words. Pick a font and drag **Letter height** until the text fills the board. See [The Create screen](/docs/create/).", "design"],
          ["Prepare the cut", "Click **Continue to Prepare** and choose **Balanced**. Check the time and the board size in the summary. See [Prepare the carve](/docs/prepare/).", "prepare"],
          ["Connect the machine", "Click **Not connected · Connect** at the top. Follow the cable checks, pick your controller and press **Connect**. The Z lifts 2 mm and the bit spins for 3 seconds to prove it works. See [Connect your machine](/docs/connect/).", "connect-tests"],
          ["Home, clamp and zero", "In **Position**, click **Find home**, clamp the board, measure the bit with the touch plate and set zero on the bottom-left corner. See [Home, clamp and set zero](/docs/position/).", "work-zero"],
          ["Carve", "Tick the checklist, put your glasses on and press **Start carving**. Space pauses, Esc stops. See [Run the carve](/docs/carve/).", "carving"],
        ],
      ],
      ["callout", "warn", "First time on this machine?", "Do an air cut first: set zero about 30 mm above the board and run a small job. Read the [first carve checklist](/docs/safety/)."],
      ["cards", [["Set up your workshop", "Tell CarvCAM your machine, router and bits.", "/docs/workshop/"], ["Cut styles", "Engrave, V-carve, raised, hatch and cutout.", "/docs/cut-styles/"], ["Troubleshooting", "Fixes for the most common problems.", "/docs/troubleshooting/"]]],
    ],
  },
  install: {
    title: "Install CarvCAM",
    nav: "Install",
    description: "How to download and install CarvCAM on Windows 10 or 11, open it for the first time, and use it offline.",
    lead: "CarvCAM runs on Windows 10 and 11. Mac and Linux versions are in development.",
    blocks: [
      ["h2", "What you need"],
      ["table", ["Item", "Requirement"], [["Computer", "Windows 10 or 11, 64-bit"], ["Internet", "Only to download and for the first start"], ["Connection to the machine", "The USB cable that came with your machine, or an Ethernet cable (SuperLongBoard and SLB-EXT)"]]],
      ["h2", "Install"],
      [
        "steps",
        [
          ["Download", "Go to the [download page](/download/) and click **Download for Windows**.", null],
          ["Run the installer", "Open the file you downloaded and follow the prompts. If Windows SmartScreen asks, click **More info**, then **Run anyway**.", null],
          ["Open CarvCAM", "Start CarvCAM from the Start menu. A short loading screen appears the first time.", "splash"],
        ],
      ],
      ["callout", "tip", "Works offline", "After the first start, CarvCAM opens and carves without internet. Your projects are saved on your computer."],
      ["callout", "note", "One program at a time", "Close gSender or any other program connected to your machine before you connect CarvCAM. Only one program can use the connection at a time."],
      ["cards", [["Next: set up your workshop", "Three questions about your machine, router and bits.", "/docs/workshop/"]]],
    ],
  },
  workshop: {
    title: "Set up your workshop",
    nav: "Set up your workshop",
    description: "Tell CarvCAM which LongMill or AltMill you have, what spins the bit and which bits you own, so it sets speeds and depths for your setup.",
    lead: "The first time you open CarvCAM, three short screens ask what you have. CarvCAM uses the answers to set speeds, depths and suggestions for your exact setup.",
    blocks: [
      [
        "steps",
        [
          ["Pick your machine", "Each card shows the work area, Z height and specs. Click yours: LongMill MK3, LongMill MK2 or AltMill, in the size you own.", "pick-machine"],
          ["Pick what spins the bit", "AutoSpin T1, Makita RT0701C or a spindle kit. CarvCAM shows the speed range, how speed is controlled and the collets.", "pick-router"],
          ["Tick the bits you own", "CarvCAM only suggests projects and cuts that use bits you have.", "pick-bits"],
        ],
      ],
      ["h2", "Change it later"],
      ["p", "Everything can be changed in **Settings › My machine**. Add or remove bits any time in **Workshop › Bits**, which also lists the bit specs and where to buy more."],
      ["shot", "bit-library", "Workshop › Bits: your bits and their specs."],
      ["cards", [["How CarvCAM works", "The four steps and how the parts connect.", "/docs/how-it-works/"], ["Quickstart", "Carve your first sign.", "/docs/quickstart/"]]],
    ],
  },
  "how-it-works": {
    title: "How CarvCAM works",
    nav: "How it works",
    description: "CarvCAM's four steps, Create, Prepare, Position and Carve, and how the app, the controller and the router connect.",
    lead: "Every job follows the same four steps, always in this order. They sit at the top of the screen, and each one unlocks only when the one before it is ready.",
    blocks: [
      ["table", ["Step", "What you do"], [["1 · Create", "Design the sign and see the carved result before you start"], ["2 · Prepare", "Pick a speed; CarvCAM makes the toolpaths and checks them"], ["3 · Position", "Connect, find home, clamp the board and set zero"], ["4 · Carve", "Watch the carve, pause, and change bits when asked"]]],
      ["shot", "workshop", "The Workshop: projects ready for your machine. The active machine and the connection status are at the top."],
      ["h2", "How the parts connect"],
      ["p", "CarvCAM runs on your computer and talks directly to your machine's controller over USB or Ethernet. The controller drives the motors and switches the router or spindle on and off."],
      ["table", ["Part", "Role"], [["CarvCAM", "Design, toolpaths and machine control"], ["Controller (LongBoard, SuperLongBoard, SLB-LITE, SLB-EXT)", "Runs the motors and reads the sensors"], ["Router or spindle", "Spins the bit; the AutoSpin and spindles get their speed from CarvCAM"], ["Touch plate", "Measures where the bit tip is"]]],
      ["callout", "tip", "No separate sender needed", "Because CarvCAM also runs the machine, you don't export G-code into another program. You can still download the G-code file if you want it."],
    ],
  },
  create: {
    title: "The Create screen",
    nav: "Create screen",
    description: "Design a sign in CarvCAM: tools on the left, the board in the middle, the selected item's options on the right, and live warnings when a detail is too fine for your bit.",
    lead: "Create is where you design. The preview shows the wood already carved, and CarvCAM warns you right away if something won't come out well.",
    blocks: [
      ["clip", "design", "Add text, pick a font and size it."],
      ["h2", "The layout"],
      ["table", ["Area", "What's there"], [["Left", "Tools: select, text, rectangle, circle, polygon, star, line, pen, import"], ["Middle", "The board, drawn as carved wood. Drag items to move them"], ["Right", "Board size, material and bit, then the options of the selected item"], ["Bottom", "The assistant: describe a change in plain words"]]],
      ["h2", "Make a sign in four steps"],
      [
        "steps",
        [
          ["Set the board", "In the right panel, set the material (MDF, pine…), thickness and size of the board.", null],
          ["Add text", "Click **+ Text**, then type in **Content**.", null],
          ["Pick a font and size", "Archivo Black is the easiest to carve. Drag **Letter height** to fill the board.", null],
          ["Check the status", "**Ready to carve** means it will cut cleanly. A warning tells you what to fix.", null],
        ],
      ],
      ["callout", "tip", "One-click fixes", "If a detail is thinner than the bit, or a hatch is tighter than the bit can cut, the panel says why and offers the fix, such as **Use 1/16″ bit**."],
      ["callout", "note", "Your work is saved", "Projects are saved on your computer as you go. Open CarvCAM again and you're where you left off."],
      ["cards", [["Cut styles", "Choose how each item is carved.", "/docs/cut-styles/"], ["Text, shapes and the library", "Everything you can put on the board.", "/docs/text-shapes-library/"]]],
    ],
  },
  "cut-styles": {
    title: "Cut styles",
    nav: "Cut styles",
    description: "Engrave, V-carve, raised, hatch and cutout with tabs: what each CarvCAM cut style does and when to use it.",
    lead: "Every item on the board gets a style. Pick it in the right panel under **Style**.",
    blocks: [
      ["table", ["Style", "What it does", "Use it for"], [["Engrave", "Cuts the shape down with a flat bottom", "Most text and icons"], ["V-carve", "A V-bit cuts sharp corners; depth follows the width", "Classic signs, fine serif letters"], ["Raised", "Cuts the background down so the design stands up", "Bold names and logos"], ["Hatch", "Fills an area with parallel lines", "Textured backgrounds"], ["Cutout", "Cuts the piece free from the board, with tabs that hold it", "The outline of the sign"]]],
      ["h2", "Depth"],
      ["p", "Each style has a **Depth** in millimeters. CarvCAM splits deep cuts into passes your bit can handle, based on the material."],
      ["h2", "Holding tabs"],
      ["p", "A cutout leaves small tabs so the piece doesn't move at the end. Set how many and how tall in **Prepare**. You cut them off after carving."],
      ["callout", "tip", "Which bit?", "Engrave, raised and cutout work with a 1/8″ flat end mill. V-carve needs a V-bit, such as the 60° V-bit."],
    ],
  },
  "text-shapes-library": {
    title: "Text, shapes and the element library",
    nav: "Text, shapes and library",
    description: "Add text with carving fonts, text on a curve, shapes, free curves and ready-made frames and icons sized for your bit.",
    lead: "Everything you can put on the board, and the fastest way to add it.",
    blocks: [
      ["table", ["Item", "What you can do"], [["Text", "Fonts made for carving; text can follow a curve with the **Curve** slider"], ["Shapes", "Rectangle, circle, polygon, star and line"], ["Pen", "Free curves, point by point"], ["Library", "Frames, ornaments and icons already sized for the bit"], ["Combine", "Outline around a shape, subtract one shape from another, mask"], ["Align", "Align and distribute several items at once"]]],
      ["h2", "Use the element library"],
      ["steps", [["Open the library", "In the right panel, click **Library**.", null], ["Pick an element", "Icons, nature, frames and dividers. One click places it on the board at the right size.", "element-library"], ["Adjust", "Drag to move, or set size and style in the panel.", null]]],
      ["callout", "tip", "Fonts that carve well", "**Archivo Black** is the easiest to cut. **Bebas Neue** is condensed. **Pacifico** is a script whose letters join; make it at least 30 mm tall with a 1/8″ bit."],
    ],
  },
  "import-and-trace": {
    title: "Import SVG or DXF and trace images",
    nav: "Import and trace images",
    description: "Bring in SVG or DXF drawings, place a photo underneath to trace over, or convert an image or logo to vectors automatically.",
    lead: "Bring your own artwork in three ways: import a drawing, trace over a photo, or let CarvCAM convert an image to vectors.",
    blocks: [
      ["h2", "Import a drawing"],
      ["p", "Click the import tool on the left, or **SVG / DXF file** in the panel, and choose the file. It lands on the board and can be styled like any other item."],
      ["h2", "Convert an image to vectors"],
      [
        "steps",
        [
          ["Add the image", "Open **Tracing image** in the panel and choose a photo or logo.", null],
          ["Adjust", "Move the contrast and smoothing sliders until the outline looks clean.", "image-to-vector"],
          ["Convert", "The drawing lands exactly on top of the image. Hide the image when you're done.", null],
        ],
      ],
      ["callout", "tip", "Best results", "High-contrast images work best: a dark logo on a white background, or a clear silhouette."],
    ],
  },
  prepare: {
    title: "Prepare the carve",
    nav: "Prepare",
    description: "Pick Fast, Balanced or Detailed, check the summary, play the toolpath and the 3D preview, and download the G-code if you want it.",
    lead: "Prepare turns the design into the path of the bit, with feeds and speeds for your machine, and checks the result before it lets you near the machine.",
    blocks: [
      ["clip", "prepare", "Play the toolpath and switch to 3D."],
      [
        "steps",
        [
          ["Pick a speed", "Fast, Balanced or Detailed (see the table below). Values come from Sienci's speed table for your machine.", null],
          ["Check the summary", "Operations, bits, depth, minimum board size and estimated time. **G-code verified** means the file passed CarvCAM's checks.", "prepare"],
          ["Preview", "**Play toolpath** animates the bit. **3D** shows the finished piece.", null],
          ["Continue", "**Continue to Position** takes you to the machine.", null],
        ],
      ],
      ["h2", "Which speed to use"],
      ["table", ["Option", "When to use it"], [["Fast", "Soft wood and simple shapes; the quickest carve"], ["Balanced", "Most signs: good finish in reasonable time"], ["Detailed", "Small letters and the cleanest finish"]]],
      ["h2", "Two bits"],
      ["p", "If fine details need a smaller bit, tick **Use the 1/16″ flat downcut for the fine detail**. CarvCAM engraves the details with it and the rest with the 1/8″ bit, and asks for the change in the middle of the carve."],
      ["callout", "note", "Want the file?", "**Download G-code (.nc)** saves the job to a file, for another sender or a USB stick."],
    ],
  },
  connect: {
    title: "Connect your machine",
    nav: "Connect wizard",
    description: "The CarvCAM connect wizard shows where each cable goes, connects over USB or Ethernet, and proves the machine responds with a Z move and a spindle test.",
    lead: "The connect wizard shows where every cable goes, connects, and proves that the machine really responds. Open it from **Not connected · Connect** at the top of the screen.",
    blocks: [
      ["callout", "warn", "Close other machine programs first", "Only one program can use the connection. If gSender is open, close it before connecting."],
      ["clip", "connect", "Cable by cable, then a real test."],
      [
        "steps",
        [
          ["Start", "The wizard already knows the controller that comes with your machine. Choose **Show me the cables**, or **Everything is already plugged in**.", "connect-start"],
          ["Follow the cable map", "A drawing of your setup is on the left. Each step says what to do, how to know it worked, and what to try if it didn't. Tick the confirmation to move on.", "connect-power"],
          ["Pick the controller", "It appears in the list a few seconds after you plug in the cable. Select it and click **Connect**.", "connect-port"],
          ["Prove it works", "CarvCAM checks the controller's reply. Then the Z lifts 2 mm and the bit spins for 3 seconds. Answer **Yes** to each. If the machine started locked, click **Unlock**.", "connect-tests"],
        ],
      ],
      ["h2", "Cable map colors"],
      ["table", ["Color", "Meaning"], [["Orange", "The cable to connect now"], ["Green", "Already connected"], ["Gray", "Next steps"]]],
      ["callout", "tip", "Next time is faster", "CarvCAM remembers your setup and goes straight to the connection. The cable map stays available."],
      ["cards", [["USB or Ethernet", "Which one to use and how to set up Ethernet.", "/docs/usb-or-ethernet/"], ["Your machine", "Wiring for LongMill MK3, MK2 and AltMill.", "/docs/longmill-mk3/"]]],
    ],
  },
  "usb-or-ethernet": {
    title: "USB or Ethernet",
    nav: "USB or Ethernet",
    description: "When to connect your LongMill or AltMill over USB or Ethernet, and how to set up a direct Ethernet connection to the SuperLongBoard or SLB-EXT.",
    lead: "USB is the simplest and works with every controller. Ethernet is for the SuperLongBoard and SLB-EXT, when the computer is far from the machine or USB keeps dropping.",
    blocks: [
      ["table", ["Cable", "Choose it when", "Controllers"], [["USB", "You're starting out, or for most shops: just plug it in", "All"], ["Ethernet", "The computer is far away, or USB disconnects", "SuperLongBoard, SLB-EXT"]]],
      ["h2", "Set up Ethernet"],
      [
        "steps",
        [
          ["Check the controller's address", "Connect once over USB and check the controller's IP address. The default is `192.168.5.1`.", null],
          ["Plug in the cable", "Connect the cable straight from the computer to the controller, with no router in between.", null],
          ["Set your computer's address", "In your network settings, give the Ethernet port the IP `192.168.5.5` and the subnet mask `255.255.255.0`.", null],
          ["Connect", "In the wizard, choose Ethernet, enter `192.168.5.1` and click **Connect**. The port on the controller shows a solid green light and a blinking yellow one.", "connect-ethernet"],
        ],
      ],
      ["callout", "warn", "Never use .1 on the computer", "The computer's address must be different from the controller's: any `192.168.5.x` except `.1`."],
    ],
  },
  "longmill-mk3": {
    title: "Set up a LongMill MK3",
    nav: "LongMill MK3",
    machine: "longmill-mk3",
    wiringTitles: ["Power", "AutoSpin T1", "USB-C to the computer", "Connect and test"],
    shot: ["connect-start", "The connect wizard knows the SLB-LITE and the AutoSpin T1 of your MK3."],
    description: "Wire and connect a LongMill MK3 with the SLB-LITE controller and AutoSpin T1 to CarvCAM, step by step.",
    lead: "The LongMill MK3 comes with the SLB-LITE controller and the AutoSpin T1. Connect it in this order.",
    blocks: [],
  },
  "longmill-mk2": {
    title: "Set up a LongMill MK2",
    nav: "LongMill MK2",
    machine: "longmill-mk2",
    wiringTitles: ["Power", "Makita router", "USB to the computer", "Connect"],
    shot: ["connect-power", "The power step of the connect wizard."],
    description: "Wire and connect a LongMill MK2 with the LongBoard or SuperLongBoard and a Makita router to CarvCAM, step by step.",
    lead: "The LongMill MK2 runs on the LongBoard or the SuperLongBoard, usually with the Makita RT0701C. Connect it in this order.",
    blocks: [["callout", "tip", "Makita speed", "The Makita's speed is set by hand on its dial. CarvCAM shows the dial number for each cut before it starts."]],
  },
  altmill: {
    title: "Set up an AltMill",
    nav: "AltMill",
    machine: "altmill",
    wiringTitles: ["Power", "Spindle and VFD", "Power order", "Connect and test"],
    shot: ["connect-spindle", "The spindle and VFD step of the connect wizard."],
    description: "Wire and connect an AltMill with the SLB-EXT controller and the ER20 spindle and VFD to CarvCAM, step by step.",
    lead: "The AltMill runs on the SLB-EXT with a 2.2 kW or 1.5 kW ER20 spindle and its VFD. Connect it in this order.",
    blocks: [["callout", "warn", "Power order", "Switch the VFD on before the controller. The 2.2 kW spindle needs a 240 V outlet."]],
  },
  position: {
    title: "Home, clamp and set zero",
    nav: "Home, clamp and zero",
    description: "Find home, clamp the board, measure the bit with the touch plate and set work zero on the bottom-left corner of the board, in four steps.",
    lead: "Position takes the machine from \"I don't know where I am\" to \"I know exactly where your board is\". The bed is on the left, seen from above; the four steps are on the right.",
    blocks: [
      [
        "steps",
        [
          ["Find home", "Click **Find home**. The machine moves to the back-right corner, touches its sensors and stops. It takes about 30 seconds; keep the bed clear.", "position-home"],
          ["Clamp the board", "The screen shows the minimum board size. Clamp it anywhere on the bed, with at least 10 mm of margin around the sign, and click **My board is clamped**.", "position-clamp"],
          ["Measure the bit", "Click **Use touch plate**. Put the magnet on the bit and the plate under it, then **Measure height**. The bit lowers until it touches, measures, and lifts 5 mm.", "touch-plate"],
          ["Set zero", "Click the bottom-left corner of the board on the screen, fine-tune with the arrows (PageUp and PageDown for Z), then **Set zero here**.", "work-zero"],
        ],
      ],
      ["callout", "note", "Where zero is", "On the bottom-left corner of the board, on its top face. The design is carved from there."],
      ["callout", "tip", "No limit switches?", "Click **My machine has no limit sensors** and move the bit to the board by hand with the arrows."],
    ],
  },
  carve: {
    title: "Run the carve",
    nav: "Run the carve",
    description: "The pre-carve checklist, what you can do during the carve (pause, stop, speed overrides) and how to finish the piece.",
    lead: "Before you start, a checklist has to turn green: size, zero, bit, speed and hold-down. Then you watch.",
    blocks: [
      ["clip", "carve", "Start, watch the live preview, and the finished piece."],
      ["steps", [["Check the list", "Fix anything marked. For the bit, confirm with **It's in** once it's installed.", "carve-checklist"], ["Start", "Glasses on, then **Start carving**.", null], ["Watch", "The preview carves on screen together with the machine. The panel shows progress, time left and the current operation.", "carving"]]],
      ["h2", "During the carve"],
      ["table", ["You want to", "Do this"], [["Pause", "Press the space bar or **Pause**. **Resume** continues from the same point"], ["Stop", "Press Esc or **Stop**. Everything stops safely and the position is kept"], ["Go faster or slower", "Move **Feed speed** or **Bit rotation**, from 50% to 150%"]]],
      ["h2", "Finish the piece"],
      ["steps", [["Clean up", "Vacuum the dust and lift the board off the bed.", "carved"], ["Cut the tabs", "Use a flush-cut saw or a utility knife and pop the piece out.", null], ["Sand", "Sand the edges and the tab marks with 120, then 220 grit.", null]]],
    ],
  },
  "bit-changes-and-alarms": {
    title: "Bit changes and alarms",
    nav: "Bit changes and alarms",
    description: "How CarvCAM guides a bit change in the middle of a job, and what to do after an alarm or a lost connection.",
    lead: "Two moments where CarvCAM stops and walks you through: a bit change and an alarm.",
    blocks: [
      ["h2", "Change bits mid-job"],
      ["steps", [["The carve waits", "When the next operation needs another bit, the machine stops and lifts. The screen shows which bit to put in.", null], ["Swap the bit", "Change it, then measure the new one with the touch plate when asked.", null], ["Continue", "CarvCAM restarts the spindle and carries on from the next operation.", null]]],
      ["h2", "After an alarm"],
      ["table", ["Alarm", "What happened", "What to do"], [["Limit", "The bit reached the edge of the machine", "Unlock, find home again and check that the board fits the work area"], ["Probe", "The bit lowered without touching the plate", "Put the magnet on the bit, the plate under it, and measure again"], ["E-stop", "The emergency stop was pressed", "Twist the E-stop to release it, then Unlock"], ["Lost connection", "The cable came out or the controller lost power", "CarvCAM shows it right away. Reconnect, home, and restart the operation"]]],
      ["callout", "note", "Where it restarts", "After an alarm, the operation restarts from its beginning, with the bit lifted to a safe height first."],
    ],
  },
  safety: {
    title: "Safety and your first carve",
    nav: "Safety",
    description: "Protective gear, a first-carve checklist with an air cut, and what to do when in doubt: stop first.",
    lead: "A CNC cuts wood, plastic and fingers the same way. Follow these rules every time, and with extra care on your first carves.",
    blocks: [
      ["table", ["Wear", "Why"], [["Safety glasses", "Always, even for an air cut"], ["Hearing protection", "Routers and dust collectors are loud"], ["Hair tied, no loose sleeves or gloves near the bit", "So nothing gets pulled in"], ["Stay at the machine, E-stop within reach", "For the whole carve"]]],
      ["h2", "First carve checklist"],
      ["checklist", ["Glasses and hearing protection on", "Other machine programs closed", "Connect wizard finished: the Z lifted and the spindle spun", "Find home: the machine went to the back-right corner", "Arrow keys: the screen follows the machine both ways", "Touch plate: the bit touched, stopped and lifted", "Air cut: zero about 30 mm above the board and run a small job", "During the air cut, test Pause, Resume and Stop", "Compare the movement with the preview: position and size", "Then cut a scrap piece and measure it"]],
      ["callout", "warn", "When in doubt, stop first", "Press **Esc** or **Stop**. If the machine doesn't stop, press the **E-stop**. Only carve again once you know what happened."],
    ],
  },
  troubleshooting: {
    title: "Troubleshooting",
    nav: "Troubleshooting",
    description: "Fixes for the most common CarvCAM problems: the controller isn't listed, the port is in use, the machine won't move, the spindle won't spin, probe and limit alarms, Ethernet.",
    lead: "The most common problems and how to fix each one.",
    faq: true,
    blocks: [
      ["qa", "The controller isn't in the list", "Check that it's on and the E-stop is released. Unplug the USB cable, wait 5 seconds and plug it back in. Try another USB port and a cable that carries data."],
      ["qa", "It says \"The port is in use\"", "Another program is using the machine. Close gSender or any other connected program and try again."],
      ["qa", "It connected, but the machine won't move", "It may have started locked: click **Unlock**. Check the E-stop (up and lit) and the motor cables."],
      ["qa", "The spindle doesn't spin in the test", "AutoSpin: check it's plugged in and in Spindle mode. VFD showing r00.0 or F00.0: check the data cable at the back of the controller, then power both off and on."],
      ["qa", "The touch plate gave an alarm", "The bit lowered without touching. Put the magnet on the bit, the plate under it, and measure again."],
      ["qa", "Limit alarm", "The bit reached the edge of the machine. Unlock, find home again and check that the board fits the work area."],
      ["qa", "Ethernet won't connect", "Check the port lights (solid green, blinking yellow), the computer's IP (`192.168.5.x`, never `.1`) and use a direct cable with no router."],
      ["qa", "Can I use CarvCAM without the machine?", "Yes. In the connect wizard, choose **Simulator**. Everything works the same and the carve only happens on screen."],
      ["callout", "note", "Still stuck?", "Read [Bit changes and alarms](/docs/bit-changes-and-alarms/) or go through [Connect your machine](/docs/connect/) again from the start."],
    ],
  },
};
