const Database = require("./Database");
const { normalizarNumeroTelefono } = require("./utils");

async function manejarComandosDev(msgBody, numDestino, companyId, StateManager, client) {
    
    const devPhone = process.env.DEV_PHONE;
    if (devPhone) {
        const numLimpioDestino = normalizarNumeroTelefono(numDestino);
        const numLimpioDev = normalizarNumeroTelefono(devPhone);
        if (numLimpioDestino !== numLimpioDev) return false;
    }

    if (msgBody === "!dev ayuda") {
        const ayudaDev = `*PANEL DE CONTROL TÉCNICO*\n\n` +
            `*!dev estado*: Información técnica del usuario actual.\n` +
            `*!dev reentrenar*: Fuerza el reentrenamiento del motor NLU.\n` +
            `*!dev limpiar*: Resetea estados temporales/asistentes.\n` +
            `*!dev ayuda*: Muestra este panel de comandos.`;
        await client.sendMessage(numDestino, ayudaDev);
        return true;
    }

    if (msgBody === "!dev estado") {
        const cliente = await Database.getCliente(companyId, numDestino);
        let statusMsg = `*INFORME DE ESTADO TÉCNICO*\n\n`;
        
        if (cliente) {
            statusMsg += `*ID Base de Datos:* ${cliente.id}\n`;
            statusMsg += `*Idioma:* ${cliente.idioma.toUpperCase()}\n`;
            statusMsg += `*Último Ticket:* #${cliente.ultimo_ticket_id || "N/A"}\n`;
            statusMsg += `*Empresa:* ${companyId}`;
        } else {
            statusMsg += `*Estado:* El usuario no figura en la base de datos de clientes.`;
        }

        await client.sendMessage(numDestino, statusMsg);
        return true;
    }

    if (msgBody === "!dev reentrenar") {
        const fs = require("fs");
        const config = require("./config");
        if (fs.existsSync(config.MODEL_PATH)) {
            try { fs.unlinkSync(config.MODEL_PATH); } catch(e) {}
        }
        
        await client.sendMessage(numDestino, "*Iniciando reentrenamiento del motor NLU...*");
        const { configurarEntrenamiento } = require("./ia_bot");
        try {
            await configurarEntrenamiento();
            await client.sendMessage(numDestino, "*Reentrenamiento completado con éxito.*");
        } catch (e) {
            await client.sendMessage(numDestino, "*Error durante el proceso:* " + e.message);
        }
        return true;
    }

    if (msgBody === "!dev limpiar") {
        StateManager.limpiarWizardEditar(numDestino);
        await client.sendMessage(numDestino, "*Estados temporales y asistentes reseteados satisfactoriamente.*");
        return true;
    }

    return false;
}

module.exports = { manejarComandosDev };