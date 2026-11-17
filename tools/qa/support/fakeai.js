// Stand-in for the Claude Messages API: returns a structured decision based on the email text.
const http = require("http");
http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const j = JSON.parse(body || "{}");
    const user = (j.messages?.[0]?.content ?? "").toString();
    const latest = (user.match(/latest="true"[^>]*>([\s\S]*?)<\/message>/) || [])[1] || user;
    const name = (user.match(/Sender: (\w+)/) || [])[1] || "there";
    let d;
    if (/furious|scam|chargeback/i.test(latest)) {
      d = { category: "customer", notCustomerKind: "none", topic: "order_status", confidence: "medium", needsPerson: true, upset: true, needsPersonReason: "The customer is angry and mentions a chargeback", teamAction: "", summary: "Angry: order not received, threatens a chargeback", reply: `Hi ${name},\n\nI'm truly sorry about the wait. I am looking into your order right now and will write back today with an update.` };
    } else if (/puzzle|jigsaw/i.test(latest)) {
      d = { category: "customer", notCustomerKind: "none", topic: "none", confidence: "medium", needsPerson: true, upset: false, needsPersonReason: "The customer wants product details and a photo, which no article covers", teamAction: "", summary: "Wants a photo and details of the puzzle packet", reply: `Hi ${name},\n\nThank you for your message. The free gift with the Buy 2 offer is The Hundred Acre Wood Puzzle Packet. Could you check your parcel again for a separate packet?` };
    } else {
      d = { category: "customer", notCustomerKind: "none", topic: "order_status", confidence: "high", needsPerson: false, upset: false, needsPersonReason: "", teamAction: "", summary: "Asks where the order is", reply: `Hi ${name},\n\nThank you for reaching out. Your order is on its way and you will receive the tracking details by email shortly. Please check your Spam folder too.` };
    }
    res.writeHead(200, { "content-type": "application/json", "request-id": "req_local" });
    res.end(JSON.stringify({ id: "msg_local", type: "message", role: "assistant", model: j.model, content: [{ type: "text", text: JSON.stringify(d) }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }));
  });
}).listen(7778, "127.0.0.1", () => console.log("fake AI on 7778"));
