require("dotenv").config();
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { companiesData } = require("./companies_config");
const Database = require("./Database");
const StateManager = require("./StateManager");
const { configurarEntrenamiento } = require("./ia_bot");
const { handleAgentCommands } = require("./AgentManager");
const { manejarComandosDev } = require("./DevManager");
const { handleTicketIntent } = require("./TicketIntentResolver");
const { procesarEnvioMensajes } = require("./MessageSender");
const { iniciarWorkerOffline } = require("./OfflineQueue");
const TicketReminderWorker = require("./TicketReminderWorker");
const SatisfactionSurveyWorker = require("./SatisfactionSurveyWorker");
const config = require("./config");
const { 
    limpiarBloqueosChromium,
    eliminarProcesosHuerfanos,
    esIdiomaIngles,
    esAdmin,
    comprobarHorarioAtencion,
    inicializarDirectorios,
    procesarAdjuntoCliente
} = require("./utils");

async function main() {
    console.log("Iniciando Sistema de Soporte Automatico...");

    try {
        eliminarProcesosHuerfanos();
        await Database.init();
        inicializarDirectorios();
        await configurarEntrenamiento();

        console.log(`\nCargando ${companiesData.length} configuraciones de empresa...`);
        for (const company of companiesData) {
            await Database.registrarEmpresa(
                company.id, 
                company.nombre, 
                company.horario_inicio, 
                company.horario_fin, 
                company.tiempo_respuesta_objetivo
            );
        }
        
        await Database.seedDummyAgents();
        
        
        if (companiesData.length > 0) {
            await iniciarSesionEmpresa(companiesData[0]);
        }
        
        console.log("\nServicio activo y esperando clientes.");
    } catch (err) {
        console.error("(CRÍTICO) Error fatal en el arranque:", err.message);
        process.exit(1);
    }
}

async function iniciarSesionEmpresa(company) {
    const sessionId = company.id;
    limpiarBloqueosChromium(sessionId);

    const client = new Client({
        authStrategy: new LocalAuth({ clientId: sessionId }),
        puppeteer: { 
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
            handleSIGINT: false,
            handleSIGTERM: false,
            handleSIGHUP: false
        }
    });

    client.on("qr", (qr) => qrcode.generate(qr, { small: true }));

    client.on("ready", () => {
        console.log(`\n(LISTO) ${company.nombre} conectado y esperando mensajes.`);
        TicketReminderWorker.iniciar(client, company.id, company);
        SatisfactionSurveyWorker.iniciar(client, company.id);
        iniciarWorkerOffline(client, company);
    });

    client.on("message", async (message) => {
        try {
            await manejarMensaje(client, message, company);
        } catch (err) {
            console.error(`(ERROR) Fallo procesando mensaje entrante:`, err.message);
        }
    });

    client.initialize().catch(err => {
        if (err.message.includes("browser is already running")) {
            console.error(`\n(ERROR DE SESION) El navegador ya esta en uso.`);
            console.error(`Esto ocurre porque el bot no se cerro bien o hay otra ventana abierta.`);
            console.error(`SOLUCION: Cierra Chrome/Chromium en el Administrador de Tareas o borra la carpeta: .wwebjs_auth/session-${sessionId}`);
        } else {
            console.error(`(ERROR) Error al conectar con WhatsApp:`, err.message);
        }
    });
}

async function manejarMensaje(client, message, company) {
    const chatId = message.from;
    let body = (message.body || "").trim();
    const companyId = company.id;

    if (chatId.includes("@g.us") || chatId === "status@broadcast") return;
    
    if (StateManager.yaProcesado(message.id._serialized)) return;

    if (!body && !message.hasMedia) return;
    if (!body && message.hasMedia) body = "(Adjunto)";

    const chat = await message.getChat();
    const isEnglish = esIdiomaIngles(body);

    let esAdministrador = esAdmin(chatId, company);
    if (!esAdministrador) {
        try {
            const contact = await message.getContact();
            if (contact && contact.number) esAdministrador = esAdmin(contact.number, company);
        } catch (e) { }
    }

    console.log(`[DEBUG] Remitente: ${chatId} | EsAdmin: ${esAdministrador}`);

    if (esAdministrador) {
        const handledByAgent = await handleAgentCommands(client, message, chat, company);
        if (handledByAgent) return;
    }

    const handledByDev = await manejarComandosDev(body, chatId, companyId, StateManager, client);
    if (handledByDev) return;

    if (!comprobarHorarioAtencion({ inicio: company.horario_inicio, fin: company.horario_fin })) {
        await Database.agregarMensajeCola(companyId, chatId, body);
        return;
    }

    const contact = await message.getContact();
    await Database.registrarCliente(companyId, chatId, contact.number, contact.pushname || chatId.split("@")[0], isEnglish ? "en" : "es");

    let rutaAdjunto = null;
    if (message.hasMedia) {
        try {
            const media = await message.downloadMedia();
            if (media) {
                rutaAdjunto = await procesarAdjuntoCliente(media, chatId, companyId);
            }
        } catch (e) {
            console.error('   (ERROR) Fallo descargando archivo:', e.message);
        }
    }

    const responses = await handleTicketIntent(company, chatId, body, isEnglish);
    
    if (rutaAdjunto && rutaAdjunto.includes(config.TEMP_PATH)) {
        const nuevoTicketId = StateManager.getUltimoTicket(chatId);
        if (nuevoTicketId) {
            const fs = require("fs");
            const path = require("path");
            
            const ticketFolder = path.join(config.ATTACHMENTS_PATH, `ticket_${nuevoTicketId}`);
            if (!fs.existsSync(ticketFolder)) fs.mkdirSync(ticketFolder, { recursive: true });
            
            const finalPath = path.join(ticketFolder, path.basename(rutaAdjunto));
            await fs.promises.rename(rutaAdjunto, finalPath);
            await Database.agregarAdjuntoTicket(nuevoTicketId, finalPath);
        }
    }

    if (responses && responses.length > 0) {
        await procesarEnvioMensajes(client, chat, responses, Date.now());
    }
}

process.on("uncaughtException", (err) => console.error(`(FATAL) Excepción no controlada:`, err));
process.on("unhandledRejection", (reason) => console.error(`(FATAL) Promesa no controlada:`, reason));

main();
