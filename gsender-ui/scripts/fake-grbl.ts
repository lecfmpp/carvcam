// Fake grbl controller on the network (like the SLB over Ethernet, port 23), to test CarvCAM
// without a machine:  npx vite-node scripts/fake-grbl.ts [port] [grblHAL|grbl]
// Then, in the Connect assistant, choose Ethernet and the IP 127.0.0.1 (port 2323 by default).
import net from "node:net";
import { FakeGrbl } from "../src/machine/grbl/fake";

const port = Number(process.argv[2] ?? 2323);
const kind = (process.argv[3] as "grblHAL" | "grbl") ?? "grblHAL";
net
  .createServer((sock) => {
    const fake = new FakeGrbl(kind);
    fake.mpos = { x: -400, y: -400, z: -10 };
    fake.onData((t) => sock.write(Buffer.from(t, "latin1")));
    void fake.open();
    sock.on("data", (b) => {
      for (const ch of b.toString("latin1").match(/[?!~\x18\x80-\xff]|[^?!~\x18\x80-\xff]+/g) ?? []) void fake.write(ch);
    });
    sock.on("close", () => void fake.close());
    console.log(`[fake-grbl] client connected`);
  })
  .listen(port, "127.0.0.1", () => console.log(`[fake-grbl] ${kind} on 127.0.0.1:${port}`));
