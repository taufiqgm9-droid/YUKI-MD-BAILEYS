const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys")

const P = require("pino")
const chalk = require("chalk")
const fs = require("fs")
const path = require("path")
const readline = require("readline")

const handler = require("./handler")

// ================= LOAD SETTINGS =================
const config = require("./settings")


console.clear()

// ================= INPUT =================
function question(text) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })
    return new Promise(resolve => rl.question(text, ans => {
        rl.close()
        resolve(ans)
    }))
}

// ================= LOAD PLUGINS =================
let plugins = []

function loadPlugins() {
    plugins = []

    const files = fs.readdirSync("./plugins").filter(f => f.endsWith(".js"))

    for (const file of files) {
        try {
            const filePath = path.join(__dirname, "plugins", file)

            delete require.cache[require.resolve(filePath)]
            const plugin = require(filePath)

            if (Array.isArray(plugin)) {
                plugins.push(...plugin)
            } else {
                plugins.push(plugin)
            }

            console.log(chalk.green("📦 Loaded:"), file)

        } catch (err) {
            console.log(chalk.red(`❌ Error load ${file}:`), err)
        }
    }

    console.log(chalk.yellow(`🚀 Total Plugins: ${plugins.length}\n`))
}

// ================= START =================
async function connectToWhatsApp() {
    console.log(chalk.yellow("🚀 Memulai bot...\n"))

    const { state, saveCreds } = await useMultiFileAuthState("./session")
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
        auth: state,
        logger: P({ level: "silent" }),
        version,
        browser: ["Windows", "Chrome", "120.0.0"], // 🔥 penting
        syncFullHistory: true,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000
    })

    // ================= PAIRING =================
    if (!sock.authState.creds.registered) {
        console.log(chalk.green("📱 Masukkan nomor diawali 62"))

        let phone = await question(chalk.cyan("Nomor: "))
        phone = phone.replace(/[^0-9]/g, "")

        // 🔥 delay biar stabil
        await new Promise(r => setTimeout(r, 8000))

        try {
            const code = await sock.requestPairingCode(phone)
            console.log(chalk.magenta(`🔑 Pairing Code: ${code}\n`))
        } catch (err) {
            console.log(chalk.red("❌ Gagal pairing:"), err)
        }
    }

    // ================= SAVE =================
    sock.ev.on("creds.update", saveCreds)

    // ================= CONNECTION =================
    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update

        console.log(chalk.gray("📡 Status:"), connection || "unknown")

        if (connection === "open") {
            console.log(chalk.green("✅ Bot Connected!\n"))
            loadPlugins()
        }

        if (connection === "close") {
            const reason = lastDisconnect?.error?.output?.statusCode

            console.log(chalk.red("❌ Connection closed:", reason))

            if (reason === DisconnectReason.loggedOut) {
                console.log(chalk.red("❌ Session habis, hapus folder session"))
            } else {
                console.log(chalk.yellow("🔄 Reconnecting...\n"))
                connectToWhatsApp()
            }
        }
    })

    // ================= MESSAGE =================
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message) return

        console.log(chalk.white("📩 Message masuk"))

        await handler(sock, msg, plugins)
    })
}

// ================= RUN =================
connectToWhatsApp()