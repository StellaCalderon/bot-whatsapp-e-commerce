const fs = require("fs");
const path = require("path");
const franc = require("franc-min");
const config = require("./config");

const esperarAsync = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const normalizarTexto = (texto) => {
    if (!texto) return "";
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

function comprobarHorarioAtencion(horarioAtencion) {
    const ahora = new Date();
    const minutosActuales = ahora.getHours() * 60 + ahora.getMinutes();

    const parseHoraAMinutos = (horaString) => {
        const [horas, minutos] = horaString.split(":").map(Number);
        return (horas * 60) + minutos;
    };

    const minInicio = parseHoraAMinutos(horarioAtencion.inicio || config.HORARIO_24H_INICIO || "00:00");
    const minFin = parseHoraAMinutos(horarioAtencion.fin || config.HORARIO_24H_FIN || "23:59");

    if (minInicio <= minFin) {
        return minutosActuales >= minInicio && minutosActuales < minFin;
    } else {
        return minutosActuales >= minInicio || minutosActuales < minFin;
    }
}

function esIdiomaIngles(texto) {
    if (!texto) return false;
    const txtLower = normalizarTexto(texto).toLowerCase();
    const markersEs = ["hola", "gracias", "ayuda", "problema", "ticket", "soporte", "cuenta", "factura", "pago", "tecnico"];
    const tokens = txtLower.replace(/[^\w\s]/g, "").split(/\s+/);

    if (tokens.some(t => markersEs.includes(t))) return false;

    const markersEn = ["hello", "hi", "price", "where", "thanks", "thank", "bye", "help", "issue", "ticket", "support", "account", "billing", "technical"];
    const tieneMarkerEn = tokens.some(t => markersEn.includes(t));

    if (texto.length < 25 && !tieneMarkerEn) return false;

    if (texto.length >= 30) {
        const idiomaDetectado = franc(texto, { minLength: 10 });
        if (idiomaDetectado === 'eng') {
            if (!tieneMarkerEn && texto.length < 60) return false;
            return true;
        }
    }
    return tieneMarkerEn;
}

const normalizarNumeroTelefono = (num) => {
    if (!num) return "";
    let limpio = num.toString().replace(/\D/g, "");
    if (limpio.length === 9) limpio = "34" + limpio;
    return limpio;
};

function esAdmin(senderId, companyConfig) {
    if (!senderId) return false;

    const idBruto = senderId.split("@")[0];
    const numNormalizado = normalizarNumeroTelefono(idBruto);

    const adminsEmpresa = (companyConfig.agentes || []).map(a => normalizarNumeroTelefono(a.telefono.toString()));
    const globalAdmin = process.env.GLOBAL_ADMIN_NUMBER;
    const adminsGlobales = globalAdmin ? [normalizarNumeroTelefono(globalAdmin)] : [];

    return adminsEmpresa.includes(numNormalizado) || adminsGlobales.includes(numNormalizado);
}

function limpiarBloqueosChromium(sessionId) {
    const rutaSesion = path.join(__dirname, ".wwebjs_auth", `session-${sessionId}`);
    if (!fs.existsSync(rutaSesion)) return;

    const carpetasABuscar = [rutaSesion, path.join(rutaSesion, "Default")];
    const archivosABorrar = ["SingletonLock", "lockfile", "DevToolsActivePort", "SingletonSocket", "SingletonCookie"];

    carpetasABuscar.forEach(carpeta => {
        if (!fs.existsSync(carpeta)) return;
        archivosABorrar.forEach(archivo => {
            const rutaArchivo = path.join(carpeta, archivo);
            if (fs.existsSync(rutaArchivo)) {
                try {
                    fs.unlinkSync(rutaArchivo);
                } catch (e) {

                }
            }
        });
    });
}


function eliminarProcesosHuerfanos() {
    if (process.platform !== "win32") return;
    try {
        const { execSync } = require("child_process");

        execSync('taskkill /F /FI "WINDOWTITLE eq about:blank*" /IM chrome.exe /T', { stdio: 'ignore' });
    } catch (e) {

    }
}



function inicializarDirectorios() {
    [config.ATTACHMENTS_PATH, config.TEMP_PATH].forEach(dir => {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
}



async function procesarAdjuntoCliente(media, chatId, companyId) {
    const Database = require("./Database");
    const fsp = fs.promises;

    const extension = media.mimetype.split("/")[1] || "bin";
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;
    const tempFilePath = path.join(config.TEMP_PATH, fileName);

    await fsp.writeFile(tempFilePath, media.data, { encoding: "base64" });

    const ticketExistente = await Database.obtenerUltimoTicketAbierto(companyId, chatId);
    if (ticketExistente) {
        const ticketFolder = path.join(config.ATTACHMENTS_PATH, `ticket_${ticketExistente.id}`);
        if (!fs.existsSync(ticketFolder)) await fsp.mkdir(ticketFolder, { recursive: true });

        const finalPath = path.join(ticketFolder, fileName);
        await fsp.rename(tempFilePath, finalPath);
        await Database.agregarAdjuntoTicket(ticketExistente.id, finalPath);
        return finalPath;
    }

    return tempFilePath;
}

module.exports = {
    esperarAsync,
    limpiarBloqueosChromium,
    eliminarProcesosHuerfanos,
    esIdiomaIngles,
    normalizarNumeroTelefono,
    comprobarHorarioAtencion,
    normalizarTexto,
    esAdmin,
    inicializarDirectorios,
    procesarAdjuntoCliente,
    validarID: (id) => /^\d+$/.test(id.toString())
};
