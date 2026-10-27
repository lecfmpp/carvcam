import type { Family, HeadId } from "./catalog";

/**
 * Wiring guide for each Sienci controller, used by the "Connect" assistant. Sources: the
 * SuperLongBoard (SLB/SLB-EXT), SLB-LITE, AutoSpin T1 and spindle kit manuals on resources.sienci.com
 * (checked Oct 2026).
 */
export type ControllerId = "slb-lite" | "slb" | "slb-ext" | "longboard";
export type Link = "usb" | "ethernet";
export type Port = "power" | "estop" | "spindle" | "rs485" | "usb" | "ethernet" | "outlet";

export interface ControllerInfo {
  id: ControllerId;
  name: string;
  firmware: string;
  /** Voltage of the power supply that ships with the controller, when Sienci lists it. */
  psu?: string;
  usb: string;
  ethernet: boolean;
  /** How to switch the controller on and off. */
  switchOn: string;
  /** Signs that the controller is powered. */
  powerLights: string;
  estop: boolean;
}

export const CONTROLLERS: Record<ControllerId, ControllerInfo> = {
  "slb-lite": {
    id: "slb-lite",
    name: "SLB-LITE",
    firmware: "grblHAL",
    usb: "USB-C",
    ethernet: false,
    switchOn: "Flip the power switch on the controller to ON.",
    powerLights: "The status light on the controller turns on.",
    estop: true,
  },
  slb: {
    id: "slb",
    name: "SuperLongBoard (SLB)",
    firmware: "grblHAL",
    psu: "24 V",
    usb: "USB-C",
    ethernet: true,
    switchOn: "Slide the power switch above the power plug down to ON (up is OFF).",
    powerLights: "Two small green lights come on inside the box (5 V and 3.3 V).",
    estop: true,
  },
  "slb-ext": {
    id: "slb-ext",
    name: "SLB-EXT",
    firmware: "grblHAL",
    psu: "48 V",
    usb: "USB-C",
    ethernet: true,
    switchOn: "Slide the power switch above the power plug down to ON (up is OFF).",
    powerLights: "Two small green lights come on inside the box (5 V and 3.3 V).",
    estop: true,
  },
  longboard: {
    id: "longboard",
    name: "LongBoard",
    firmware: "grbl",
    psu: "24 V",
    usb: "USB",
    ethernet: false,
    switchOn: "Turn on the switch on the power supply.",
    powerLights: "The power light on the LongBoard turns on.",
    estop: false,
  },
};

/** Controller that ships with each family. The LongMill MK2 may have either one: the user picks. */
export function controllersFor(family: Family): ControllerId[] {
  if (family === "AltMill") return ["slb-ext"];
  if (family === "LongMill MK3") return ["slb-lite"];
  return ["longboard", "slb"];
}

export interface Step {
  id: string;
  title: string;
  /** One sentence of context above the list. */
  lead: string;
  /** Actions, in order. */
  do: string[];
  /** How to tell it worked (the user ticks each one). */
  check: string[];
  /** Ports the illustration highlights in this step. */
  ports: Port[];
  /** If it didn't work. */
  help: string[];
  /** Safety warning, if any. */
  caution?: string;
}

/** Wiring steps for the machine + controller + router/spindle + cable combination. */
export function wiringSteps(c: ControllerInfo, head: HeadId, link: Link): Step[] {
  const steps: Step[] = [];

  steps.push({
    id: "power",
    title: "Power the controller",
    lead: `The ${c.name} is the box that drives the motors. It needs power before the computer can see it.`,
    do: [
      c.id === "longboard" ? "Make sure the power supply is switched off." : "Make sure the controller's power switch is OFF.",
      `Plug the power supply${c.psu ? ` (${c.psu})` : ""} into the controller's power input. The red (+) wire goes on top.`,
      "Plug the power supply into a wall outlet.",
      c.switchOn,
    ],
    check: [c.powerLights],
    ports: ["power", "outlet"],
    help: [
      "Check the outlet works with a lamp or phone charger.",
      "Unplug and firmly re-seat the power connector on the controller.",
      c.id === "longboard" ? "Look for a blown fuse or a loose wire on the power supply terminals." : "Keep the switch OFF while you plug or unplug the power cable.",
    ],
  });

  if (c.estop)
    steps.push({
      id: "estop",
      title: "Release the emergency stop",
      lead: "The machine always starts locked, so it can't move by surprise after a power cut.",
      do: ["Check the E-stop cable is plugged into the controller.", "Press the big red button, then twist it clockwise until it pops up."],
      check: ["The E-stop button lights up."],
      ports: ["estop"],
      help: [
        "If the light stays off, re-seat the E-stop plug on the controller.",
        "If the button won't latch or pop up, it may be damaged. Sienci replaces it under warranty.",
      ],
    });

  steps.push(headStep(c, head));

  if (link === "usb")
    steps.push({
      id: "usb",
      title: "Plug in the USB cable",
      lead: `This is how CarvCAM talks to the machine. ${c.id === "longboard" ? "" : "USB is the easiest way to start, and it's needed for firmware updates."}`.trim(),
      do: [
        `Plug the ${c.usb} cable into the ${c.id === "longboard" ? "LongBoard" : "front of the controller"}.`,
        "Plug the other end straight into the computer, not through a hub if you can avoid it.",
        "Use the cable that came with the machine. Many phone cables only charge and can't carry data.",
      ],
      check: ["The computer made its 'device connected' sound, or nothing complained."],
      ports: ["usb"],
      help: [
        "Try a different USB port on the computer.",
        "Swap the cable for one you know transfers data.",
        "On a Mac with only USB-C ports, use a USB-C to USB-C cable or a simple adapter.",
        "Keep the USB cable away from the router or spindle power cord to avoid electrical noise.",
      ],
    });
  else
    steps.push({
      id: "ethernet",
      title: "Plug in the Ethernet cable",
      lead: "Ethernet is more robust over long distances. Set it up once over USB, then switch.",
      do: [
        "Connect over USB first and check the controller's IP. The default is 192.168.5.1 (netmask 255.255.255.0).",
        "Run an Ethernet cable straight from the computer to the controller, not through your home router.",
        "Give the computer's Ethernet port a fixed address in the same range, for example 192.168.5.5 with netmask 255.255.255.0.",
        "On a Mac without an Ethernet port, use a USB-C to Ethernet adapter.",
      ],
      check: ["On the controller's Ethernet port, a green light is on and a yellow light flickers."],
      ports: ["ethernet"],
      help: [
        "If the lights stay off, try another cable or adapter.",
        "Check the computer's address starts with 192.168.5. and isn't 192.168.5.1 (that's the controller).",
        "Reconnect over USB to confirm the controller's IP settings.",
      ],
    });

  return steps;
}

function headStep(c: ControllerInfo, head: HeadId): Step {
  const slbInside = c.id === "slb" || c.id === "slb-ext";
  if (head === "makita-rt0701")
    return {
      id: "head",
      title: "Router power",
      lead: "The Makita has no data cable. You switch it on by hand and set its speed on the dial. CarvCAM tells you which number before each cut.",
      do: [
        "Keep the router's switch OFF for now.",
        "Plug the router's power cord into a wall outlet, or into the power relay if your machine has one.",
        "Route the cord through the drag chain so it can't catch on the gantry.",
      ],
      check: ["The router is plugged in and its switch is OFF."],
      ports: ["outlet"],
      help: ["If you use a relay, make sure the relay itself is plugged into the outlet and into the controller."],
    };
  if (head === "autospin-t1")
    return {
      id: "head",
      title: "AutoSpin signal cable",
      lead: "The AutoSpin gets its on/off and speed from the controller through a small signal cable.",
      do: [
        "Turn the controller OFF and keep the AutoSpin unplugged from the wall.",
        "Connect the signal pigtail to the signal cable coming out of the router.",
        c.id === "slb-lite"
          ? "Plug the pigtail into the SPINDLE port (the phone-style RJ12 jack) on the controller."
          : slbInside
            ? "Open the controller cover (thumbscrew, then slide right). Replace the plug on the SPINDLE port with the 5-pin plug from the pigtail."
            : "Connect the pigtail to the spindle (PWM) output of your controller.",
        "Close the controller, turn it back ON, then plug the AutoSpin into the wall.",
        "Set the AutoSpin to Spindle mode so the program controls it.",
      ],
      check: ["The signal cable is clicked in and the AutoSpin is in Spindle mode."],
      ports: ["spindle"],
      help: [
        "The first time, gSender's Config › Spindle/Laser › Setup AutoSpin writes the controller settings. Then turn the controller off and on.",
        "If it doesn't respond, unplug and re-seat the signal cable at both ends.",
      ],
    };
  // Spindle kits with a VFD.
  const big = head === "spindle-2-2kw-er20";
  return {
    id: "head",
    title: "Spindle and VFD",
    lead: "The VFD is the box that powers the spindle. The controller tells it when and how fast to spin through a data cable.",
    do: [
      "Check the thick spindle cable is screwed onto the spindle and plugged into the VFD.",
      c.id === "slb-lite"
        ? "Plug the VFD data cable into the SPINDLE port (RJ12 jack) on the controller."
        : "Plug the VFD data cable (RS485) into the back of the controller, above the power switch. Not the front.",
      big
        ? "Plug the VFD into a 240 V outlet (NEMA 6-15), like a dryer or table-saw circuit."
        : "Plug the VFD into a wall outlet. Use a heavy-duty extension cord if you need one.",
      "Turn the VFD on first, then the controller.",
    ],
    check: ["The VFD display is on."],
    ports: ["rs485", "outlet"],
    caution: "Keep hands clear of the spindle from now on. It can start whenever the controller tells it to.",
    help: [
      "If the VFD shows r00.0 or F00.0, it isn't talking to the controller: check the data cable is in the back port, then power-cycle the VFD and the controller.",
      "Sienci's spindle configuration file sets the controller for the kit the first time. It's in the spindle kit resources.",
    ],
  };
}

/** Simulated console lines on connect (the real adapter shows the controller's actual reply). */
export function handshake(c: ControllerInfo, link: Link, port: string): string[] {
  return [
    link === "usb" ? `Opening ${port}…` : `Connecting to ${port}…`,
    c.firmware === "grblHAL" ? "[VER:1.1f.20240514:SLB]" : "Grbl 1.1h ['$' for help]",
    c.firmware === "grblHAL" ? "[OPT:VNMSL,35,1024,3,0]" : "[OPT:V,15,128]",
    "<Idle|MPos:0.000,0.000,0.000|FS:0,0>",
  ];
}

/** Port the simulated adapter "finds". */
export function fakePort(link: Link): string {
  if (link === "ethernet") return "192.168.5.1:23";
  const mac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
  return mac ? "/dev/tty.usbmodem14101" : "COM3";
}
