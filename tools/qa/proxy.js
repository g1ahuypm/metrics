// TCP proxy that adds a one-way delay to every chunk the database sends back (simulates network distance).
const net = require("net");
const DELAY = Number(process.env.DELAY || 0);
net.createServer((c) => {
  const s = net.connect({ path: "/tmp/.s.PGSQL.5433" });
  c.on("data", (d) => s.write(d));
  s.on("data", (d) => setTimeout(() => c.write(d), DELAY));
  c.on("error", () => s.destroy()); s.on("error", () => c.destroy());
  c.on("close", () => s.destroy()); s.on("close", () => c.destroy());
}).listen(5434, () => console.log("proxy delay", DELAY));
