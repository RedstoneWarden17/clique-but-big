const BASE_ID = 1771017710;
const BUTTON_COUNT = 100;

let socket = null;
let checked = new Set();
let inventory = new Set();

const $ = (id) => document.getElementById(id);

function buttonId(n) {
  return BASE_ID + n - 1;
}

function setStatus(text) {
  $("status").textContent = text;
}

function log(text) {
  $("log").textContent = text;
}

function renderBoard() {
  const board = $("board");
  board.replaceChildren();

  for (let n = 1; n <= BUTTON_COUNT; n++) {
    const id = buttonId(n);
    const button = document.createElement("button");

    button.className = "clique-button";
    button.textContent = n;
    button.title = `Button ${n} — AP ID ${id}`;

    if (checked.has(id)) {
      button.classList.add("checked");
      button.disabled = true;
    } else if (inventory.has(id)) {
      button.classList.add("ready");
      button.disabled = false;
      button.addEventListener("click", () => checkButton(n));
    } else {
      button.disabled = true;
    }

    board.appendChild(button);
  }

  $("progress").textContent = `${checked.size} / ${BUTTON_COUNT}`;
}

function checkButton(n) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;

  const id = buttonId(n);

  send([{
    cmd: "LocationChecks",
    locations: [id]
  }]);

  checked.add(id);
  renderBoard();
}

function send(payload) {
  socket.send(JSON.stringify(payload));
}

function connect() {
  if (socket && socket.readyState === WebSocket.OPEN) return;

  let server = $("server").value.trim();
  if (!server) return;

  // Archipelago clients normally use ws:// for direct room connections.
  // If the user enters a complete URL, preserve its protocol.
  let url = server;
  if (!server.startsWith("ws://") && !server.startsWith("wss://")) {
    url = `ws://${server}`;
  }

  setStatus("Connecting…");

  socket = new WebSocket(url);

  socket.addEventListener("open", () => {
    setStatus("Connected");
    log("Authenticating…");

    send([{
      cmd: "Connect",
      game: "Clique",
      name: $("slot").value.trim(),
      password: $("password").value || null,
      version: { major: 0, minor: 4, build: 0, class: "Version" },
      tags: ["WebHost", "Tracker"],
      items_handling: 7,
      slot_data: true
    }]);
  });

  socket.addEventListener("message", (event) => {
    const packets = JSON.parse(event.data);
    if (!Array.isArray(packets)) return;

    for (const packet of packets) {
      handlePacket(packet);
    }
  });

  socket.addEventListener("close", () => {
    setStatus("Disconnected");
    $("login-screen").classList.remove("hidden");
    $("game-screen").classList.add("hidden");
    socket = null;
  });

  socket.addEventListener("error", () => {
    setStatus("Connection error");
  });
}

function handlePacket(packet) {
  switch (packet.cmd) {
    case "RoomInfo":
      log(`Room: ${packet.seed_name || "Clique"}`);
      break;

    case "Connected":
      $("login-screen").classList.add("hidden");
      $("game-screen").classList.remove("hidden");

      if (Array.isArray(packet.checked_locations)) {
        checked = new Set(packet.checked_locations);
      }

      // Initial ReceivedItems can be present in the connected packet.
      if (Array.isArray(packet.received_items)) {
        for (const item of packet.received_items) {
          inventory.add(item.item);
        }
      }

      renderBoard();

      // Ask the server for its current inventory stream.
      send([{ cmd: "Sync" }]);
      break;

    case "ReceivedItems":
      if (Array.isArray(packet.items)) {
        for (const item of packet.items) {
          inventory.add(item.item);
        }
        renderBoard();
      }
      break;

    case "RoomUpdate":
      if (Array.isArray(packet.checked_locations)) {
        checked = new Set(packet.checked_locations);
        renderBoard();
      }
      break;

    case "Print":
      log(packet.text || "");
      break;

    case "PrintJSON":
      log(
        (packet.data || [])
          .map(x => typeof x === "string" ? x : x.text || "")
          .join("")
      );
      break;

    case "ConnectionRefused":
      setStatus(`Refused: ${(packet.errors || []).join(", ")}`);
      break;

    case "Bounced":
      log("Server bounce received.");
      break;

    default:
      console.debug("Clique packet:", packet);
  }
}

function disconnect() {
  if (socket) socket.close();
}

for (let n = 1; n <= BUTTON_COUNT; n++) {
  // IDs are generated dynamically in renderBoard().
}

$("connect").addEventListener("click", connect);
$("disconnect").addEventListener("click", disconnect);
renderBoard();
