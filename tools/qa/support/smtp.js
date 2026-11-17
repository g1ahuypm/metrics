// Minimal SMTP catcher: accepts AUTH and mail, writes each message to sent/.
const net = require("net"), fs = require("fs"), path = require("path");
const dir = path.join(__dirname, "sent"); fs.mkdirSync(dir, { recursive: true });
net.createServer((s) => {
  let data = false, buf = "", msg = "";
  s.write("220 local ESMTP\r\n");
  s.on("data", (chunk) => {
    buf += chunk.toString("latin1");
    let i;
    while ((i = buf.indexOf("\r\n")) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (data) {
        if (line === ".") { data = false; fs.writeFileSync(path.join(dir, Date.now() + ".eml"), msg); msg = ""; s.write("250 OK queued\r\n"); }
        else msg += line.replace(/^\.\./, ".") + "\r\n";
        continue;
      }
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === "EHLO") s.write("250-local\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n");
      else if (cmd === "HELO") s.write("250 local\r\n");
      else if (cmd === "AUTH") { if (/PLAIN \S+/i.test(line)) s.write("235 ok\r\n"); else if (/LOGIN/i.test(line)) { s.write("334 VXNlcm5hbWU6\r\n"); s._login = 1; } else s.write("334 \r\n"); }
      else if (s._login === 1) { s._login = 2; s.write("334 UGFzc3dvcmQ6\r\n"); }
      else if (s._login === 2) { s._login = 0; s.write("235 ok\r\n"); }
      else if (cmd === "DATA") { data = true; s.write("354 go\r\n"); }
      else if (cmd === "QUIT") { s.write("221 bye\r\n"); s.end(); }
      else s.write("250 OK\r\n");
    }
  });
  s.on("error", () => {});
}).listen(2525, "127.0.0.1", () => console.log("smtp on 2525"));
